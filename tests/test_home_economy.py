import copy
import hashlib
import json
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from screeps_home_economy import baseline, link_model, pilot_decision, room_geometry, simulate
from screeps_home_layout import RoomGrid, point

NOW = datetime(2026, 11, 11, 4, tzinfo=timezone.utc)


def structure(kind, x, y, **fields):
    return {"id": kind, "type": kind, "my": True, "x": x, "y": y, **fields}


def scenario(source_count=1, storage=True, link_network=False):
    sources = [{"id": "S1", "x": 10, "y": 16, "capacity": 3000, "regenerationPeriod": 300, "baseHarvestPower": 2}]
    if source_count == 2:
        sources.append({**sources[0], "id": "S2", "x": 12, "y": 30})
    buildings = [structure("spawn", 22, 22), structure("extension", 23, 23),
                 structure("road", 20, 19), structure("container", 11, 17)]
    if storage:
        buildings.append(structure("storage", 24, 20))
    links = []
    if link_network:
        links = [structure("link", x, y, active=True, energy=energy, capacity=800, cooldown=0)
                 for x, y, energy in [(12, 17, 600), (25, 21, 500), (36, 24, 0)]]
        for index, link in enumerate(links, 1):
            link["id"] = f"L{index}"
        buildings.extend(links)
    room = {
        "sources": sources, "structures": buildings, "links": links,
        "sites": [structure("extension", 24, 23)], "controller": {"id": "C", "x": 39, "y": 24},
        "rclLimits": {"extension": 6, "storage": 1, "link": 3}, "energyCapacityAvailable": 800,
    }
    terrain = "".join("1" if (x in (0, 49) or y in (0, 49)) and (x, y) != (25, 0)
                      else "2" if x == 18 and 13 <= y <= 24 else "0"
                      for y in range(50) for x in range(50))
    return room, RoomGrid(room, terrain, [{"x": 26, "y": 19}])


class LayoutTests(unittest.TestCase):
    def test_single_source_counts_existing_sites_and_preserves_paths(self):
        room, grid = scenario()
        original = copy.deepcopy(room)
        result = simulate(room, grid, 10)
        self.assertEqual(room, original)
        layout = result["extensions"]
        self.assertEqual((len(layout["layout"]), {len(line) for line in layout["layout"]}), (50, {50}))
        self.assertEqual(layout["retained"], 2)
        self.assertEqual(len(layout["changes"]["add"]), 4)
        self.assertEqual(layout["changes"]["move"], [])
        self.assertEqual(layout["changes"]["remove"], [])
        for change in layout["changes"]["add"]:
            self.assertNotIn(point(change), grid.occupied)
            self.assertNotIn(point(change), layout["reserved"]["tiles"])
        for cost in layout["retainedExtensionCosts"]:
            self.assertEqual(cost["current"], cost["proposed"])
        miner = result["mining"]["sources"][0]
        self.assertEqual(miner["minerWork"], 5)
        self.assertGreaterEqual(miner["idealHaulEnergyPerTick"], 10)
        self.assertGreaterEqual(miner["carryPartsRequired"] * 50, 10 * miner["cycleTicksModeled"])
        self.assertEqual(simulate(room, grid, 10), result)

    def test_two_sources_keep_miner_and_pickup_tiles_distinct(self):
        room, grid = scenario(source_count=2)
        rows = simulate(room, grid, 0)["mining"]["sources"]
        self.assertEqual({row["sourceId"] for row in rows}, {"S1", "S2"})
        self.assertEqual(len({row[key] for row in rows for key in ("stand", "pickup")}), 4)
        for row in rows:
            self.assertNotIn(rows[0]["stand"], row["loadedPath"])
            self.assertNotIn(rows[1]["stand"], row["loadedPath"])

    def test_blocked_mining_stands_choose_alternative_or_keep_workers(self):
        room, grid = scenario()
        current = simulate(room, grid, 0)["mining"]["sources"][0]["stand"]
        alternate = simulate(room, grid, 0, {current})["mining"]["sources"][0]["stand"]
        self.assertNotEqual(current, alternate)
        blocked = set(grid.stands(point(room["sources"][0]), frozenset()))
        self.assertEqual(simulate(room, grid, 0, blocked)["mining"]["status"], "worker_fallback")

    def test_missing_storage_routes_to_spawn_and_reserves_space(self):
        room, grid = scenario(storage=False)
        plan = simulate(room, grid, 2)
        self.assertEqual(plan["depot"]["type"], "spawn")
        self.assertIn("storage", plan["extensions"]["reserved"]["future"])
        self.assertEqual(plan["links"]["status"], "use_hauling")


