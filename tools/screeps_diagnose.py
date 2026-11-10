"""Read-only Screeps diagnostics. Python 3.10+, standard library only.

No POST, console execution, branch switching, credentials on disk, or browser access.
Official-host HTTP endpoints are not a stable documented public Web API.
"""
import argparse
import base64
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import re
import sys
from datetime import datetime, timezone
import urllib.error
import urllib.parse
import urllib.request

BASE = "https://screeps.com"
ALLOWED = {"/api/user/code", "/api/user/memory", "/api/game/time"}
MAX_BYTES = 12 * 1024 * 1024


class DiagnosticError(Exception):
    def __init__(self, code, endpoint=None, status=None):
        self.code, self.endpoint, self.status = code, endpoint, status

    def report(self):
        return {k: v for k, v in {"code": self.code, "endpoint": self.endpoint,
                                   "httpStatus": self.status}.items() if v is not None}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Never forward X-Token to a redirected host.
        raise DiagnosticError("REDIRECT_REFUSED", urllib.parse.urlsplit(req.full_url).path, code)


class Client:
    def __init__(self, token, shard, timeout=15, opener=None):
        if not token:
            raise DiagnosticError("MISSING_SCREEPS_TOKEN")
        if not shard or not re.fullmatch(r"[A-Za-z0-9_-]{1,32}", shard):
            raise DiagnosticError("MISSING_OR_INVALID_SCREEPS_SHARD")
        self.token, self.shard, self.timeout = token, shard, timeout
        self.opener = opener or urllib.request.build_opener(NoRedirect())

    def get(self, endpoint, **params):
        if endpoint not in ALLOWED:
            raise DiagnosticError("ENDPOINT_NOT_ALLOWED")
        params["shard"] = self.shard
        headers = {"Accept": "application/json"}
        if endpoint != "/api/game/time":
            headers["X-Token"] = self.token
        request = urllib.request.Request(BASE + endpoint + "?" + urllib.parse.urlencode(params), headers=headers, method="GET")
        try:
            with self.opener.open(request, timeout=self.timeout) as response:
                raw = response.read(MAX_BYTES + 1)
        except DiagnosticError:
            raise
        except urllib.error.HTTPError as error:
            # Do not print request headers, response body, redirect URL, or server text.
            code = {401: "AUTHENTICATION_FAILED", 403: "ENDPOINT_PERMISSION_DENIED",
                    429: "RATE_LIMITED", 404: "ENDPOINT_UNAVAILABLE"}.get(error.code, "HTTP_ERROR")
            raise DiagnosticError(code, endpoint, error.code) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise DiagnosticError("NETWORK_OR_TIMEOUT", endpoint) from None
        if len(raw) > MAX_BYTES:
            raise DiagnosticError("RESPONSE_TOO_LARGE", endpoint)
        try:
            data = json.loads(raw)
        except (ValueError, UnicodeError):
            raise DiagnosticError("INVALID_JSON_RESPONSE", endpoint) from None
        if not isinstance(data, dict) or data.get("ok") != 1 or data.get("error"):
            raise DiagnosticError("API_REJECTED_RESPONSE", endpoint)
        return data


def decode_memory(data):
    if data is None:
        raise DiagnosticError("EXPANSION_MEMORY_ABSENT")
    if isinstance(data, dict):
        return data
    if not isinstance(data, str):
        raise DiagnosticError("INVALID_MEMORY_FORMAT")
    try:
        if data.startswith("gz:"):
            zipped = base64.b64decode(data[3:], validate=True)
            with gzip.GzipFile(fileobj=io.BytesIO(zipped)) as stream:
                decoded = stream.read(MAX_BYTES + 1)
            if len(decoded) > MAX_BYTES:
                raise DiagnosticError("DECOMPRESSED_MEMORY_TOO_LARGE")
            result = json.loads(decoded)
        else:
            result = json.loads(data)
    except (ValueError, OSError, EOFError, UnicodeError):
        raise DiagnosticError("MEMORY_DECODE_FAILED") from None
    if not isinstance(result, dict):
        raise DiagnosticError("INVALID_MEMORY_OBJECT")
    return result


