"""Build a read-only E22S36 baseline and simulate hauling, Extensions and Links."""
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
from math import ceil
from pathlib import Path

from screeps_analyze import counter_delta, load_history, time_of
from screeps_home_layout import RoomGrid, distance, extension_plan, mining_stands, path_from, point

CARRY_CAPACITY = 50
LINK_LOSS_PERCENT = 3
PART_LIMIT = 50
DETAIL_FIELDS = {
    "source": "Source harvest amounts, full ticks, adjacent WORK and harvest actor observations",
    "worker": "Worker harvest/delivery/build/upgrade events by role",
    "spawn": "Spawn busy/observed ticks and refill attribution",
    "layout": "Terrain, minerals, structure/site coordinates and RCL limits",
    "traffic": "Route-level congestion and real round-trip travel times",
    "link": "Per-Link sends, cooldown and eligible-to-send ticks",
    "delivery": "Actual energy deposited into a designated sink by role",
}


def ratio(amount, covered):
    return None if amount is None or not covered else amount / covered


def monotonic_delta(rows, field):
    if any(not row or not row.get("epoch") for row in rows):
        return None
    changes = [counter_delta(first, second, field) for first, second in zip(rows, rows[1:])]
    return sum(changes) if changes and all(change is not None for change in changes) else None


def baseline(samples, room_name, now):
    timed = sorted((s for s in samples if time_of(s) is not None), key=time_of)
    if not timed:
        return {"status": "unavailable", "missing": DETAIL_FIELDS}, None

    def fresh(sample):
        facts = sample.get("facts") or {}
        active = sample.get("activeCode") or {}
        age = facts.get("observationAgeTicks")
        return (not sample.get("errors") and bool(active.get("sha256"))
                and bool(active.get("buildId")) and active.get("buildId") == facts.get("runtimeBuildId")
                and type(age) is int and 0 <= age <= 100 and type(facts.get("runtimeSnapshotTick")) is int
                and facts.get("rooms", {}).get(room_name, {}).get("owned") is True)

    def identity(sample):
        active = sample["activeCode"]
        sources = sample.get("sources") or []
        shard = next((source.get("shard") for source in sources if source.get("shard")), None)
        return active.get("branch"), active["buildId"], active["sha256"], shard

    latest = next((s for s in reversed(timed) if fresh(s)), None)
    if latest is None:
        return {"status": "unavailable", "reason": "NO_FRESH_MATCHING_BUILD", "missing": DETAIL_FIELDS}, None
    window = [latest]
    for sample in reversed(timed):
        if (fresh(sample) and identity(sample) == identity(latest)
                and time_of(window[-1]) - time_of(sample) >= 1800
                and sample["facts"]["runtimeSnapshotTick"] < window[-1]["facts"]["runtimeSnapshotTick"]):
            window.append(sample)
            if len(window) >= 3 and time_of(latest) - time_of(sample) >= 7200:
                break
    window.reverse()
    span = time_of(latest) - time_of(window[0])
    report_age = now.timestamp() - time_of(latest)
    timely = latest is timed[-1] and 0 <= report_age <= 7200
    trend = len(window) >= 3 and span >= 7200
    report = {
        "status": "current" if timely else "historical",
        "activeCode": latest["activeCode"],
        "lastSuccessfulSampleAt": latest.get("collectedAt", latest.get("generatedAt")),
        "lastAttemptAt": timed[-1].get("collectedAt", timed[-1].get("generatedAt")),
        "sampleWallAgeSeconds": round(report_age),
        "observationAgeTicksAtCapture": latest["facts"]["observationAgeTicks"],
        "sampleSpanSeconds": round(span),
        "comparableWindowReady": trend,
        "samples": [],
        "missing": dict(DETAIL_FIELDS),
    }
    for sample in window:
        facts = sample["facts"]
        home = facts["rooms"][room_name]
        report["samples"].append({
            "time": sample.get("collectedAt", sample.get("generatedAt")),
            "tick": facts["runtimeSnapshotTick"],
            "energy": home.get("energy"),
            "capacity": home.get("capacity"),
            "healthyWorkers": (facts.get("homePopulation") or {}).get("healthyWorkers"),
            "healthyWorkParts": (facts.get("homePopulation") or {}).get("healthyWorkParts"),
            "spawnStates": [spawn for spawn in facts.get("spawns", []) if spawn["room"] == room_name],
        })
    telemetry = latest.get("telemetry") or {}
    room = (telemetry.get("rooms") or {}).get(room_name, {})
    report["telemetryAvailable"] = bool(telemetry.get("available") and room.get("visible"))
    report["telemetryReason"] = telemetry.get("reason") or room.get("unavailable")
    if not report["telemetryAvailable"]:
        return report, None
    report["geometry"] = {key: room.get(key) for key in ("sources", "structures", "sites", "controller", "links")}
    report["workersSnapshot"] = room.get("units")
    if trend:
        measure_window(report, room, room_name, window)
    return report, latest if timely else None


