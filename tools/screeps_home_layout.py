"""Deterministic room geometry and Extension planning. No Screeps API calls."""
from heapq import heappop, heappush
from itertools import product
from math import inf

SIZE = 50
OFFSETS = tuple((dx, dy) for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dx or dy)


def point(obj):
    x, y = obj["x"], obj["y"]
    if type(x) is not int or type(y) is not int or not (0 <= x < SIZE and 0 <= y < SIZE):
        raise ValueError("invalid room coordinate")
    return x, y


def distance(first, second):
    return max(abs(first[0] - second[0]), abs(first[1] - second[1]))


def neighbors(tile):
    for dx, dy in OFFSETS:
        x, y = tile[0] + dx, tile[1] + dy
        if 0 <= x < SIZE and 0 <= y < SIZE:
            yield x, y


def interior(tile):
    return all(0 < axis < SIZE - 1 for axis in tile)


class RoomGrid:
    def __init__(self, room, terrain, minerals):
        if not isinstance(terrain, str) or len(terrain) != SIZE**2 or set(terrain) - set("0123"):
            raise ValueError("expected 2500 terrain masks in y*50+x order")
        self.terrain = terrain
        self.objects = room["structures"] + room["sites"]
        self.roads = {point(obj) for obj in room["structures"] if obj["type"] == "road"}
        natural = room["sources"] + minerals + [room["controller"]]
        self.occupied = {point(obj) for obj in self.objects + natural}
        self.blocked = {point(obj) for obj in natural}
        for obj in self.objects:
            walkable = obj["type"] in ("road", "container", "extractor")
            walkable |= obj["type"] == "rampart" and obj.get("my") is True
            if not walkable:
                self.blocked.add(point(obj))

    def mask(self, tile):
        return int(self.terrain[tile[1] * SIZE + tile[0]])

    def walkable(self, tile, blocked):
        return tile not in self.blocked and tile not in blocked and not self.mask(tile) & 1

    def stands(self, target, blocked, radius=1):
        x, y = target
        return sorted((a, b) for a in range(max(0, x - radius), min(SIZE, x + radius + 1))
                      for b in range(max(0, y - radius), min(SIZE, y + radius + 1))
                      if (a, b) != target and interior((a, b)) and self.walkable((a, b), blocked))

    def routes(self, origins, blocked=frozenset(), loaded=True, road_weight=1, plain_weight=1):
        """Reverse Dijkstra. Entering the next tile costs its modeled movement ticks."""
        costs = {tile: 0 for tile in origins if self.walkable(tile, blocked)}
        next_tile = {}
        queue = [(0, tile) for tile in costs]
        queue.sort()
        while queue:
            cost, tile = heappop(queue)
            if cost != costs[tile]:
                continue
            step = 1
            if loaded:
                step = road_weight if tile in self.roads else 5 if self.mask(tile) & 2 else plain_weight
            for prev in neighbors(tile):
                if self.walkable(prev, blocked) and cost + step < costs.get(prev, inf):
                    costs[prev] = cost + step
                    next_tile[prev] = tile
                    heappush(queue, (cost + step, prev))
        return costs, next_tile


def path_from(start, next_tile):
    path = [start]
    while path[-1] in next_tile:
        path.append(next_tile[path[-1]])
    return path


def mining_stands(grid, sources, depot, blocked=frozenset()):
    """Choose distinct Miner and pickup tiles across one or two Sources."""
    candidates = [grid.stands(point(source), blocked) for source in sources]
    if not all(candidates):
        return None
    containers = {point(obj) for obj in grid.objects if obj["type"] == "container"}
    best = None
    for stands in product(*candidates):
        if len(set(stands)) != len(stands):
            continue
        occupied = set(stands) | blocked
        costs, next_tile = grid.routes(grid.stands(depot, occupied), occupied)
        pickup_options = [[tile for tile in grid.stands(stand, occupied) if tile in costs]
                          for stand in stands]
        distinct = (tiles for tiles in product(*pickup_options) if len(set(tiles)) == len(tiles))
        pickups = min(distinct, key=lambda tiles: (sum(costs[tile] for tile in tiles), tiles), default=None)
        if pickups is None:
            continue
        score = (sum(costs[tile] for tile in pickups),
                 sum(stand not in containers for stand in stands), stands, pickups)
        if best is None or score < best[0]:
            best = (score, {source["id"]: {"stand": stand, "pickup": pickup,
                                          "loadedPath": path_from(pickup, next_tile)}
                            for source, stand, pickup in zip(sources, stands, pickups)})
    return None if best is None else best[1]


