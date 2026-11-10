#!/usr/bin/env python3
"""Offline XMI evidence-reuse guard.

Run BEFORE seeking user screenshots, asking broker questions or re-running a
historical scenario. It checks previously supplied user instrument evidence,
replay provenance and unresolved GatesFX history independently of any network.
Does not download prices, read 2025, trade or edit production.
"""
import argparse
import copy
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEDGER = "docs/research/xmi-gatesfx-evidence-ledger-20261110.json"
PAIRS = ("EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "USDCAD", "NZDUSD")
REQUIRED_FIELDS = ("lotSize", "minLot", "symbolLeverage", "marginPercent",
                   "snapshotSpreadPoints", "openingFeePerLotUSD")
REQUIRED_UNVERIFIED = ("historical_stp_bid_ask", "actual_execution_slippage_and_fills",
                       "historical_swap_fee_schedule",
                       "account_specific_stopout_margin_tiers_step_max_lots")


def load_evidence(root=ROOT):
    with (root / LEDGER).open(encoding="utf-8") as f:
        ledger = json.load(f)
    with (root / ledger["provenance"]["scenario_inputs"]).open(encoding="utf-8") as f:
        snapshots = json.load(f)
    with (root / ledger["provenance"]["completed_sensitivity_results"]).open(encoding="utf-8") as f:
        results = json.load(f)
    return ledger, snapshots, results


def check(ledger, snapshots, results, root=ROOT):
    """Return fail-closed integrity faults. No historic fill claims are inferred."""
    errors = []
    def require(condition, message):
        if not condition:
            errors.append(message)

    require(ledger.get("schema_version") == 1, "Unexpected ledger schema")
    capture = ledger.get("user_evidence_present", {})
    require(tuple(capture.get("seven_fx_pairs", [])) == PAIRS,
            "Screenshot ledger lacks ordered seven-pair scope")
    require(capture.get("gold_separately") == ["XAUUSD"],
            "XAUUSD must be recorded separately from seven FX majors")
    require(capture.get("request_existing_screenshots_again") is False,
            "Previously provided complete instrument screenshots must not be requested again")
    require(capture.get("status") == "CAPTURED_PLATFORM_SNAPSHOT_NOT_HISTORICAL_EXECUTION",
            "Current user screenshots must not be labeled historical broker execution")

    scenarios = snapshots.get("seven_majors", {})
    require(set(scenarios) == set(PAIRS),
            "Captured snapshot input must contain exactly seven Forex majors")
    for pair in PAIRS:
        spec = scenarios.get(pair, {})
        for field in REQUIRED_FIELDS:
            require(isinstance(spec.get(field), (int, float)) and not isinstance(spec.get(field), bool),
                    f"{pair}: missing/non-numeric captured {field}")
        require(spec.get("lotSize", 0) > 0 and spec.get("minLot", 0) > 0,
                f"{pair}: invalid captured lot or minimum")
        require(spec.get("marginPercent", 0) > 0 and spec.get("symbolLeverage", 0) > 0,
                f"{pair}: invalid captured margin or leverage")
        require(spec.get("specStatus") == "PLATFORM_SCREENSHOT_PARTIAL",
                f"{pair}: screenshot cannot establish complete historical broker verification")
        require(spec.get("costStatus") == "SNAPSHOT_SPREAD_SCENARIO_HISTORICAL_BROKER_UNVERIFIED",
                f"{pair}: captured spread must not be labeled historical GatesFX cost")
        require("lotStep_assumed" in spec and "lotStep_verified" not in spec,
                f"{pair}: lot step must remain labeled assumed until new evidence exists")
        require(spec.get("swapLongUsdPerLotPerNight") is None and
                spec.get("swapShortUsdPerLotPerNight") is None,
                f"{pair}: swap must remain unpriced until broker records verify history")
    require(snapshots.get("snapshot_quote_timestamp") == "not visible",
            "No timestamp was captured for snapshot quote; cannot infer historical time")
    require(snapshots.get("gold_separate", {}).get("symbol") == "XAUUSD",
            "Missing separately recorded gold specifications")

    completed = ledger.get("replays", {})
    observed = results.get("replays", {})
    expected = completed.get("breakdown", {})
    require(completed.get("folds") == [2022, 2023] and
            results.get("folds") == [2022, 2023], "Historical training folds changed")
    require(completed.get("holdout_2025_read") is False and
            results.get("holdout_2025_read") is False, "2025 holdout must remain declared unread")
    require(results.get("historical_gatesfx_spreads_verified") is False,
            "Screenshot scenario cannot be promoted into historical GatesFX spread verification")
    require(ledger.get("status") == "PARTIAL_BROKER_VERIFICATION_PROVISIONAL_UNRANKED" and
            results.get("status") == "PROVISIONAL_UNRANKED",
            "Results cannot be called verified or ranked from screenshots")
    require(expected.get("cleaned_fixed_2pip_baseline") == observed.get("refreshed_baseline") and
            expected.get("gatesfx_snapshot_fixed_spread") == observed.get("screenshot_spread") and
            expected.get("separate_experimental_2pct") == observed.get("experimental_2pct"),
            "Replay component counts disagree with saved completed results")
    require(completed.get("total_scenario_years") == observed.get("total") ==\n            sum(observed.get(k, 0) for k in ("refreshed_baseline", "screenshot_spread", "experimental_2pct")) == 6048,
            "Completed replay tally disagrees with saved research evidence")
    require(set(x.get("symbol") for x in results.get("pair_results", [])) == set(PAIRS) and
            len(results.get("pair_results", [])) == 7,
            "Completed scenario-year replay missing or duplicating a pair")
    require(all(ledger.get("verified_gatesfx_history", {}).get(k) is False
                for k in REQUIRED_UNVERIFIED),
            "Outstanding broker historical items cannot be marked verified without new evidence")
    require(completed.get("avoid_identical_unjustified_reruns") is True,
            "Do not repeat identical full-price backtests without a distinct purpose")

    required_paths = ("spec_matrix", "scenario_inputs", "completed_sensitivity_report",
                      "completed_sensitivity_results", "prior_research_report")
    provenance = ledger.get("provenance", {})
    for key in required_paths:
        rel = provenance.get(key, "")
        require(bool(rel) and (root / rel).is_file(), f"Missing committed evidence {key}: {rel}")
    open_fields = ledger.get("outstanding_only", [])
    open_keys = [x.get("key") for x in open_fields]
    require(len(open_keys) == len(set(open_keys)) and len(open_keys) >= 5,
            "Outstanding-only broker data questions must have distinct identifiers")
    require(not any("resend" in str(x).lower() or "complete screenshot bundle" in str(x).lower()
                    for x in open_fields), "Outstanding list must not ask to repeat prior bundle")
    return errors


def status(root=ROOT):
    ledger, screenshots, results = load_evidence(root)
    errors = check(ledger, screenshots, results, root)
    return {
        "passed": len(errors) == 0,
        "errors": errors,
        "known_and_reusable": {
            "captured_instrument_pairs": ledger["user_evidence_present"]["seven_fx_pairs"],
            "gold_separately_captured": ledger["user_evidence_present"]["gold_separately"],
            "historical_sensitivity_replays_done": ledger["replays"]["total_scenario_years"],
            "screenshot_source": ledger["provenance"]["spec_matrix"],
            "rerun_evidence": ledger["provenance"]["completed_sensitivity_report"],
            "re_request_existing_instrument_screenshots": False
        },
        "only_unverified_fields_to_resolve": [
            {"key": x["key"], "request": x["request"]}
            for x in ledger["outstanding_only"]
        ],
        "broker_history_verification_gate": "BLOCKED",
        "historical_profitability_rankings": "PROVISIONAL_UNRANKED",
        "holdout_2025_read": False
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", action="store_true", help="Print machine-readable preflight")
    args = parser.parse_args()
    report = status()
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print("XMI evidence reuse preflight:", "PASS" if report["passed"] else "FAIL")
        print("Already captured: seven Forex pairs + separate gold. DO NOT RE-REQUEST screens.")
        print("Already replayed: 6,048 historical scenario-years; do not blindly repeat.")
        print("Still missing GatesFX evidence:")
        for item in report["only_unverified_fields_to_resolve"]:
            print(" -", item["key"], ":", item["request"])
        for error in report["errors"]:
            print("ERROR:", error, file=sys.stderr)
    sys.exit(0 if report["passed"] else 1)