def measure_window(report, room, room_name, window):
    counters = [(sample.get("telemetry") or {}).get("counters") or {} for sample in window]
    rooms = [counter.get("rooms", {}).get(room_name) for counter in counters]
    elapsed = report["samples"][-1]["tick"] - report["samples"][0]["tick"]
    observed = monotonic_delta(rooms, "observedTicks")
    event_ticks = monotonic_delta(rooms, "eventTicksRead")
    if event_ticks is not None and (observed is None or not 0 <= event_ticks <= observed <= elapsed):
        event_ticks = None
    busy = monotonic_delta(rooms, "spawnBusyTicks")
    report["coverage"] = {
        "elapsedGameTicks": elapsed, "roomObservedTicks": observed, "eventTicksRead": event_ticks,
        "eventTickCoverage": ratio(event_ticks, elapsed),
        "spawnBusyFractionAnySpawn": ratio(busy, observed) if observed and busy is not None and 0 <= busy <= observed <= elapsed else None,
    }
    report["roomActionAmounts"] = {
        key: monotonic_delta(rooms, key) if event_ticks else None
        for key in ("ownedHarvestAmountEvents", "energyMovementEventAmount", "upgradeEnergyEvents")
    }
    action_ticks = monotonic_delta(rooms, "economyEventTicks")
    if action_ticks and event_ticks and action_ticks <= event_ticks:
        actions = {}
        for role in ("worker", "miner", "hauler", "other"):
            rows = [{**row["economyRoleEvents"][role], "epoch": row["epoch"]}
                    if row and role in row.get("economyRoleEvents", {}) else None for row in rooms]
            actions[role] = {name: monotonic_delta(rows, name) for name in (
                "harvestEvents", "harvestEnergy", "deliveryEvents", "deliveredEnergy",
                "spawnRefillEnergy", "storageDeliveryEnergy", "buildEvents", "upgradeEvents",
            )}
            actions[role]["deliveredPerCoveredEventTick"] = ratio(actions[role]["deliveredEnergy"], action_ticks)
        report["roleEvents"] = {"eventTicks": action_ticks, "roles": actions,
                                "scope": "Completed events with resolvable owned actors; roles read at observation"}
        if all(value is not None for value in actions["worker"].values()):
            report["missing"].pop("worker", None)
            report["missing"].pop("delivery", None)
    report["sources"] = []
    for source in room.get("sources", []):
        rows = [counter.get("sources", {}).get(source["id"]) for counter in counters]
        observed_source = monotonic_delta(rows, "observedTicks")
        full = monotonic_delta(rows, "fullTicks")
        adjacent = monotonic_delta(rows, "withAdjacentWorkTicks")
        covered = monotonic_delta(rows, "eventTicksRead")
        if covered is None or not observed_source or not 0 <= covered <= observed_source <= elapsed:
            covered = None
        amount = monotonic_delta(rows, "harvestAmountEvents") if covered else None
        report["sources"].append({
            "id": source["id"], "eventTicks": covered,
            "harvestedAllActors": amount, "harvestPerCoveredEventTick": ratio(amount, covered),
            "observedTicks": observed_source,
            "fullTicks": full if observed_source and full is not None and 0 <= full <= observed_source <= elapsed else None,
            "ticksWithoutAdjacentWork": observed_source - adjacent if observed_source and adjacent is not None
            and 0 <= adjacent <= observed_source <= elapsed else None,
            "recentHarvesters": source.get("recentConfirmedHarvesters"),
        })
    report["links"] = []
    for link in room.get("links", []):
        rows = []
        for counter in counters:
            recorded = counter.get("links", {}).get(link["id"])
            rows.append({**recorded, "epoch": counter["epoch"]} if recorded and counter.get("epoch") else None)
        amount = monotonic_delta(rows, "verifiedSentEnergy") if action_ticks else None
        active = monotonic_delta(rows, "activeObservedTicks")
        ready = monotonic_delta(rows, "cooldownReadyTicks")
        report["links"].append({
            "id": link["id"], "sent": amount, "sendEvents": monotonic_delta(rows, "verifiedSendEvents") if action_ticks else None,
            "sentPerCoveredRoomEventTick": ratio(amount, action_ticks),
            "cooldownAtCapture": link.get("cooldown"),
            "cooldownReadyFraction": ratio(ready, active) if active and ready is not None and 0 <= ready <= active <= elapsed else None,
            "eligibleTickUtilization": None,
        })


