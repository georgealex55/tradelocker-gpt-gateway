"""Regression checks for calendar coverage and DST-sensitive forced exits."""
from importlib import import_module
from math import isclose
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
controls = import_module("xmi-session-event-controls")


class EventControlTests(unittest.TestCase):
    def test_timestamps_require_offsets(self):
        with self.assertRaises(ValueError):
            controls.epoch_ms("2024-01-01T00:00:00")

    def test_incomplete_calendar_blocks_strict_news(self):
        calendar = {
            "coverage": "partial", "complete_currencies": [], "events": [],
            "valid_from": "2024-01-01T00:00:00Z", "valid_to": "2024-02-01T00:00:00Z",
        }
        profiles = controls.build_profiles("XAUUSD", calendar, {}, False)
        self.assertEqual(profiles["news"].entry_reason(controls.epoch_ms("2024-01-02T12:00:00Z")),
                         "calendar_incomplete")

    def test_news_scope_matches_symbol_currencies(self):
        calendar = {
            "coverage": "partial", "complete_currencies": [],
            "valid_from": "2024-01-01T00:00:00Z", "valid_to": "2024-02-01T00:00:00Z",
            "events": [{"kind": "macro", "currencies": ["EUR"], "scheduled_at": "2024-01-05T12:00:00Z"}],
        }
        settings = {"preEventMinutes": 60, "postEventMinutes": 30}
        at = controls.epoch_ms("2024-01-05T12:00:00Z")
        self.assertEqual(controls.build_profiles("EURUSD", calendar, settings, True)["news"].entry_reason(at), "news")
        self.assertIsNone(controls.build_profiles("USDJPY", calendar, settings, True)["news"].entry_reason(at))

    def test_rollover_follows_winter_and_summer_clocks(self):
        for date, expected in [("2024-01-03", "21:45"), ("2024-07-03", "20:45")]:
            start = controls.epoch_ms(date + "T00:00:00Z")
            end = start + 24 * 60 * controls.MINUTE
            restriction = controls.Restrictions(controls.merge_intervals(controls.rollover_windows(start, end)))
            boundary = controls.epoch_ms(date + "T" + expected + ":00Z")
            self.assertIsNone(restriction.entry_reason(boundary - 1))
            self.assertEqual(restriction.entry_reason(boundary), "rollover")

    def test_friday_window_covers_sunday_open(self):
        start = controls.epoch_ms("2024-07-07T00:00:00Z")
        restriction = controls.Restrictions(controls.merge_intervals(controls.rollover_windows(start, start + 86400000)))
        at = controls.epoch_ms("2024-07-07T21:15:00Z")
        self.assertEqual(restriction.entry_reason(at), "rollover")
        self.assertIsNone(restriction.entry_reason(at + 1))

    def test_blackout_boundaries_are_inclusive_and_merge(self):
        restriction = controls.Restrictions(controls.merge_intervals([(10, 20, "news"), (20, 30, "rollover")]))
        self.assertEqual(restriction.entry_reason(10), "news+rollover")
        self.assertEqual(restriction.entry_reason(30), "news+rollover")
        self.assertIsNone(restriction.entry_reason(31))

    def test_exposed_position_flattens_before_news(self):
        study = SimpleNamespace(symbol="XAUUSD", t=np.arange(100, 104),
            plan=lambda variant: (np.array([0, 2]), np.array([3, 3]), np.array([1, -1]),
                                  np.ones(2), None, np.array([3, 3])))
        variant = controls.research.Variant("trend-momentum", 15, "ny-intraday", .01, 8., 2., 210)
        stamps = np.arange(100, 104) * controls.MINUTE + 100
        bid = np.array([2000., 2001., 1900., 1900.])
        restriction = controls.Restrictions(((102 * controls.MINUTE, 103 * controls.MINUTE + 59999, "news"),))
        result = controls.quote.replay(study, variant, 1., (0, 4), np.arange(4), {3},
                                       stamps, bid, bid + .45, "observed", restriction)
        self.assertEqual(result["control_exits"], {"news": 1})
        self.assertEqual(result["skip_counts"]["news"], 1)
        self.assertTrue(isclose(result["net_usd"], .34, abs_tol=1e-6))


