import test from "node:test";
import assert from "node:assert/strict";
import {MT5_EXECUTION_ENABLED,MT5_SOURCE,validateMt5Manifest,assertMt5ResearchWindow,mt5Unavailable,assertMt5OfflineOnly} from "../lib/mt5/contract.mjs";
const sample={contractVersion:1,source:MT5_SOURCE,readOnly:true,executionEnabled:false,kind:"ticks",symbol:"EURUSD",
  sha256:"a".repeat(64),exportedAt:"2026-11-12T07:00:00Z",timezone:"UTC",
  window:{from:"2022-01-01T00:00:00Z",to:"2023-01-01T00:00:00Z"},rows:2};
test("valid manifest is normalized and immutable",()=>{
  const x=validateMt5Manifest(sample);
  assert.equal(x.source,MT5_SOURCE);assert.equal(x.rows,2);assert.equal(Object.isFrozen(x),true);
});
test("2025 overlap rejected before import",()=>{
  for(const window of [
    {from:"2024-12-31T00:00:00Z",to:"2025-01-01T00:00:01Z"},
    {from:"2025-01-01T00:00:00Z",to:"2026-01-01T00:00:00Z"},
    {from:"2024-01-01T00:00:00Z",to:"2026-02-01T00:00:00Z"}
  ])assert.throws(()=>assertMt5ResearchWindow(window),/MT5_SEALED_2025_WINDOW/);
});
test("no unapproved years or local timestamps",()=>{
  assert.throws(()=>assertMt5ResearchWindow({from:"2021-01-01T00:00:00Z",to:"2022-01-01T00:00:00Z"}),/MT5_YEAR_NOT_APPROVED/);
  assert.throws(()=>assertMt5ResearchWindow({from:"2026-01-01",to:"2026-02-01"}),/MT5_EXPLICIT_UTC_REQUIRED/);
});
test("fail closed for source spoofing, execution, malformed symbol and hashes",()=>{
  for(const patch of [{source:"Twelve Data"},{readOnly:false},{executionEnabled:true},{kind:"order_send"},
    {symbol:"../private"},{sha256:"bad"},{timezone:"Broker/Local"}])
    assert.throws(()=>validateMt5Manifest({...sample,...patch}));
});
test("MT5 is offline only, unavailable is explicit",()=>{
  assert.equal(MT5_EXECUTION_ENABLED,false);
  assert.equal(mt5Unavailable().status,"UNAVAILABLE");
  assert.equal(assertMt5OfflineOnly({provider:"MetaTrader 5",source:MT5_SOURCE,mode:"OFFLINE_HISTORICAL_RESEARCH"}),true);
  assert.throws(()=>assertMt5OfflineOnly({provider:"MetaTrader 5",source:MT5_SOURCE,mode:"LIVE"}),/MT5_UNSAFE_PROVIDER_MODE/);
});
