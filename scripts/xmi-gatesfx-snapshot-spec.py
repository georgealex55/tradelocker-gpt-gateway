#!/usr/bin/env python3
"""Generate a clearly unverified historical sensitivity spec from user quote snapshots.
No network, credentials, orders, 2024 or 2025 access.
"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "docs/research/xmi-gatesfx-snapshot-scenarios-20261109.json"

def build(symbol):
    data = json.loads(MANIFEST.read_text())
    if symbol not in data["seven_majors"]:
        raise ValueError("Seven registered FX majors only; gold is a separate study")
    x = data["seven_majors"][symbol]
    assert x["lotSize"] == 100000 and x["minLot"] == 0.01
    assert x["marginPercent"] == 0.20 and x["symbolLeverage"] == 500
    assert x["openingFeePerLotUSD"] == 0
    assert x["swapLongUsdPerLotPerNight"] is None
    assert x["swapShortUsdPerLotPerNight"] is None
    return dict(lotSize=x["lotSize"], minLot=x["minLot"],
        lotStep=x["lotStep_assumed"], symbolLeverage=x["symbolLeverage"],
        spreadPrice=x["spreadPrice_snapshot"],
        slippagePriceEachSide=x["slippagePriceEachSide_model"],
        swapLongUsdPerLotPerNight=None,swapShortUsdPerLotPerNight=None,
        specStatus="PLATFORM_SCREENSHOT_PARTIAL",
        costStatus="SNAPSHOT_SPREAD_SCENARIO_HISTORICAL_BROKER_UNVERIFIED",
        leverageStatus="USER_PLATFORM_DISPLAYED")

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--symbol",required=True)
    p.add_argument("--out",type=Path,required=True)
    a = p.parse_args()
    if a.out.exists():
        raise FileExistsError(a.out)
    a.out.write_text(json.dumps(build(a.symbol),indent=2)+"\n")
    print(f"{a.symbol} screenshot cost sensitivity: saved modeled override; historical GatesFX spreads UNVERIFIED")