class CompleteCalendarTests(unittest.TestCase):
    def test_observed_low_impact_event_does_not_block(self):
        calendar = {
            "coverage": "complete", "complete_currencies": ["USD", "JPY"],
            "valid_from": "2022-01-01T00:00:00Z", "valid_to": "2025-01-01T00:00:00Z",
            "events": [{"kind": "macro", "risk_action": "observe", "currencies": ["USD"],
                        "scheduled_at": "2024-01-05T12:00:00Z"}],
        }
        profiles = controls.build_profiles("USDJPY", calendar, {}, False)
        self.assertFalse(profiles["news"].coverage_missing)
        self.assertIsNone(profiles["news"].entry_reason(controls.epoch_ms("2024-01-05T12:00:00Z")))

    def test_non_us_central_bank_uses_wider_window(self):
        calendar = {
            "coverage": "complete", "complete_currencies": ["USD", "CAD"],
            "valid_from": "2022-01-01T00:00:00Z", "valid_to": "2025-01-01T00:00:00Z",
            "events": [{"kind": "central_bank", "currencies": ["CAD"],
                        "scheduled_at": "2024-01-24T14:45:00Z"}],
        }
        settings = {"fomcPreEventMinutes": 90, "fomcPostEventMinutes": 60}
        policy = controls.build_profiles("USDCAD", calendar, settings, False)["news"]
        self.assertEqual(policy.entry_reason(controls.epoch_ms("2024-01-24T13:15:00Z")), "news")
        self.assertEqual(policy.entry_reason(controls.epoch_ms("2024-01-24T15:45:00Z")), "news")
        self.assertIsNone(policy.entry_reason(controls.epoch_ms("2024-01-24T15:45:01Z")))

    def test_unknown_time_blocks_entire_day(self):
        calendar = {
            "coverage": "complete", "complete_currencies": ["USD"],
            "valid_from": "2022-01-01T00:00:00Z", "valid_to": "2025-01-01T00:00:00Z",
            "events": [{"kind": "macro", "currencies": ["USD"],
                        "blackout_from": "2024-01-05T00:00:00Z", "blackout_to": "2024-01-06T00:00:00Z"}],
        }
        policy = controls.build_profiles("XAUUSD", calendar, {"preEventMinutes": 60, "postEventMinutes": 30}, False)["news"]
        self.assertEqual(policy.entry_reason(controls.epoch_ms("2024-01-05T23:59:59Z")), "news")

    def test_variable_boj_release_stays_uncertain(self):
        importer = import_module("xmi-session-calendar")
        day = {"dateline": 1705968000}
        event = {"id": 1, "currency": "JPY", "impactName": "medium", "name": "BOJ Policy Rate",
                 "dateline": 1705979340, "timeMasked": False, "url": "/calendar"}
        result = importer.normalize_event(event, day)
        self.assertEqual(result["time_status"], "uncertain")
        self.assertEqual(result["risk_action"], "blackout")
        self.assertNotIn("scheduled_at", result)

    def test_full_calendar_days_follow_daylight_saving(self):
        importer = import_module("xmi-session-calendar")
        for stamp, hours in [(1711843200, 23), (1729983600, 25)]:
            event = {"id": stamp, "currency": "EUR", "impactName": "high", "name": "Tentative release",
                     "dateline": stamp, "timeMasked": True, "url": "/calendar"}
            result = importer.normalize_event(event, {"dateline": stamp})
            duration = controls.epoch_ms(result["blackout_to"]) - controls.epoch_ms(result["blackout_from"])
            self.assertEqual(duration, hours * 60 * controls.MINUTE)

    def test_missing_provider_day_rejects_completeness(self):
        importer = import_module("xmi-session-calendar")
        with self.assertRaises(ValueError):
            importer.extract_days(b'days: [{"dateline":1704067200,"events":[]}]', 2024, 1)


if __name__ == "__main__":
    unittest.main()
