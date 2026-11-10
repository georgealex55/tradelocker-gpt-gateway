#!/usr/bin/env python3
"""Offline regression for evidence reuse and duplicate screenshot requests."""
import copy
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/xmi-evidence-preflight.py"
spec = importlib.util.spec_from_file_location("xmi_evidence_preflight", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class EvidencePreflightTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ledger, cls.snapshots, cls.results = module.load_evidence()

    def check(self, ledger=None, snapshots=None, results=None):
        return module.check(
            ledger if ledger is not None else copy.deepcopy(self.ledger),
            snapshots if snapshots is not None else copy.deepcopy(self.snapshots),
            results if results is not None else copy.deepcopy(self.results)
        )

    def test_existing_seven_fx_and_gold_screen_evidence_passes(self):
        self.assertEqual(self.check(), [])

    def test_missing_previously_captured_pair_is_detected(self):
        data = copy.deepcopy(self.snapshots)
        del data["seven_majors"]["EURUSD"]
        self.assertTrue(any("seven Forex majors" in x for x in self.check(snapshots=data)))

    def test_duplicate_screenshot_request_is_detected(self):
        data = copy.deepcopy(self.ledger)
        data["user_evidence_present"]["request_existing_screenshots_again"] = True
        self.assertTrue(any("screenshots" in x for x in self.check(ledger=data)))

    def test_history_cannot_be_verified_from_snapshot(self):
        data = copy.deepcopy(self.results)
        data["historical_gatesfx_spreads_verified"] = True
        self.assertTrue(any("historical GatesFX" in x for x in self.check(results=data)))

    def test_2025_holdout_cannot_be_misclassified(self):
        data = copy.deepcopy(self.results)
        data["holdout_2025_read"] = True
        self.assertTrue(any("2025 holdout" in x for x in self.check(results=data)))

    def test_replay_counts_must_match_archived_results(self):
        data = copy.deepcopy(self.ledger)
        data["replays"]["total_scenario_years"] = 6248
        self.assertTrue(any("tally disagrees" in x for x in self.check(ledger=data)))

    def test_unverified_lot_step_is_not_silently_promoted(self):
        data = copy.deepcopy(self.snapshots)
        data["seven_majors"]["USDJPY"]["lotStep_verified"] = 0.01
        self.assertTrue(any("lot step" in x for x in self.check(snapshots=data)))

    def test_unverified_broker_fills_stay_unverified(self):
        data = copy.deepcopy(self.ledger)
        data["verified_gatesfx_history"]["actual_execution_slippage_and_fills"] = True
        self.assertTrue(any("Outstanding broker historical" in x for x in self.check(ledger=data)))


if __name__ == "__main__":
    unittest.main()