def extension_plan(grid, room, depot, mining, requested):
    """Retain existing buildings and retain paths from the depot to reachable anchors."""
    structures, sites = room["structures"], room["sites"]
    owned_extensions = [obj for obj in structures if obj["type"] == "extension" and obj.get("my")]
    owned_sites = [obj for obj in sites if obj["type"] == "extension"]
    retained = owned_extensions + owned_sites
    limit = room.get("rclLimits", {}).get("extension")
    if type(limit) is not int or not 0 <= limit <= 60:
        return {"status": "unavailable", "reason": "EXTENSION_RCL_LIMIT_MISSING"}
    controller = point(room["controller"])
    miner_tiles = {entry["stand"] for entry in (mining or {}).values()}
    origins = grid.stands(depot, miner_tiles)
    costs, next_tile = grid.routes(origins, miner_tiles, road_weight=1, plain_weight=2)
    upgrade_tiles = grid.stands(controller, miner_tiles, radius=3)
    reserved = set(upgrade_tiles) | miner_tiles | set(origins)
    for source in room["sources"]:
        reserved.update(grid.stands(point(source), frozenset()))
    for entry in (mining or {}).values():
        reserved.update(entry["loadedPath"])
    # Protect existing access and depot routes, including one route to each reachable exit tile.
    reachable_exits = {tile for tile in costs if not interior(tile)}
    anchors = [point(obj) for obj in structures + sites if obj["type"] not in ("road", "constructedWall")]
    approaches = [(target, 1) for target in anchors + [point(source) for source in room["sources"]]]
    approaches.append((controller, 3))
    for target, radius in approaches:
        access = [tile for tile in grid.stands(target, miner_tiles, radius) if tile in costs]
        if access:
            reserved.update(path_from(min(access, key=lambda tile: (costs[tile], tile)), next_tile))
    for tile in reachable_exits:
        reserved.update(path_from(tile, next_tile))
    existing_access = [point(obj) for obj in structures if obj["type"] in ("storage", "link")]
    for tile in existing_access:
        reserved.update(grid.stands(tile, miner_tiles))
    reserved.update(grid.roads)

    def replenishment(target, current_costs, extra_blocks):
        return min((current_costs[tile] for tile in grid.stands(target, extra_blocks)
                    if tile in current_costs), default=None)

    def vacant(tile):
        return interior(tile) and tile not in grid.occupied and tile not in reserved and grid.walkable(tile, miner_tiles)

    # Reserve room for missing infrastructure without treating it as built or creating construction intents.
    future = {}
    for kind in ("storage", "link"):
        rcl_limit = room.get("rclLimits", {}).get(kind)
        if type(rcl_limit) is not int or rcl_limit <= 0 or any(obj["type"] == kind for obj in grid.objects):
            continue
        options = [tile for tile in costs if vacant(tile) and len(grid.stands(tile, miner_tiles)) >= 4]
        if options:
            tile = min(options, key=lambda item: (costs[item], item))
            future[kind] = tile
            reserved.add(tile)
            access = grid.stands(tile, miner_tiles)
            reserved.update(access)
            reachable = [stand for stand in access if stand in costs and tile not in path_from(stand, next_tile)]
            if reachable:
                reserved.update(path_from(min(reachable, key=lambda stand: (costs[stand], stand)), next_tile))

    additions = []
    blocks = set(miner_tiles)
    for _ in range(min(requested, max(0, limit - len(retained)))):
        costs_now, next_now = grid.routes(origins, blocks, road_weight=1, plain_weight=2)
        ranked = []
        for tile in costs_now:
            if not vacant(tile) or tile in blocks:
                continue
            access = [stand for stand in grid.stands(tile, blocks) if stand in costs_now]
            if len(access) < 2:
                continue
            best = min(access, key=lambda stand: (costs_now[stand], stand))
            route = path_from(best, next_now)
            if tile in route:
                continue
            openness = sum(vacant(other) and other not in blocks for other in neighbors(tile))
            ranked.append((costs_now[best], -len(access), -openness, tile, route))
        if not ranked:
            break
        _, _, _, tile, route = min(ranked)
        blocks.add(tile)
        reserved.update(route)
        additions.append(tile)

    after, _ = grid.routes(origins, blocks, road_weight=1, plain_weight=2)
    comparisons = [{"id": obj.get("id"), "tile": point(obj),
                    "current": replenishment(point(obj), costs, miner_tiles),
                    "proposed": replenishment(point(obj), after, blocks)} for obj in retained]
    blocked_additions = set(additions)
    overlay = {point(obj): {"spawn": "P", "extension": "E", "storage": "T", "link": "L",
                            "road": "=", "container": "B"}.get(obj["type"], "O") for obj in structures}
    overlay.update({point(obj): "+" for obj in sites})
    overlay.update({point(obj): "S" for obj in room["sources"]})
    overlay[controller] = "C"
    overlay.update({tile: "M" for tile in miner_tiles})
    overlay.update({tile: "F" for tile in future.values()})
    overlay.update({tile: "e" for tile in blocked_additions})
    layout = ["".join(overlay.get((x, y), "#" if grid.mask((x, y)) & 1 else
                                  ":" if (x, y) in reserved else "~" if grid.mask((x, y)) & 2 else ".")
                      for x in range(SIZE)) for y in range(SIZE)]
    return {
        "status": "modeled",
        "limit": limit,
        "retained": len(retained),
        "changes": {"add": [{"x": x, "y": y, "type": "extension"} for x, y in additions], "move": [], "remove": []},
        "layout": layout,
        "reserved": {"future": future, "controllerUpgradeTiles": upgrade_tiles,
                     "sourceStations": sorted(miner_tiles), "tiles": sorted(reserved)},
        "retainedExtensionCosts": comparisons,
        "addedExtensionCosts": [{"tile": tile, "proposed": replenishment(tile, after, blocks)} for tile in additions],
        "costDefinition": "One-way depot interaction tile to Extension range 1; road/plain/swamp weights 1/2/5",
        "includesPlannedSiteObstacles": True,
    }
