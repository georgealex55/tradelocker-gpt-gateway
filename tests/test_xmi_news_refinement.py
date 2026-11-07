"""Protect high-risk event rules and training-only policy selection."""
from copy import deepcopy
from importlib import import_module
from pathlib import Path
import json
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
refine = import_module("xmi-session-news-refinement")
controls = refine.controls
CATALOG = json.loads((Path(__file__).resolve().parents[1] / "docs/xmi-session-news-policy-candidates-20261107.json").read_text())
POLICIES = CATALOG["policies"]
SETTINGS = {"preEventMinutes": 60, "postEventMinutes": 30,
            "fomcPreEventMinutes": 90, "fomcPostEventMinutes": 60}


def calendar(events):
    return {"coverage": "complete", "complete_currencies": ["USD"], "events": events,
            "valid_from": "2022-01-01T00:00:00Z", "valid_to": "2025-01-01T00:00:00Z"}


def event(**kwargs):
    return {"kind": "macro", "risk_action": "blackout", "currencies": ["USD"],
            "impact": "high", "source_currency": "USD", **kwargs}


class NewsRefinementTests(unittest.TestCase):
    def test_medium_global_scope_does_not_remove_high_global_events(self):
        medium = event(source_currency="All", impact="medium", blackout_from="2024-01-02T00:00:00Z", blackout_to="2024-01-03T00:00:00Z")
        high = event(source_currency="All", blackout_from="2024-01-04T00:00:00Z", blackout_to="2024-01-05T00:00:00Z")
        c = calendar([medium, high]); original = deepcopy(c)
        strict = refine.build_policy("XAUUSD", c, SETTINGS, POLICIES[0])
        scoped = refine.build_policy("XAUUSD", c, SETTINGS, POLICIES[3])
        self.assertIn("news", strict.entry_reason(controls.epoch_ms("2024-01-02T15:00:00Z")).split("+"))
        self.assertIsNone(scoped.entry_reason(controls.epoch_ms("2024-01-02T15:00:00Z")))
        self.assertIn("news", scoped.entry_reason(controls.epoch_ms("2024-01-04T15:00:00Z")).split("+"))
        self.assertEqual(c, original)

    def test_unknown_currency_event_keeps_its_full_day_and_original_buffers(self):
        c = calendar([event(blackout_from="2024-01-02T00:00:00Z", blackout_to="2024-01-03T00:00:00Z")])
        scoped = refine.build_policy("XAUUSD", c, SETTINGS, POLICIES[3])
        for at in ("2024-01-01T23:00:00Z", "2024-01-02T23:59:59Z", "2024-01-03T00:30:00Z"):
            self.assertIn("news", scoped.entry_reason(controls.epoch_ms(at)).split("+"))

    def test_holiday_remains_blocked_even_if_global_medium(self):
        c = calendar([event(source_currency="All", impact="holiday", blackout_from="2024-01-02T00:00:00Z", blackout_to="2024-01-03T00:00:00Z")])
        scoped = refine.build_policy("XAUUSD", c, SETTINGS, POLICIES[3])
        self.assertIn("news", scoped.entry_reason(controls.epoch_ms("2024-01-02T15:00:00Z")).split("+"))

    def test_central_bank_buffer_is_unchanged_when_macro_window_shortens(self):
        c = calendar([event(kind="central_bank", scheduled_at="2024-01-09T15:00:00Z")])
        profile = refine.build_policy("XAUUSD", c, SETTINGS, POLICIES[3])
        self.assertEqual(profile.entry_reason(controls.epoch_ms("2024-01-09T13:30:00Z")), "news")
        self.assertEqual(profile.entry_reason(controls.epoch_ms("2024-01-09T16:00:00Z")), "news")
        self.assertIsNone(profile.entry_reason(controls.epoch_ms("2024-01-09T16:00:01Z")))

    def test_macro_adjacent_windows_and_rollover_are_explicit(self):
        c = calendar([event(scheduled_at="2024-01-09T15:00:00Z")])
        strict = refine.build_policy("XAUUSD", c, SETTINGS, POLICIES[0])
        scoped = refine.build_policy("XAUUSD", c, SETTINGS, POLICIES[3])
        self.assertEqual(strict.entry_reason(controls.epoch_ms("2024-01-09T14:10:00Z")), "news")
        self.assertIsNone(scoped.entry_reason(controls.epoch_ms("2024-01-09T14:10:00Z")))
        self.assertEqual(scoped.entry_reason(controls.epoch_ms("2024-01-09T14:30:00Z")), "news")
        self.assertEqual(scoped.entry_reason(controls.epoch_ms("2024-01-09T21:45:00Z")), "rollover")

    def test_one_good_cost_case_cannot_override_failed_training_stress(self):
        good = {"n": 50, "net_usd": 10., "profit_factor": 1.2, "max_drawdown": .02, "halted": False}
        cases = {p["id"]: {str(cost): [dict(good), dict(good)] for cost in refine.COSTS} for p in POLICIES}
        for p in POLICIES:
            cases[p['id']]['2.0'][1]['net_usd'] = -1.
        selected = refine.select_training(cases, POLICIES, CATALOG['selection']['requirements_every_training_year_and_cost'])
        self.assertTrue(selected['fallback'])
        self.assertEqual(selected['eligible'], [])
        self.assertEqual(selected['selected'], 'strict_60_30')

    def test_validation_folds_cannot_be_passed_into_selector(self):
        f = {"n": 50, "net_usd": 10., "profit_factor": 1.2, "max_drawdown": .02, "halted": False}
        cases = {p['id']: {str(cost): [dict(f) for _ in range(4)] for cost in refine.COSTS} for p in POLICIES}
        with self.assertRaises(ValueError):
            refine.select_training(cases, POLICIES, CATALOG['selection']['requirements_every_training_year_and_cost'])


if __name__ == '__main__':
    unittest.main()