class LinkTests(unittest.TestCase):
    def setUp(self):
        self.room, self.grid = scenario(link_network=True)
        self.mining = {"S1": {"stand": (11, 17), "pickup": (12, 18)}}

    def test_link_priority_capacity_loss_and_topology_comparison(self):
        plan = link_model(self.grid, self.room, self.mining)
        self.assertEqual({key: row["role"] for key, row in plan["roles"].items()},
                         {"L1": "source", "L2": "storage", "L3": "controller"})
        self.assertEqual(plan["proposals"], [{"from": "L1", "to": "L3", "send": 400,
                                             "estimatedReceived": 388, "estimatedLoss": 12, "cooldownTicks": 24}])
        controller = next(row for row in plan["topologies"] if row["destination"] == "controller")
        self.assertEqual([item["path"] for item in controller["variants"]],
                         ["hauling", ["L1", "L3"], ["L1", "L2", "L3"]])

    def test_cooldown_and_small_receiver_space_keep_hauling(self):
        self.room["links"][0]["cooldown"] = 5
        self.room["links"][1]["cooldown"] = 1
        self.assertEqual(link_model(self.grid, self.room, self.mining)["status"], "use_hauling")
        self.room["links"][0]["cooldown"] = 0
        self.room["links"][1]["energy"] = 795
        self.room["links"][2]["energy"] = 399
        self.assertEqual(link_model(self.grid, self.room, self.mining)["proposals"], [])

    def test_unfinished_link_is_not_receiver_and_counts_against_rcl(self):
        pending = self.room["links"].pop()
        self.room["structures"].remove(pending)
        self.room["sites"].append(pending)
        grid = RoomGrid(self.room, self.grid.terrain, [])
        plan = link_model(grid, self.room, self.mining)
        self.assertEqual(plan["additionalRclSlots"], 0)
        self.assertTrue(all(proposal["to"] != pending["id"] for proposal in plan["proposals"]))
        self.room["rclLimits"]["link"] = 1
        self.assertEqual(link_model(grid, self.room, self.mining)["status"], "LINK_RCL_LIMIT_EXCEEDED")


class PilotTests(unittest.TestCase):
    def evaluate(self, **overrides):
        return pilot_decision(**({
            "enabled": True, "defense_needed": False, "workers_healthy": 3, "worker_floor": 2,
            "energy": 1000, "worker_minimum": 250, "spawn_busy": False,
            "expansion_claimed_spawn": False, "next_body_cost": 600, "station_valid": True,
            "miner_ready": False, "hauler_ready": True,
        } | overrides))

    def test_low_energy_recovery_retains_worker_priority_and_reserve(self):
        self.assertEqual(self.evaluate(energy=200)["action"], "KEEP_NATIVE_WORKER_POLICY")
        self.assertEqual(self.evaluate(energy=600)["action"], "WAIT_KEEP_WORKER_ENERGY_RESERVE")
        self.assertEqual(self.evaluate(energy=900)["action"], "MODEL_MINER_REPLACEMENT")

    def test_death_or_unready_replacement_reenables_fallback(self):
        self.assertFalse(self.evaluate(miner_ready=True)["workerFallback"])
        result = self.evaluate(miner_ready=True, hauler_ready=False)
        self.assertTrue(result["retainWorkers"])
        self.assertTrue(result["workerFallback"])
        self.assertEqual(result["action"], "MODEL_HAULER_REPLACEMENT")
        self.assertTrue(self.evaluate(station_valid=False, miner_ready=True)["workerFallback"])

    def test_expansion_spawn_contention_keeps_workers(self):
        self.assertEqual(self.evaluate(expansion_claimed_spawn=True)["action"], "WAIT_FOR_SPAWN")
        self.assertEqual(self.evaluate(spawn_busy=True)["action"], "WAIT_FOR_SPAWN")
        self.assertEqual(self.evaluate(workers_healthy=1)["action"], "KEEP_NATIVE_WORKER_POLICY")

    def test_handover_never_relabels_workers(self):
        self.assertTrue(self.evaluate()["retainWorkers"])
        stable = self.evaluate(miner_ready=True)
        self.assertEqual(stable["action"], "OBSERVE_PILOT_WITH_WORKERS_RETAINED")
        self.assertTrue(stable["retainWorkers"])
        self.assertEqual(self.evaluate(enabled=False)["action"], "KEEP_NATIVE_WORKER_POLICY")
        self.assertTrue(self.evaluate(enabled=False, miner_ready=True)["workerFallback"])


