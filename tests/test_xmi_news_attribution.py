"""Check that overlap attribution reconciles without inventing event causality."""
from importlib import import_module
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
analysis = import_module("xmi-session-news-attribution")
MINUTE = analysis.controls.MINUTE


class NewsAttributionTests(unittest.TestCase):
    def test_overlapping_event_bundle_is_not_counted_twice(self):
        original = [{"entry_minute": 1, "exit_minute": 6, "side": 1, "units": 2., "pnl_usd": 10.},
                    {"entry_minute": 4, "exit_minute": 5, "side": 1, "units": 1., "pnl_usd": 20.}]
        controlled = [{"entry_minute": 1, "exit_minute": 3, "side": 1, "units": 1., "pnl_usd": 3.},
                      {"entry_minute": 9, "exit_minute": 10, "side": 1, "units": 1., "pnl_usd": -5.}]
        events = [{"id": str(i), "name": name, "left": 4 * MINUTE, "right": 8 * MINUTE}
                  for i, name in enumerate(("Decision", "Statement"))]
        result = analysis.accounting(original, controlled, events)
        self.assertEqual(result["total_net_change_usd"], -32.)
        self.assertEqual(result["removed_net_usd"], 20.)
        self.assertEqual(len(result["blocked_entry_bundles"]), 1)
        self.assertEqual(result["blocked_entry_bundles"][0]["trades"], 1)
        self.assertEqual(result["early_exits"][0]["exit_effect_at_original_units_usd"], -4.)
        self.assertEqual(result["early_exits"][0]["size_effect_usd"], -3.)

    def test_missing_direct_overlap_is_left_as_path_effect(self):
        original = [{"entry_minute": 1, "exit_minute": 2, "side": 1, "units": 1., "pnl_usd": -3.}]
        result = analysis.accounting(original, [], [{"id": "future", "name": "Later release", "left": 9 * MINUTE, "right": 10 * MINUTE}])
        self.assertEqual(result["removed_entries_without_direct_blackout"], 1)
        self.assertEqual(result["removed_unassigned_net_usd"], -3.)
        self.assertEqual(result["blocked_entry_bundles"], [])

    def test_merged_windows_keep_all_overlapping_event_identities(self):
        start = analysis.research.utc_minute("2024-01-02") * MINUTE
        records = [{"id": str(i), "name": str(i), "left": start + left * MINUTE,
                    "right": start + right * MINUTE, "uncertain": False}
                   for i, (left, right) in enumerate(((1, 4), (4, 6), (8, 10)))]
        windows = analysis.components(records, ("2024-01-01", "2025-01-01"))
        self.assertEqual(len(windows), 2)
        self.assertEqual(windows[0]["ids"], ["0", "1"])
        self.assertEqual(windows[0]["right"], start + 6 * MINUTE)


if __name__ == "__main__":
    unittest.main()
