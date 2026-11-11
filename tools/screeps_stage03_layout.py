"""Validate an E22S36 snapshot and evaluate two local-only layout blueprints."""
import argparse
from collections import Counter
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path

from screeps_home_layout import RoomGrid, distance, extension_plan, interior, path_from, point

LIMITS = {
    6: {"spawn": 1, "extension": 40, "storage": 1, "link": 3},
    7: {"spawn": 2, "extension": 50, "storage": 1, "link": 4},
    8: {"spawn": 3, "extension": 60, "storage": 1, "link": 6},
}
CONSTRUCTION = {"spawn": 15000, "extension": 3000, "storage": 30000, "link": 5000, "road": 300}
STANDS = ((29, 23), (37, 27))
LABELS = {(30, 22): "S1", (38, 28): "S2"}


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def write(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def xy(tile):
    return dict(zip(("x", "y"), tile))


def building(kind, tile):
    return {"type": kind, **xy(tile), "my": True}


def keys(objects):
    return {(obj["type"], point(obj)) for obj in objects}


def capture(monitor, public_path, now):
    report = read(monitor / "latest.json")
    if {item.get("shard") for item in report.get("sources", [])} != {"shard3"}:
        raise ValueError("expected a shard3 telemetry source")
    facts, active = report["facts"], report["activeCode"]
    age = (now - datetime.fromisoformat(report["collectedAt"])).total_seconds()
    if (report.get("errors") or not active.get("sha256") or not active.get("buildId")
            or active["buildId"] != facts["runtimeBuildId"] or not 0 <= facts["observationAgeTicks"] <= 100
            or not 0 <= age <= 7200):
        raise ValueError("latest telemetry is stale, failed, or has a runtime mismatch")
    room = report["telemetry"]["rooms"]["E22S36"]
    if not report["telemetry"]["available"] or not room["visible"] or not room["controller"]["my"]:
        raise ValueError("owned E22S36 details unavailable")
    if report["telemetry"]["tick"] != facts["runtimeSnapshotTick"]:
        raise ValueError("room detail tick differs from the runtime sample")
    static_dir = (monitor / "static").resolve()

    def cache(ref):
        path = Path(ref["file"]).resolve()
        if not path.is_relative_to(static_dir):
            raise ValueError("cache reference outside the monitor static directory")
        return read(path)

    layout_ref = report["staticRefs"]["E22S36"]
    layout = cache(layout_ref)
    canonical = json.dumps(layout, sort_keys=True, separators=(",", ":")).encode()
    if (sha256(canonical).hexdigest() != layout_ref["sha256"]
            or layout["layoutKey"] != room["layoutKey"] or layout["room"] != "E22S36"
            or keys(layout["structures"]) != keys(room["structures"]) or keys(layout["sites"]) != keys(room["sites"])
            or {point(obj) for obj in layout["sources"]} != {point(obj) for obj in room["sources"]}
            or point(layout["controller"]) != point(room["controller"])):
        raise ValueError("layout cache mismatches detailed telemetry")
    terrain_ref = layout["terrainRef"]
    terrain = cache(terrain_ref)["terrain"]
    if sha256(terrain.encode("ascii")).hexdigest() != terrain_ref["sha256"]:
        raise ValueError("terrain hash mismatch")

    minerals = layout.get("minerals")
    supplement = None
    if public_path:
        public = read(public_path)
        if public["endpoint"] != "https://screeps.com/api/game/room-objects?room=E22S36&shard=shard3":
            raise ValueError("unexpected public geometry room or shard")
        if abs((datetime.fromisoformat(public["at"]) - datetime.fromisoformat(report["collectedAt"])).total_seconds()) > 7200:
            raise ValueError("public geometry and telemetry samples are too far apart")
        objects = public["objects"]
        matching_buildings = [obj for obj in objects if obj["type"] not in ("source", "mineral", "constructionSite")]
        sites = [{**obj, "type": obj["structureType"]} for obj in objects if obj["type"] == "constructionSite"]
        if (keys(matching_buildings) != keys(room["structures"]) or keys(sites) != keys(room["sites"])
                or {point(obj) for obj in objects if obj["type"] == "source"} != {point(obj) for obj in room["sources"]}):
            raise ValueError("public geometry mismatches telemetry structures, sites, or Sources")
        public_minerals = [{**xy(point(obj)), "mineralType": obj["mineralType"]}
                           for obj in objects if obj["type"] == "mineral"]
        if minerals is not None and {point(obj) for obj in minerals} != {point(obj) for obj in public_minerals}:
            raise ValueError("mineral coordinates differ across sources")
        minerals = public_minerals
        supplement = {"time": public["at"], "endpoint": public["endpoint"], "crossCheckedGeometry": True}
    if not isinstance(minerals, list) or len(minerals) != 1:
        raise ValueError("expected one verified mineral for E22S36")
    snapshot = {
        "room": "E22S36", "shard": "shard3", "time": report["collectedAt"], "tick": facts["runtimeSnapshotTick"],
        "observationAgeTicks": facts["observationAgeTicks"], "activeCode": active, "layoutKey": room["layoutKey"],
        "terrainSha256": terrain_ref["sha256"], "layoutSha256": layout_ref["sha256"], "terrain": terrain,
        "supplement": supplement, "minerals": minerals,
        **{key: room[key] for key in ("controller", "structures", "sites", "links", "rclLimits")},
        "sources": [{key: obj[key] for key in ("id", "x", "y", "capacity", "walkableAdjacentSlots")}
                    for obj in room["sources"]],
    }
    RoomGrid(snapshot, terrain, minerals)
    return snapshot


def grid_for(snapshot, structures):
    return RoomGrid({**snapshot, "structures": structures}, snapshot["terrain"], snapshot["minerals"])


def route(grid, starts, ends, blocked=frozenset()):
    costs, next_tile = grid.routes(ends, blocked, road_weight=1, plain_weight=2)
    start = min((tile for tile in starts if tile in costs), key=lambda tile: (costs[tile], tile), default=None)
    if start is None:
        raise ValueError("required logistics route is unreachable")
    return {"cost": costs[start], "tiles": path_from(start, next_tile)}


def logistics(snapshot, structures):
    grid = grid_for(snapshot, structures)
    reserve = set(STANDS)
    storage = next(point(obj) for obj in structures if obj["type"] == "storage")
    origins = grid.stands(storage, reserve)
    controller = point(snapshot["controller"])
    paths = {f"S{i} → Storage": route(grid, grid.stands(stand, reserve), origins, reserve)
             for i, stand in enumerate(STANDS, 1)}
    paths["Storage → Controller"] = route(grid, origins, grid.stands(controller, reserve, 3), reserve)
    spawns = sorted(point(obj) for obj in structures if obj["type"] == "spawn")
    for tile in spawns:
        paths[f"Storage → Spawn {tile}"] = route(grid, origins, grid.stands(tile, reserve), reserve)
    extension_costs, _ = grid.routes(origins, reserve, road_weight=1, plain_weight=2)
    extension_rows = []
    for obj in sorted((o for o in structures if o["type"] == "extension"), key=point):
        tile = point(obj)
        cost = min((extension_costs[t] for t in grid.stands(tile, reserve) if t in extension_costs), default=None)
        if cost is None:
            raise ValueError(f"Extension at {tile} is inaccessible from Storage")
        extension_rows.append({"tile": tile, "cost": cost})
    return paths, extension_rows


def checked_add(snapshot, structures, kind, tile):
    grid = grid_for(snapshot, structures)
    if (any(axis < 2 or axis > 47 for axis in tile) or tile in grid.occupied
            or tile in STANDS or not grid.walkable(tile, frozenset())):
        raise ValueError(f"invalid {kind} candidate {tile}")
    return structures + [building(kind, tile)]


def add_roads(snapshot, structures):
    paths, _ = logistics(snapshot, structures)
    grid = grid_for(snapshot, structures)
    tiles = {tile for path in paths.values() for tile in path["tiles"]}
    return structures + [building("road", tile) for tile in sorted(tiles)
                         if tile not in grid.occupied and tile not in STANDS and interior(tile)]


def reachable_exits(snapshot, structures):
    grid = grid_for(snapshot, structures)
    spawns = [point(obj) for obj in structures if obj["type"] == "spawn"]
    reserve = set(STANDS)
    costs, _ = grid.routes([stand for spawn in spawns for stand in grid.stands(spawn, reserve)], reserve)
    return {tile for tile in costs if not interior(tile)}


def link_roles(snapshot, structures, name):
    grid = grid_for(snapshot, structures)
    reserve = set(STANDS)
    storage = next(point(obj) for obj in structures if obj["type"] == "storage")
    controller = point(snapshot["controller"])
    if name == "A":
        roles = {"S1 feed": (29, 24), "storage relay": (31, 18), "reserve": (39, 19)}
        order = [("S1 feed", "storage relay")]
    elif name == "B":
        roles = {"S1 feed": (29, 24), "S2 feed": (38, 26), "storage hub": (31, 33),
                 "controller": (16, 39), "east reserve": (39, 19), "west reserve": (31, 18)}
        order = [("S1 feed", "storage hub"), ("S2 feed", "storage hub"),
                 ("S1 feed", "controller"), ("S2 feed", "controller"), ("storage hub", "controller")]
    else:
        roles = {f"unassigned {i}": point(obj) for i, obj in enumerate(snapshot["links"], 1)}
        order = []
    if set(roles.values()) != {point(obj) for obj in structures if obj["type"] == "link"}:
        raise ValueError("roles do not describe every Link")
    for label, tile in roles.items():
        if label in ("S1 feed", "S2 feed") and distance(tile, STANDS[int(label[1]) - 1]) != 1:
            raise ValueError("Source Link cannot accept directly from Miner stand")
        if label == "controller" and not set(grid.stands(tile, reserve)) & set(grid.stands(controller, reserve, 3)):
            raise ValueError("Controller Link has no shared upgrader stand")
        if label == "storage hub" and not set(grid.stands(tile, reserve)) & set(grid.stands(storage, reserve)):
            raise ValueError("Storage Link has no shared Storage stand")
    edges = []
    for sender, receiver in order:
        cooldown = distance(roles[sender], roles[receiver])
        edges.append({"from": sender, "to": receiver, "cooldownTicks": cooldown,
                      "maxBatch": 800, "modeledNetPerFullBatch": 776,
                      "idealNetPerCooldownTick": round(776 / cooldown, 2)})
    handoff = None
    if name in ("A", "B"):
        key = "storage relay" if name == "A" else "storage hub"
        handoff = route(grid, grid.stands(roles[key], reserve), grid.stands(storage, reserve), reserve)
    priority = {
        "current": "No Link duties confirmed.",
        "A": "Roads first. Pilot only S1 to storage relay when both ends are serviceable; keep S2 and the Controller on hauling.",
        "B": "On downgrade risk prioritize direct Controller supply. Otherwise fill the Storage hub for Spawn recovery; surplus can feed the Controller directly, then via the hub as a fallback.",
    }[name]
    return {"roles": roles, "edges": edges, "storageHandoff": handoff, "priority": priority,
            "dispatchGuards": {"minimumBatch": 200, "controllerTarget": 400, "requireSenderCooldownZero": True,
                               "reserveReceiverGrossSpace": True, "oneSendPerSenderPerTick": True,
                               "excludeInactiveAndReserveLinks": True}}


def evaluate(snapshot, name, structures, rcl):
    current = keys(snapshot["structures"])
    final = keys(structures)
    grid = grid_for(snapshot, structures)
    added = [{"type": kind, **xy(tile), "constructionProgress":
              CONSTRUCTION[kind] * (5 if kind == "road" and grid.mask(tile) & 2 else 1)}
             for kind, tile in sorted(final - current)]
    removed = [{"type": kind, **xy(tile)} for kind, tile in sorted(current - final)]
    counts = Counter(obj["type"] for obj in structures + snapshot["sites"])
    for kind, cap in LIMITS[rcl].items():
        if counts[kind] > cap:
            raise ValueError(f"{kind} exceeds RCL {rcl} cap")
    for source, stand in zip(sorted(snapshot["sources"], key=point), STANDS):
        if stand not in grid.stands(point(source), frozenset()):
            raise ValueError("planned obstacle blocks a Miner station")
    if reachable_exits(snapshot, snapshot["structures"]) - reachable_exits(snapshot, structures):
        raise ValueError("layout closes a previously reachable exit tile")
    paths, extensions = logistics(snapshot, structures)
    return {"rcl": rcl, "counts": dict(counts), "limits": LIMITS[rcl],
            "structures": structures, "add": added, "remove": removed,
            "cost": sum(obj["constructionProgress"] for obj in added),
            "paths": paths, "extensionCosts": extensions, "linkNetwork": link_roles(snapshot, structures, name)}


def plan(snapshot):
    original = snapshot["structures"]
    if sha256(snapshot["terrain"].encode("ascii")).hexdigest() != snapshot["terrainSha256"]:
        raise ValueError("snapshot terrain hash mismatch")
    if snapshot["room"] != "E22S36" or snapshot["controller"]["level"] != 6 or snapshot["sites"]:
        raise ValueError("these blueprints require the captured E22S36 RCL6 geometry with no pending sites")
    if {point(obj) for obj in snapshot["sources"]} != set(LABELS):
        raise ValueError("Source geometry differs from the E22S36 blueprint")
    current = evaluate(snapshot, "current", original, 6)
    a = checked_add(snapshot, original, "link", (29, 24))
    a = evaluate(snapshot, "A", add_roads(snapshot, a), 6)

    retained_ext = sorted((obj for obj in original if obj["type"] == "extension"),
                          key=lambda obj: (distance(point(obj), (35, 19)), point(obj)))[:12]
    b = [obj for obj in original if obj["type"] not in ("storage", "extension") or obj in retained_ext]
    for kind, tile in [("storage", (30, 33)), ("spawn", (30, 34)), ("spawn", (31, 35)),
                       ("link", (29, 24)), ("link", (38, 26)), ("link", (31, 33)), ("link", (16, 39))]:
        b = checked_add(snapshot, b, kind, tile)
    b = add_roads(snapshot, b)
    planned_room = {**snapshot, "structures": b, "rclLimits": LIMITS[8]}
    placements = extension_plan(grid_for(snapshot, b), planned_room, (30, 33),
                                {str(i): {"stand": stand, "loadedPath": []} for i, stand in enumerate(STANDS)}, 60)
    for obj in placements["changes"]["add"]:
        b = checked_add(snapshot, b, "extension", point(obj))
    b = evaluate(snapshot, "B", b, 8)
    if b["counts"]["extension"] != LIMITS[8]["extension"]:
        raise ValueError("RCL8 blueprint did not fit 60 Extensions")

    cohort = set(row["tile"] for row in current["extensionCosts"])
    for layout in (current, a, b):
        ext = layout["extensionCosts"]
        shared = cohort & {row["tile"] for row in b["extensionCosts"]}
        layout["meanExtensionCost"] = round(sum(row["cost"] for row in ext) / len(ext), 2)
        layout["sharedRetainedExtensionMean"] = round(sum(row["cost"] for row in ext if row["tile"] in shared) / len(shared), 2)
    a_roads = {point(obj) for obj in a["add"] if obj["type"] == "road"}
    b_solids = {point(obj) for obj in b["add"] if obj["type"] != "road"}
    overlap = sorted(a_roads & b_solids)
    return {"snapshot": snapshot, "roadConflictsIfAThenB": overlap, "stations": {label: stand for label, stand in zip(LABELS.values(), STANDS)},
            "model": "8-way shortest static paths, road/plain/swamp 1/2/5, interaction at range 1 (Controller range 3). No observed traffic or throughput.",
            "current": current, "A": a, "B": b}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    entry = parser.add_mutually_exclusive_group(required=True)
    entry.add_argument("--snapshot", type=Path)
    entry.add_argument("--monitor", type=Path)
    parser.add_argument("--public-geometry", type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()
    snapshot = read(args.snapshot) if args.snapshot else capture(args.monitor, args.public_geometry, datetime.now(timezone.utc))
    result = plan(snapshot)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    write(args.output_dir / "snapshot.json", snapshot)
    write(args.output_dir / "coordinates-and-costs.json", result)


if __name__ == "__main__":
    main()