class BaselineTests(unittest.TestCase):
    def fixture(self):
        return [
            {"collectedAt": (NOW - timedelta(hours=2 - i)).isoformat(),
             "activeCode": {"sha256": "hash", "buildId": "v3", "branch": "agent-test"},
             "facts": {"runtimeSnapshotTick": 100 + i * 100, "runtimeBuildId": "v3", "observationAgeTicks": 15,
                       "rooms": {"E22S36": {"owned": True, "energy": 1200}}}}
            for i in range(3)
        ]

    def test_missing_live_fields_remain_unavailable_despite_trend_window(self):
        report, sample = baseline(self.fixture(), "E22S36", NOW)
        self.assertTrue(report["comparableWindowReady"])
        self.assertEqual(len(report["samples"]), 3)
        self.assertFalse(report["telemetryAvailable"])
        self.assertIn("layout", report["missing"])
        self.assertIsNone(sample)

    def test_build_mismatch_and_recent_failure_cannot_produce_current_geometry(self):
        samples = self.fixture()
        samples[-1]["facts"]["runtimeBuildId"] = "other"
        report, sample = baseline(samples, "E22S36", NOW)
        self.assertEqual(report["status"], "historical")
        self.assertIsNone(sample)
        self.assertFalse(report["comparableWindowReady"])

    def test_static_cache_requires_matching_layout_and_verified_terrain(self):
        room, fixture_grid = scenario()
        room["layoutKey"] = "layout"
        sample = {"telemetry": {"rooms": {"E22S36": room}}}
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            base = Path(directory)
            cache = base / "static"
            cache.mkdir()
            terrain_file = cache / "terrain.json"
            terrain_file.write_text(json.dumps({"terrain": fixture_grid.terrain}), encoding="utf-8")
            entry = {"layoutKey": "layout", "minerals": [{"x": 26, "y": 19}],
                     "terrainRef": {"file": str(terrain_file),
                                    "sha256": hashlib.sha256(fixture_grid.terrain.encode("ascii")).hexdigest()}}
            sample["staticLayouts"] = {"E22S36": entry}
            _, grid = room_geometry(sample, "E22S36", base)
            self.assertIn((26, 19), grid.blocked)
            entry["layoutKey"] = "old"
            with self.assertRaisesRegex(ValueError, "mismatched"):
                room_geometry(sample, "E22S36", base)
            entry["layoutKey"] = "layout"
            entry["terrainRef"]["sha256"] = "wrong"
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                room_geometry(sample, "E22S36", base)

    def test_covered_counters_report_rates_and_refuse_cross_epoch(self):
        samples = self.fixture()
        for i, sample in enumerate(samples):
            sample["telemetry"] = {"available": True, "rooms": {"E22S36": {
                "visible": True, "sources": [{"id": "S1"}], "links": [{"id": "L1", "cooldown": 5}]}},
                "counters": {"epoch": "a", "rooms": {"E22S36": {"epoch": "a", "observedTicks": 90 * i,
                             "eventTicksRead": 80 * i, "spawnBusyTicks": 45 * i, "economyEventTicks": 80 * i}},
                             "sources": {"S1": {"epoch": "a", "observedTicks": 90 * i, "eventTicksRead": 80 * i,
                                         "harvestAmountEvents": 400 * i, "fullTicks": 2 * i, "withAdjacentWorkTicks": 70 * i}},
                             "links": {"L1": {"verifiedSentEnergy": 200 * i, "verifiedSendEvents": i,
                                               "activeObservedTicks": 80 * i, "cooldownReadyTicks": 40 * i}}}}
        report, _ = baseline(samples, "E22S36", NOW)
        self.assertEqual(report["coverage"]["eventTickCoverage"], .8)
        self.assertEqual(report["coverage"]["spawnBusyFractionAnySpawn"], .5)
        self.assertEqual(report["sources"][0]["harvestPerCoveredEventTick"], 5)
        self.assertEqual(report["sources"][0]["ticksWithoutAdjacentWork"], 40)
        self.assertEqual(report["links"][0]["sent"], 400)
        self.assertEqual(report["links"][0]["cooldownReadyFraction"], .5)
        samples[1]["telemetry"]["counters"]["sources"]["S1"]["epoch"] = "reset"
        report, _ = baseline(samples, "E22S36", NOW)
        self.assertIsNone(report["sources"][0]["harvestPerCoveredEventTick"])


if __name__ == "__main__":
    unittest.main()
