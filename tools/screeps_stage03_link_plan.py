"""Offline zero-Link transition and RCL-checked replacement sites."""
import argparse
from pathlib import Path

from screeps_home_layout import distance, point
from screeps_stage03_layout import STANDS, checked_add, grid_for, read, write, xy
from screeps_stage03_revision import EAST, FUTURE_LINK_SITES, measure, plan_extensions


def plan_links(previous):
    snapshot = previous["snapshot"]
    extension_plan, interim = plan_extensions(previous)
    old = [obj for obj in interim if obj["type"] == "link"]
    if {point(obj) for obj in old} != {(31, 18), (39, 19)}:
        raise ValueError("old Link geometry differs from the approved planning input")
    if snapshot["rclLimits"]["link"] != 3:
        raise ValueError("expected three RCL6 Link slots")
    zero = [obj for obj in interim if obj["type"] != "link"] + extension_plan["roadsWaitingForLinkRetirement"]
    phases = {"zeroLinks": measure(snapshot, zero)}
    structures = zero.copy()
    for i, tile in enumerate(FUTURE_LINK_SITES, 1):
        structures = checked_add(snapshot, structures, "link", tile)
        phases[f"newLink{i}"] = measure(snapshot, structures)
    grid = grid_for(snapshot, structures)
    reserve = set(STANDS)
    for tile in EAST:
        if not grid.walkable(tile, reserve):
            raise ValueError("east corridor is obstructed")
    source1, source2, hub = FUTURE_LINK_SITES
    for source, stand in zip((source1, source2), STANDS):
        if distance(source, stand) != 1:
            raise ValueError("Source Link needs a usable Miner interaction")
    storage = next(point(obj) for obj in structures if obj["type"] == "storage")
    access = set(grid.stands(hub, reserve)) & set(grid.stands(storage, reserve))
    if not access:
        raise ValueError("Storage hub has no shared interaction tile")
    controller_link = (16, 39)
    future = checked_add(snapshot, structures, "link", controller_link)
    measure(snapshot, future)
    controller = point(snapshot["controller"])
    grid_future = grid_for(snapshot, future)
    if not set(grid_future.stands(controller_link, reserve)) & set(grid_future.stands(controller, reserve, 3)):
        raise ValueError("Controller Link has no usable upgrade interaction")
    edges = [{"from": name, "to": "Storage", "cooldownTicks": distance(tile, hub),
              "netPer800": 776} for name, tile in zip(("S1", "S2"), (source1, source2))]
    return {
        "snapshotTick": snapshot["tick"], "room": snapshot["room"], "rcl": 6,
        "retireAfterTenBuiltAndApproval": [{"type": "link", **xy(point(obj))} for obj in sorted(old, key=point)],
        "buildAfterRetirementAndApproval": [
            {"type": "link", "role": role, **xy(tile)}
            for role, tile in zip(("S1", "S2", "Storage"), (source1, source2, hub))
        ],
        "optionalRcl7": {"type": "link", "role": "Controller", **xy(controller_link)},
        "storageInteraction": sorted(access), "edges": edges,
        "constructionEnergyEstimate": 15000, "rcl6TotalWithExtensionsAndRoads": extension_plan["constructionEnergyEstimate"] + 15000,
        "dispatch": "Not implemented. When approved after construction, reserve receiver headroom and favor Storage; Controller stays on hauling at RCL6.",
        "phases": phases,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("previous", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    write(args.output, plan_links(read(args.previous)))
