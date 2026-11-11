import copy
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from screeps_stage03_layout import STANDS, checked_add, grid_for, keys, plan, point, read


class Stage03LayoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snapshot = read(ROOT / "docs/stage-03/snapshot.json")
        cls.result = plan(cls.snapshot)
        cls.saved = read(ROOT / "docs/stage-03/coordinates-and-costs.json")

    def test_frozen_real_geometry_and_reproducible_output(self):
        import json
        self.assertEqual(json.loads(json.dumps(self.result)), self.saved)
        self.assertEqual(len(self.snapshot["terrain"]), 2500)
        self.assertEqual(len(self.snapshot["structures"]), 128)
        self.assertEqual([point(obj) for obj in self.snapshot["minerals"]], [(41, 3)])
        self.assertTrue(self.snapshot["supplement"]["crossCheckedGeometry"])

    def test_bad_terrain_and_protected_tiles_fail_closed(self):
        broken = copy.deepcopy(self.snapshot)
        broken["terrain"] = "0" + broken["terrain"][1:]
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            plan(broken)
        for tile in (STANDS[0], (41, 3), (35, 19), (0, 15)):
            with self.assertRaises(ValueError):
                checked_add(self.snapshot, self.snapshot["structures"], "link", tile)

    def test_A_uses_only_one_link_slot_and_retires_nothing(self):
        a = self.result["A"]
        self.assertEqual(a["remove"], [])
        self.assertEqual(a["counts"]["link"], a["limits"]["link"])
        self.assertEqual(a["cost"], 22400)
        self.assertEqual(a["linkNetwork"]["roles"]["storage relay"], (31, 18))
        self.assertEqual(a["linkNetwork"]["storageHandoff"]["cost"], 13)
        edge = a["linkNetwork"]["edges"][0]
        self.assertEqual((edge["cooldownTicks"], edge["modeledNetPerFullBatch"]), (6, 776))

    def test_B_fits_target_caps_and_preserves_fixed_assets(self):
        b = self.result["B"]
        self.assertEqual(b["counts"]["spawn"], 3)
        self.assertEqual(b["counts"]["extension"], 60)
        self.assertEqual(b["counts"]["link"], 6)
        self.assertEqual(b["cost"], 224900)
        self.assertEqual(len(b["remove"]), 19)
        self.assertEqual({obj["type"] for obj in b["remove"]}, {"storage", "extension"})
        self.assertIn(("spawn", (35, 19)), keys(b["structures"]))
        self.assertEqual(b["linkNetwork"]["storageHandoff"]["cost"], 0)
        self.assertEqual(self.result["roadConflictsIfAThenB"], [])

    def test_all_models_preserve_miner_access_and_have_comparable_routes(self):
        expected = {
            "current": (43, 58, 67, 59),
            "A": (14, 24, 32, 26),
            "B": (8, 10, 9, 12),
        }
        routes = ("S1 → Storage", "S2 → Storage", "Storage → Controller", "Storage → Spawn (35, 19)")
        for name, costs in expected.items():
            layout = self.result[name]
            self.assertEqual(tuple(layout["paths"][key]["cost"] for key in routes), costs)
            grid = grid_for(self.snapshot, layout["structures"])
            self.assertTrue(all(grid.walkable(stand, frozenset()) for stand in STANDS))


if __name__ == "__main__":
    unittest.main()
