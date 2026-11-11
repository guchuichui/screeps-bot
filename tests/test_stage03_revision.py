import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
from screeps_home_layout import point
from screeps_stage03_revision import EAST, FUTURE_LINK_SITES, PASSING, WEST, plan_extensions, read


class RevisedExtensionPlanTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.baseline = read(ROOT / "docs/stage-03/coordinates-and-costs.json")
        cls.report, cls.structures = plan_extensions(cls.baseline)

    def test_fill_ten_before_any_retirements_and_preserve_routes(self):
        phases = self.report["phases"]
        self.assertEqual(phases["baseline"]["extensions"], 30)
        self.assertEqual(phases["allTenBuilt"]["extensions"], 40)
        self.assertEqual(phases["baseline"]["pathCosts"], phases["allTenBuilt"]["pathCosts"])
        self.assertEqual([phase["spawnCapacityAtRcl6"] for phase in phases.values()],
                         [1800, 2300, 2250, 2150, 2000, 2000])

    def test_reserved_passes_and_future_sites_never_used_for_extensions(self):
        reserved = set(EAST + PASSING + WEST + FUTURE_LINK_SITES)
        self.assertTrue(reserved.isdisjoint(point(obj) for obj in self.report["buildFirst"]))
        self.assertEqual([point(obj) for obj in self.report["roadsWaitingForLinkRetirement"]], [(39, 19)])
        self.assertEqual(self.report["phases"]["roadsBeforeLinkRetirement"]["extensions"], 34)

    def test_saved_report_is_reproducible(self):
        saved = read(ROOT / "docs/stage-03-revision/coordinates.json")
        self.assertEqual(json.loads(json.dumps(self.report)), saved)

    def test_refuses_conflicting_sites(self):
        snapshot = {**self.baseline["snapshot"], "sites": [{"type": "extension", "x": 1, "y": 1}]}
        with self.assertRaisesRegex(ValueError, "10 free"):
            plan_extensions({**self.baseline, "snapshot": snapshot})

    def test_replacement_links_and_zero_link_phase_are_reproducible(self):
        from screeps_stage03_link_plan import plan_links

        report = plan_links(self.baseline)
        self.assertEqual(json.loads(json.dumps(report)), read(ROOT / "docs/stage-03-revision/links.json"))
        self.assertEqual([point(obj) for obj in report["retireAfterTenBuiltAndApproval"]], [(31, 18), (39, 19)])
        self.assertEqual(len(report["buildAfterRetirementAndApproval"]), 3)
        self.assertEqual(report["phases"]["zeroLinks"]["spawnCapacityAtRcl6"], 2000)
        self.assertEqual(report["phases"]["newLink3"]["pathCosts"], report["phases"]["zeroLinks"]["pathCosts"])
        self.assertEqual(report["storageInteraction"], [(37, 15)])
