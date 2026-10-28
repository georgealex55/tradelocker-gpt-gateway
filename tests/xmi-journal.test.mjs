import test from "node:test";
import assert from "node:assert/strict";
import {parseCSV,normalizeTrade,importTrades,coachSummary,fingerprint} from "../lib/xmiJournal.mjs";
const row={symbol:"SPY",side:"LONG",entry_time:"2026-10-27T14:30:00Z",entry_price:"600",quantity:"2",
 exit_time:"2026-10-27T15:30:00Z",exit_price:"601",setup:"Retest",confirmed:"yes",followed_plan:"no",chased:"yes",moved_stop:""};
test("CSV handles BOM, commas, quotes and CRLF",()=>{
 const r=parseCSV('\uFEFFsymbol,notes\r\nSPY,"Wait, confirm"\r\n');
 assert.deepEqual(r,[["symbol","notes"],["SPY","Wait, confirm"]]);
});
test("Trade import requires canonical entries and never treats BUY fills as trades",()=>{
 const csv="symbol,side,entry_time,entry_price,quantity\nSPY,BUY,2026-10-27T14:30:00Z,600,2";
 const r=importTrades(csv);
 assert.equal(r.trades.length,0);assert.equal(r.errors.length,1);
 assert.match(r.errors[0].reason,/LONG or SHORT/);
});
test("Normalize long and short P/L with mandatory matching exits and timezones",()=>{
 const long=normalizeTrade(row);
 const short=normalizeTrade({...row,side:"SHORT",exit_price:"599"});
 assert.equal(long.pnl,2);assert.equal(short.pnl,2);
 assert.throws(()=>normalizeTrade({...row,entry_time:"2026-10-27T09:30:00"}),/ISO timezone/);
 assert.throws(()=>normalizeTrade({...row,exit_price:""}),/exit time AND price/);
 assert.throws(()=>normalizeTrade({...row,exit_time:"2026-10-26T15:30:00Z"}),/Exit before entry/);
});
test("Private coach only scores explicitly recorded behavior",()=>{
 const x=normalizeTrade(row);
 const result=coachSummary([x]);
 assert.equal(result.completed,1);
 assert.equal(result.consistency,25);
 assert.equal(result.observedChecks,3);
 assert.equal(result.alerts.length,2);
 const missing=normalizeTrade({...row,confirmed:"",followed_plan:"",chased:"",moved_stop:""});
 assert.equal(coachSummary([missing]).consistency,null);
});
test("Duplicate trade fingerprint is deterministic",()=>{
 const a=normalizeTrade(row),b=normalizeTrade({...row,notes:"edited",setup:"different"});
 assert.equal(fingerprint(a),fingerprint(b));
});
test("Oversized and malformed CSV files are rejected",()=>{
 assert.throws(()=>parseCSV('a'.repeat(2_000_001)),/2 MB/);
 assert.throws(()=>parseCSV('symbol,notes\nSPY,"oops'),/Unclosed/);
 assert.throws(()=>importTrades("symbol,side\nSPY,LONG"),/Missing/);
});
