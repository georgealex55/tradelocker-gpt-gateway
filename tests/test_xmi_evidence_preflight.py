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

    def test_confirmed_usd_and_both_platforms_reused(self):
        decisions = self.ledger["user_confirmed_research_preferences"]
        self.assertEqual(decisions["broker_account_base_currency"]["value"], "USD")
        self.assertTrue(decisions["platform_access_user_reported"]["TradeLocker"])
        self.assertTrue(decisions["platform_access_user_reported"]["MetaTrader5"])
        self.assertEqual(self.check(), [])

    def test_falsely_marking_mt5_export_verified_fails(self):
        data = copy.deepcopy(self.ledger)
        data["user_confirmed_research_preferences"]["platform_access_user_reported"]["authenticated_platform_or_server_export_verified"] = True
        self.assertTrue(any("authenticated broker server export" in err for err in self.check(ledger=data)))

    def test_shared_capital_request_is_rejected(self):
        data = copy.deepcopy(self.ledger)
        data["user_confirmed_research_preferences"]["funding_model"] = "Shared-capital USD1000 across seven pairs"
        self.assertTrue(any("independent $1000" in err for err in self.check(ledger=data)))

    def test_user_confirmed_usd_cannot_be_ignored(self):
        data = copy.deepcopy(self.ledger)
        data["user_confirmed_research_preferences"]["broker_account_base_currency"]["value"] = "CAD"
        self.assertTrue(any("User-confirmed USD" in err for err in self.check(ledger=data)))

    def test_old_account_currency_question_cannot_return(self):
        data = copy.deepcopy(self.ledger)
        data["outstanding_only"].append({"key": "account_currency_and_closeout", "request": "Tell me account currency"})
        self.assertTrue(any("Do not request USD account currency again" in err for err in self.check(ledger=data)))

    def test_unsupported_rerun_policy_is_rejected(self):
        data = copy.deepcopy(self.ledger)
        data["user_confirmed_research_preferences"]["historical_replay_trigger"] = "Every day, redo previous scenarios"
        self.assertTrue(any("automatic or identical historical replays" in err for err in self.check(ledger=data)))

    def test_unverified_broker_fills_stay_unverified(self):
        data = copy.deepcopy(self.ledger)
        data["verified_gatesfx_history"]["actual_execution_slippage_and_fills"] = True
        self.assertTrue(any("Outstanding broker historical" in x for x in self.check(ledger=data)))


if __name__ == "__main__":
    unittest.main()