def room_geometry(sample, room_name, data_dir):
    room = sample["telemetry"]["rooms"][room_name]
    layout = sample.get("staticLayouts", {}).get(room_name)
    if not layout or not layout.get("layoutKey") or layout["layoutKey"] != room.get("layoutKey"):
        raise ValueError("missing or mismatched static layout cache")
    if not isinstance(layout.get("minerals"), list):
        raise ValueError("mineral coordinates unavailable; refresh the layout snapshot")
    ref = layout["terrainRef"]
    cache = (data_dir / "static").resolve()
    terrain_file = Path(ref["file"]).resolve()
    if not terrain_file.is_relative_to(cache):
        raise ValueError("terrain cache reference is outside static cache")
    terrain = json.loads(terrain_file.read_text(encoding="utf-8-sig"))["terrain"]
    if hashlib.sha256(terrain.encode("ascii")).hexdigest() != ref["sha256"]:
        raise ValueError("terrain cache hash mismatch")
    return room, RoomGrid(room, terrain, layout["minerals"])


def haul_plan(grid, room, mining):
    if mining is None:
        return {"status": "worker_fallback", "reason": "NO_DISTINCT_ACCESSIBLE_MINING_STATIONS"}
    blocked = {route["stand"] for route in mining.values()}
    rows = []
    for source in sorted(room["sources"], key=lambda item: item["id"]):
        route = mining[source["id"]]
        loaded_path = route["loadedPath"]
        drop = loaded_path[-1]
        empty_cost, empty_next = grid.routes([route["pickup"]], blocked, loaded=False)
        loaded = sum(5 if grid.mask(tile) & 2 and tile not in grid.roads else 1 for tile in loaded_path[1:])
        cycle = loaded + empty_cost[drop] + 2
        rate_fields = [source.get(key) for key in ("capacity", "regenerationPeriod", "baseHarvestPower")]
        row = {"sourceId": source["id"], **route, "emptyPath": path_from(drop, empty_next),
               "cycleTicksModeled": cycle, "status": "rate_unavailable"}
        if all(type(value) is int and value > 0 for value in rate_fields):
            capacity, period, power = rate_fields
            rate = capacity / period
            carry = (capacity * cycle + period * CARRY_CAPACITY - 1) // (period * CARRY_CAPACITY)
            energy_capacity = room.get("energyCapacityAvailable")
            size_limit = min(PART_LIMIT // 2, energy_capacity // 100) if type(energy_capacity) is int else 0
            work = ceil(rate / power)
            miner_body = {"work": work, "carry": 1, "move": 1, "energyCost": 100 * work + 100}
            miner_fits = work + 2 <= PART_LIMIT and type(energy_capacity) is int and miner_body["energyCost"] <= energy_capacity
            remaining = carry
            bodies = []
            while remaining > 0 and size_limit:
                size = min(size_limit, remaining)
                bodies.append({"carry": size, "move": size, "energyCost": 100 * size})
                remaining -= size
            row.update({"status": "modeled" if not remaining and miner_fits else "unaffordable",
                        "sourceRateCapacityPerTick": rate, "minerWork": work, "minerBody": miner_body,
                        "carryPartsRequired": carry, "haulerBodies": bodies,
                        "idealHaulEnergyPerTick": sum(body["carry"] for body in bodies) * CARRY_CAPACITY / cycle})
        rows.append(row)
    return {"status": "modeled", "sources": rows,
            "assumptions": "Unboosted CARRY/MOVE 1:1, full outbound/empty return, two action ticks, no traffic, Source capacity/regen ceiling"}


def pilot_decision(*, enabled, defense_needed, workers_healthy, worker_floor, energy,
                   worker_minimum, spawn_busy, expansion_claimed_spawn, next_body_cost,
                   station_valid, miner_ready, hauler_ready):
    """Evaluate a hypothetical spawn decision while leaving every Worker assigned."""
    if not enabled or defense_needed or workers_healthy < worker_floor or energy < worker_minimum:
        action = "KEEP_NATIVE_WORKER_POLICY"
    elif spawn_busy or expansion_claimed_spawn:
        action = "WAIT_FOR_SPAWN"
    elif not station_valid:
        action = "KEEP_NATIVE_WORKER_POLICY"
    elif miner_ready and hauler_ready:
        action = "OBSERVE_PILOT_WITH_WORKERS_RETAINED"
    elif next_body_cost <= 0 or energy < next_body_cost + worker_minimum:
        action = "WAIT_KEEP_WORKER_ENERGY_RESERVE"
    else:
        action = "MODEL_HAULER_REPLACEMENT" if not hauler_ready else "MODEL_MINER_REPLACEMENT"
    return {"action": action, "retainWorkers": True,
            "workerFallback": action == "KEEP_NATIVE_WORKER_POLICY" or not (station_valid and miner_ready and hauler_ready)}


def link_loss(amount):
    return (amount * LINK_LOSS_PERCENT + 99) // 100


def link_model(grid, room, mining, *, minimum=200, controller_target=400):
    links = sorted(room.get("links") or [], key=lambda link: link["id"])
    limit = room.get("rclLimits", {}).get("link")
    pending = [obj for obj in room["sites"] if obj["type"] == "link"]
    result = {"rclLimit": limit, "built": len(links), "pendingSites": pending,
              "roles": {}, "proposals": [], "skipped": [], "topologies": []}
    if type(limit) is not int or limit < 0:
        return {**result, "status": "LINK_RCL_LIMIT_UNAVAILABLE"}
    owned_count = sum(link.get("my") is True for link in links)
    result["additionalRclSlots"] = max(0, limit - owned_count - len(pending))
    if owned_count > limit:
        return {**result, "status": "LINK_RCL_LIMIT_EXCEEDED"}

    storage = next((obj for obj in room["structures"] if obj["type"] == "storage" and obj.get("my")), None)
    controller = point(room["controller"])
    roles = result["roles"]
    active = {}
    blocked = {entry["stand"] for entry in (mining or {}).values()}
    for link in links:
        if not link.get("my") or link.get("active") is not True:
            result["skipped"].append({"id": link["id"], "reason": "LINK_NOT_CONFIRMED_ACTIVE"})
            continue
        if any(type(link.get(key)) is not int or link[key] < 0 for key in ("energy", "capacity", "cooldown")) or not 0 <= link["energy"] <= link["capacity"] or not link["capacity"]:
            result["skipped"].append({"id": link["id"], "reason": "LINK_STATE_UNAVAILABLE"})
            continue
        tile = point(link)
        access = set(grid.stands(tile, blocked))
        source_ids = [source for source, entry in (mining or {}).items() if distance(tile, entry["stand"]) == 1]
        options = [("source", source) for source in source_ids]
        if storage and access.intersection(grid.stands(point(storage), blocked)):
            options.append(("storage", None))
        if access.intersection(grid.stands(controller, blocked, radius=3)):
            options.append(("controller", None))
        if len(options) != 1:
            result["skipped"].append({"id": link["id"], "reason": "AMBIGUOUS_ROLE" if options else "NO_MATCHING_ROLE"})
            continue
        kind, source = options[0]
        roles[link["id"]] = {"role": kind, "sourceId": source}
        active[link["id"]] = link

    planned_senders = set()
    incoming = {key: 0 for key in active}
    used_as_receiver = set()
    for receiver_role, allowed_senders in (("controller", {"source", "storage"}), ("storage", {"source"})):
        targets = sorted((key for key, role in roles.items() if role["role"] == receiver_role),
                         key=lambda key: (active[key]["energy"], key))
        for receiver_id in targets:
            if receiver_id in planned_senders:
                continue
            receiver = active[receiver_id]
            target_energy = min(receiver["capacity"], controller_target) if receiver_role == "controller" else receiver["capacity"]
            senders = sorted((key for key, role in roles.items() if role["role"] in allowed_senders),
                             key=lambda key: (roles[key]["role"] != "source", -active[key]["energy"], key))
            for sender_id in senders:
                sender = active[sender_id]
                if sender_id in planned_senders or sender_id in used_as_receiver or sender["cooldown"]:
                    continue
                free = max(0, target_energy - receiver["energy"] - incoming[receiver_id])
                amount = min(sender["energy"], free)
                if amount < minimum:
                    continue
                incoming[receiver_id] += amount
                planned_senders.add(sender_id)
                used_as_receiver.add(receiver_id)
                result["proposals"].append({"from": sender_id, "to": receiver_id, "send": amount,
                                            "estimatedReceived": amount - link_loss(amount),
                                            "estimatedLoss": link_loss(amount),
                                            "cooldownTicks": distance(point(sender), point(receiver))})
    for key, link in active.items():
        if roles[key]["role"] in ("source", "storage") and key not in planned_senders:
            reason = "COOLDOWN" if link["cooldown"] else "BELOW_SEND_THRESHOLD" if link["energy"] < minimum else "NO_RECEIVER_WITH_HEADROOM"
            result["skipped"].append({"id": key, "reason": reason})
    result["topologies"] = compare_topologies(grid, room, active, roles, mining or {}, storage)
    result["status"] = "modeled" if result["proposals"] else "use_hauling"
    return result


def compare_topologies(grid, room, links, roles, mining, storage):
    """Compare separate routes to the same destination. Results cannot be summed across Sources."""
    blocked = {entry["stand"] for entry in mining.values()}
    controller = point(room["controller"])
    comparisons = []
    for source_id, route in mining.items():
        feeder = route["pickup"]
        source_links = [key for key in links if roles[key] == {"role": "source", "sourceId": source_id}]
        storage_links = [key for key in links if roles[key]["role"] == "storage"]
        controller_links = [key for key in links if roles[key]["role"] == "controller"]
        destinations = [("controller", grid.stands(controller, blocked, radius=3), controller_links)]
        if storage:
            destinations.append(("storage", grid.stands(point(storage), blocked), storage_links))
        for sink, access, receivers in destinations:
            delivery, next_tile = grid.routes(access, blocked)
            back, _ = grid.routes([feeder], blocked, loaded=False)
            if feeder not in delivery:
                continue
            drop = path_from(feeder, next_tile)[-1]
            cycle = delivery[feeder] + back[drop] + 2
            variants = [{"path": "hauling", "creepActionAndTravelTicksPer1000": 2 * cycle, "energyLostPer1000Delivered": 0}]
            for sender in source_links:
                for receiver in receivers:
                    paths = [[sender, receiver]]
                    if sink == "controller":
                        paths.extend([sender, relay, receiver] for relay in storage_links)
                    for nodes in paths:
                        hops = list(zip(nodes, nodes[1:]))
                        sent = batch = min(links[key]["capacity"] for key in nodes)
                        cooldowns = [distance(point(links[first]), point(links[second])) for first, second in hops]
                        per_hop = []
                        for _ in hops:
                            batch -= link_loss(batch)
                            per_hop.append(batch)
                        # Source Miner deposits; a creep at the shared sink stand withdraws and delivers.
                        # Assume 50-energy Miner batches and 500-energy sink creep loads; no local travel.
                        if batch and all(cooldowns):
                            variants.append({
                                "path": nodes, "cooldownTicksPerHop": cooldowns,
                                "idealDeliveredEnergyPerTick": min(per_hop) / max(cooldowns),
                                "energyLostPer1000Delivered": 1000 * (sent - batch) / batch,
                                "creepActionAndTravelTicksPer1000": 1000 * sent / batch / 50 + 4,
                            })
            comparisons.append({"sourceId": source_id, "destination": sink, "variants": variants})
    return comparisons


def simulate(room, grid, additions, blocked_stations=frozenset()):
    if len(room["sources"]) not in (1, 2):
        return {"status": "unavailable", "reason": "EXPECTED_ONE_OR_TWO_SOURCES"}
    if len({source["id"] for source in room["sources"]}) != len(room["sources"]):
        raise ValueError("duplicate Source IDs")
    depots = [obj for obj in room["structures"] if obj["type"] in ("storage", "spawn") and obj.get("my")]
    depots.sort(key=lambda obj: (obj["type"] != "storage", point(obj)))
    depot = next((obj for obj in depots if grid.stands(point(obj), blocked_stations)), None)
    if depot is None:
        return {"status": "worker_fallback", "reason": "NO_ACCESSIBLE_OWNED_STORAGE_OR_SPAWN"}
    sources = sorted(room["sources"], key=lambda source: source["id"])
    mining = mining_stands(grid, sources, point(depot), blocked_stations)
    return {"status": "modeled", "depot": depot, "mining": haul_plan(grid, room, mining),
            "extensions": extension_plan(grid, room, point(depot), mining, additions),
            "links": link_model(grid, room, mining), "traffic": "unavailable_from_static_paths"}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, required=True, help="Hourly collector output directory")
    parser.add_argument("--room", default="E22S36")
    parser.add_argument("--add", type=int, default=10, help="Maximum new Extension recommendations")
    parser.add_argument("--output", type=Path, help="Optional local JSON file")
    args = parser.parse_args(argv)
    if not 0 <= args.add <= 60:
        parser.error("--add must be in [0, 60]")
    evidence, sample = baseline(load_history(args.directory), args.room, datetime.now(timezone.utc))
    report = {"room": args.room, "baseline": evidence,
              "simulation": {"status": "unavailable", "reason": "FRESH_ROOM_GEOMETRY_REQUIRED"}}
    if sample:
        try:
            room, grid = room_geometry(sample, args.room, args.directory)
            report["simulation"] = simulate(room, grid, args.add)
            if report["simulation"]["status"] == "modeled":
                evidence["missing"].pop("layout", None)
        except (KeyError, TypeError, ValueError, OSError) as error:
            report["simulation"]["reason"] = str(error)
    output = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.output:
        args.output.write_text(output, encoding="utf-8")
    else:
        print(output, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
