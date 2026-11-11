"""Offline revision of Plan A with an additive Extension wave and reserved lanes."""
from pathlib import Path
from collections import Counter
import argparse

from screeps_home_layout import extension_plan, point
from screeps_stage03_layout import (
    STANDS, building, checked_add, grid_for, logistics, read, reachable_exits, write, xy,
)

EAST = tuple((39, y) for y in range(13, 27))
PASSING = tuple((38, y) for y in (14, 17, 21, 24))
WEST = tuple((32, y) for y in range(17, 20))
FUTURE_LINK_SITES = ((29, 24), (38, 26), (37, 14))
LAYOUT_KEY = "70f4d3f4"


def measure(snapshot, structures):
    counts = Counter(obj["type"] for obj in structures)
    paths, ext = logistics(snapshot, structures)
    grid = grid_for(snapshot, structures)
    if reachable_exits(snapshot, snapshot["structures"]) - reachable_exits(snapshot, structures):
        raise ValueError("phase obstructs a previously accessible exit")
    for source, stand in zip(sorted(snapshot["sources"], key=point), STANDS):
        if stand not in grid.stands(point(source), frozenset()):
            raise ValueError("phase obstructs a Source stand")
    return {
        "extensions": counts["extension"],
        "spawnCapacityAtRcl6": 300 * counts["spawn"] + 50 * counts["extension"],
        "pathCosts": {key: value["cost"] for key, value in paths.items()},
        "extensionCosts": ext,
    }


def plan_extensions(previous):
    snapshot = previous["snapshot"]
    original = snapshot["structures"]
    ext_count = sum(obj["type"] == "extension" for obj in original)
    site_count = sum(obj["type"] == "extension" for obj in snapshot["sites"])
    if snapshot["room"] != "E22S36" or snapshot["layoutKey"] != LAYOUT_KEY or snapshot["controller"]["level"] != 6:
        raise ValueError("revision requires the reviewed E22S36 RCL6 geometry")
    slots = snapshot["rclLimits"]["extension"] - ext_count - site_count
    if slots != 10 or snapshot["sites"]:
        raise ValueError("confirm 10 free Extension slots and no existing sites")
    protected = set(EAST + PASSING + WEST + FUTURE_LINK_SITES)
    planned_a_roads = {point(obj) for obj in previous["A"]["add"] if obj["type"] == "road"}
    grid = grid_for(snapshot, original)
    grid.occupied.update(protected | planned_a_roads)
    depot = next(point(obj) for obj in original if obj["type"] == "storage")
    chosen = extension_plan(grid, snapshot, depot,
                            {str(i): {"stand": stand, "loadedPath": []} for i, stand in enumerate(STANDS)}, slots)
    additions = chosen["changes"]["add"]
    if len(additions) != slots:
        raise ValueError("unable to fit all 10 Extensions while preserving occupied and reserved tiles")

    phases = {"baseline": measure(snapshot, original)}
    structures = original.copy()
    for obj in additions:
        structures = checked_add(snapshot, structures, "extension", point(obj))
        # Every intermediate build phase must preserve currently reachable services.
        measure(snapshot, structures)
    phases["allTenBuilt"] = measure(snapshot, structures)
    batches = []
    for label, reserved in (("X39 corridor", EAST), ("X38 passing bays", PASSING), ("X32 west access", WEST)):
        conflicts = [obj for obj in structures if obj["type"] == "extension" and point(obj) in reserved]
        batch = [{"type": "extension", **xy(point(obj))} for obj in sorted(conflicts, key=point)]
        if not batch:
            continue
        structures = [obj for obj in structures if obj not in conflicts]
        phases[label] = measure(snapshot, structures)
        batches.append({"zone": label, "requiresAllTenNewBuiltAndApproval": True, "retire": batch})

    old_link_tiles = {point(obj) for obj in original if obj["type"] == "link"}
    grid = grid_for(snapshot, structures)
    road_tiles = (planned_a_roads | set(EAST + PASSING + WEST)) - set(FUTURE_LINK_SITES)
    blocked = {tile for tile in road_tiles if not grid.walkable(tile, frozenset())}
    if blocked - old_link_tiles:
        raise ValueError("a planned road remains blocked after Extension retirement")
    roads = [building("road", tile) for tile in sorted(road_tiles - grid.roads)]
    road_cost = sum(1500 if grid.mask(point(obj)) & 2 else 300 for obj in roads)
    pending = [obj for obj in roads if point(obj) in blocked]
    structures += [obj for obj in roads if obj not in pending]
    phases["roadsBeforeLinkRetirement"] = measure(snapshot, structures)
    return {
        "room": snapshot["room"], "snapshotTick": snapshot["tick"], "layoutKey": snapshot["layoutKey"],
        "freeExtensionSlots": slots, "buildFirst": additions,
        "batches": batches, "roads": roads, "roadCost": road_cost,
        "roadsWaitingForLinkRetirement": pending,
        "reserved": {"X39": EAST, "X38Bays": PASSING, "X32": WEST, "sourceStations": STANDS},
        "constructionEnergyEstimate": 3000 * len(additions) + road_cost,
        "phases": phases,
    }, structures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("previous", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result, _ = plan_extensions(read(args.previous))
    write(args.output, result)


if __name__ == "__main__":
    main()