def fingerprint(modules):
    if not isinstance(modules, dict) or not all(isinstance(v, str) for v in modules.values()):
        raise DiagnosticError("INVALID_CODE_MODULES")
    canonical = json.dumps({k: v.replace("\r\n", "\n") for k, v in sorted(modules.items())},
                           ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def live_capture(client, code_dir=None, expected_branch="agent-test"):
    result = {"source": "screeps-http-get", "shard": client.shard, "errors": [],
              "activeCode": {"branch": None}, "expansion": {}, "serverTick": None}
    for name, endpoint, params in [("activeCode", "/api/user/code", {"branch": "$activeWorld"}),
                                   ("expansion", "/api/user/memory", {"path": "expansion"}),
                                   ("serverTick", "/api/game/time", {})]:
        try:
            data = client.get(endpoint, **params)
            if name == "expansion":
                result[name] = decode_memory(data.get("data"))
            elif name == "serverTick":
                if not isinstance(data.get("time"), int):
                    raise DiagnosticError("INVALID_SERVER_TICK", endpoint)
                result[name] = data["time"]
            else:
                modules = data.get("modules")
                result[name] = {"branch": data.get("branch"), "sha256": fingerprint(modules),
                                "matchesExpectedBranch": data.get("branch") == expected_branch}
                marker = re.search(r"buildId\s*:\s*['\"]([^'\"]{1,100})['\"]", modules.get("expansion.version", ""))
                result[name]["buildId"] = marker.group(1) if marker else None
                if code_dir:
                    if not Path(code_dir).is_dir():
                        raise DiagnosticError("LOCAL_CODE_DIRECTORY_NOT_FOUND")
                    local = {p.stem: p.read_text(encoding="utf-8") for p in Path(code_dir).glob("*.js")}
                    result[name]["matchesLocalCode"] = bool(local) and fingerprint(local) == result[name]["sha256"]
        except DiagnosticError as error:
            result["errors"].append(error.report())
    return result


def sanitize(value, token=None):
    if isinstance(value, dict):
        return {k: ("[REDACTED]" if re.search(r"token|cookie|authorization|password|secret", k, re.I)
                    else sanitize(v, token)) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize(v, token) for v in value]
    if isinstance(value, str):
        if token:
            value = value.replace(token, "[REDACTED]")
        return re.sub(r"(?i)(?:bearer\s+|x-token\s*[:=]\s*|cookie\s*[:=]\s*)[^\s,;]+", "[REDACTED]", value)
    return value


def build_report(captures, home="E22S36", target="E22S37", max_tick_age=100):
    shards = {c.get("shard") for c in captures if c.get("shard")}
    if len(shards) > 1:
        raise DiagnosticError("MIXED_SHARD_SNAPSHOTS")
    def capture_tick(capture):
        return capture.get("tick") or capture.get("expansion", {}).get("observation", {}).get("tick") or capture.get("expansion", {}).get("lastRunAt") or 0
    captures = sorted(captures, key=capture_tick)
    report = {"schema": 1, "generatedAt": datetime.now(timezone.utc).isoformat(),
              "homeRoom": home, "targetRoom": target, "activeCode": {"branch": None},
              "sources": [], "facts": {}, "checks": [], "unknown": [], "errors": [],
              "consistency": "Fields combine latest available captures; different ticks are not an atomic game snapshot"}
    observation, expansion = {}, {}
    def check(code, evidence, severity="warning"):
        report["checks"].append({"code": code, "severity": severity, "evidence": evidence})
    for capture in captures:
        report["sources"].append({"kind": capture.get("source", "user-console"),
                                   "tick": capture.get("tick"), "shard": capture.get("shard")})
        report["errors"].extend(capture.get("errors", []))
        if capture.get("activeCode"):
            report["activeCode"] = capture["activeCode"]
        if capture.get("expansion"):
            expansion = capture["expansion"]
        current = expansion.get("observation", {})
        if capture.get("schema") == 1 and "rooms" in capture:
            current = capture
        if current:
            observation.update(current)
        if capture.get("cpu"):
            observation["cpu"] = capture["cpu"]
        rooms = observation.setdefault("rooms", {})
        if capture.get("home"):
            rooms.setdefault(home, {}).update(capture["home"])
        if "target" in capture:
            rooms[target] = dict(capture["target"] or {"visible": False})
        if "pioneers" in capture:
            report["facts"]["pioneers"] = capture["pioneers"]
        if "population" in capture:
            observation["population"] = capture["population"]
        if "spawns" in capture:
            observation["spawns"] = capture["spawns"]
        if capture.get("serverTick") is not None and current.get("tick") is not None:
            report["facts"]["observationAgeTicks"] = capture["serverTick"] - current["tick"]
        if capture.get("tick") is not None:
            report["facts"]["latestSnapshotTick"] = capture["tick"]
    report["facts"]["runtimeBuildId"] = observation.get("buildId")
    report["facts"]["runtimeSnapshotTick"] = observation.get("tick")
    report["facts"]["rooms"] = observation.get("rooms", {})
    report["facts"]["cpu"] = observation.get("cpu")
    report["facts"]["spawns"] = observation.get("spawns")
    report["facts"]["task"] = expansion.get("tasks", {}).get(f"{home}:{target}") or observation.get("tasks", {}).get(f"{home}:{target}")
    report["facts"]["supportWait"] = expansion.get("supportWait") or observation.get("supportWait")
    report["facts"]["lastError"] = expansion.get("lastError") or observation.get("lastError")
    limits = observation.get("limits", {})
    if observation.get("creeps") is not None:
        report["facts"]["pioneers"] = [c for c in observation["creeps"] if c.get("role") == "expansionPioneer"]
        observation["population"] = [c for c in observation["creeps"] if c.get("home") == home and not c.get("task")]
    population = observation.get("population")
    if population is not None:
        workers = [c for c in population if c.get("role") == "worker"]
        healthy = [c for c in workers if not c.get("spawning") and c.get("ttl", 0) >= limits.get("minHomeWorkerTtl", 150) and
                   c.get("work", 0) > 0 and c.get("carry", 0) > 0 and c.get("move", 0) > 0]
        report["facts"]["homePopulation"] = {"workers": len(workers), "healthyWorkers": len(healthy),
                                             "healthyWorkParts": sum(c["work"] for c in healthy)}
    rooms = report["facts"]["rooms"]
    target_data, home_data = rooms.get(target, {}), rooms.get(home, {})
    spawns = target_data.get("spawnCount", target_data.get("spawns"))
    pioneers = report["facts"].get("pioneers")
    if target_data.get("owned") and spawns == 0 and pioneers == []:
        check("OWNED_ROOM_WITHOUT_SPAWN_OR_PIONEER", {"target": target, "sites": target_data.get("sites")}, "critical")
    if target_data.get("visible") is False:
        check("TARGET_VISION_UNAVAILABLE", {"target": target})
    task = report["facts"].get("task") or {}
    reserve = limits.get("minHomeEnergyReserve", 300)
    required = (task.get("supportCheck") or {}).get("required", 250 + reserve)
    if home_data.get("energy") is not None and home_data["energy"] < required:
        check("PIONEER_ENERGY_BELOW_REQUIRED", {"energy": home_data["energy"], "required": required, "reserve": reserve})
    known_population = report["facts"].get("homePopulation")
    if known_population is not None and (known_population["healthyWorkers"] < limits.get("minEmergencyHomeWorkers", 2) or
                                        known_population["healthyWorkParts"] < limits.get("minEmergencyWorkParts", 6)):
        check("HOME_CRITICAL_WORKFORCE_LOW", known_population)
    cpu = observation.get("cpu") or {}
    if cpu.get("bucket") is not None and cpu["bucket"] < limits.get("minCpuBucket", 1000):
        check("CPU_BUCKET_LOW", cpu)
    if cpu.get("used") is not None and cpu.get("limit") and cpu["used"] >= cpu["limit"] * limits.get("maxCpuFraction", 0.75):
        check("CPU_SOFT_BUDGET_REACHED", cpu)
    for unit in pioneers or []:
        action = unit.get("lastAction") or {}
        if action.get("code") in ["NO_PATH", "REPATH_EXHAUSTED", "PIONEER_EXCEPTION", "NO_REACHABLE_HARVEST_SLOT", "TARGET_NOT_OWNED"]:
            check("PIONEER_ACTION_BLOCKED", {"name": unit.get("name"), "lastAction": action})
    if task.get("status") in ["blocked", "failed"]:
        check("TASK_BLOCKED", {"status": task["status"], "reason": task.get("failureReason")}, "critical")
    if task.get("supportResult") in ["SUPPORT_BUDGET_EXHAUSTED", "SUPPORT_SPAWN_ERRORS_EXHAUSTED", "VISION_RECOVERY_LIMIT_OR_COOLDOWN"]:
        check("SUPPORT_LIMIT_RECORDED", {"reason": task["supportResult"], "supportCheck": task.get("supportCheck")})
    wait = report["facts"].get("supportWait")
    tick = observation.get("tick") or report["facts"].get("latestSnapshotTick")
    if wait and tick is not None:
        check("LAST_RECORDED_SUPPORT_WAIT", {**wait, "ageTicks": tick - wait.get("tick", tick)}, "info")
    if report["facts"].get("lastError"):
        check("RUNTIME_EXCEPTION_RECORDED", report["facts"]["lastError"], "critical")
    if task.get("lastError"):
        check("TASK_EXCEPTION_RECORDED", task["lastError"], "critical")
    if report["activeCode"].get("buildId") and report["activeCode"]["buildId"] != observation.get("buildId"):
        check("ACTIVE_BUILD_NOT_OBSERVED_IN_RUNTIME", {"activeBuildId": report["activeCode"]["buildId"], "runtimeBuildId": observation.get("buildId")})
    age = report["facts"].get("observationAgeTicks")
    if age is not None and age > max_tick_age:
        check("STALE_RUNTIME_OBSERVATION", {"ageTicks": age, "limit": max_tick_age})
    if not report["activeCode"].get("branch"):
        report["unknown"].append("Active game branch: requires GET /api/user/code with $activeWorld; Console Memory does not prove agent-test is active")
    elif report["activeCode"].get("matchesExpectedBranch") is False:
        check("UNEXPECTED_ACTIVE_CODE_BRANCH", report["activeCode"])
    if not observation.get("buildId"):
        report["unknown"].append("Runtime build marker absent; existing PR #1 does not publish the new observer")
    if not target_data:
        report["unknown"].append("Live target objects unavailable; Memory task state alone does not prove a current Spawn site exists")
    if pioneers is None:
        report["unknown"].append("Current live Pioneer count unavailable; Memory.creeps may contain stale names")
    report["unknown"].append("Historical Console logs are not read by these GET endpoints; only persisted diagnostics and supplied Console snapshots are reported")
    report["status"] = "partial" if report["errors"] or report["unknown"] else "observed"
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", action="append", default=[], help="JSON file from read-only Console; repeat to combine timed snapshots")
    parser.add_argument("--live", action="store_true", help="Also query API when snapshots are supplied")
    parser.add_argument("--shard", default=os.environ.get("SCREEPS_SHARD"))
    parser.add_argument("--expected-branch", default="agent-test")
    parser.add_argument("--code-dir", help="Optional local code directory for exact normalized module fingerprint comparison")
    parser.add_argument("--home", default="E22S36")
    parser.add_argument("--target", default="E22S37")
    parser.add_argument("--fail-on-alert", action="store_true")
    args, unknown = parser.parse_known_args(argv)
    token = os.environ.get("SCREEPS_TOKEN")
    try:
        if unknown:
            raise DiagnosticError("UNSUPPORTED_ARGUMENTS_USE_ENV_FOR_CREDENTIALS")
        if not all(re.fullmatch(r"[WE]\d+[NS]\d+", room) for room in [args.home, args.target]):
            raise DiagnosticError("INVALID_ROOM_NAME")
        captures = []
        if args.live or not args.snapshot:
            try:
                captures.append(live_capture(Client(token, args.shard), args.code_dir, args.expected_branch))
            except DiagnosticError as error:
                captures.append({"source": "screeps-http-get", "errors": [error.report()]})
        for filename in args.snapshot:
            try:
                raw = Path(filename).read_text(encoding="utf-8-sig")
                if len(raw.encode("utf-8")) > MAX_BYTES:
                    raise DiagnosticError("SNAPSHOT_TOO_LARGE")
                data = json.loads(raw)
                if isinstance(data, str):
                    data = json.loads(data)  # JSON.stringify copied as a quoted Console string
                if not isinstance(data, dict):
                    raise DiagnosticError("INVALID_SNAPSHOT_OBJECT")
                captures.append(data)
            except (OSError, ValueError, UnicodeError):
                raise DiagnosticError("SNAPSHOT_READ_OR_JSON_FAILED") from None
        report = build_report(captures, args.home, args.target)
    except DiagnosticError as error:
        report = {"status": "error", "errors": [error.report()]}
    except Exception as error:
        report = {"status": "error", "errors": [{"code": "UNEXPECTED_DIAGNOSTIC_ERROR", "type": type(error).__name__}]}
    print(json.dumps(sanitize(report, token), ensure_ascii=False, indent=2))
    if report.get("errors"):
        return 2
    if args.fail_on_alert and any(c["severity"] in ["warning", "critical"] for c in report.get("checks", [])):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
