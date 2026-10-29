import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {normalizeStrategyEdit,sanitizeStrategyEdits,strategyExplanation} from "../lib/xmiStrategyEdits.mjs";
import {newsContextFlag} from "../lib/xmiNewsContext.mjs";
import {evaluateStrategy} from "../lib/xmiStrategyPresets.mjs";
const t=1800000000;
const sample=()=>({lastClosed:{time:t,close:1.18,closed:true},
 overlays:{ema20:[{time:t,value:1.19}],ema50:[{time:t,value:1.16}],
 ema200:[{time:t,value:1.11}],rsi:[{time:t,value:59}],
 macdHistogram:[{time:t,value:-0.01}],vwap:[{time:t,value:1.15}]}});
test("Bounded strategy editor preserves preset categories and rejects unsafe values",()=>{
 const cfg=normalizeStrategyEdit("day",{timeframe:"30m",rsiBull:62,rsiBear:38,requireMacd:true,requireVwap:true,notes:"Review"});
 assert.equal(cfg.timeframe,"30m");assert.equal(cfg.rsiBull,62);assert.equal(cfg.rsiBear,38);
 const bad=normalizeStrategyEdit("day",{timeframe:"javascript:alert(1)",rsiBull:999,rsiBear:-1,notes:"a".repeat(900)});
 assert.equal(bad.timeframe,"15m");assert.equal(bad.rsiBull,55);assert.equal(bad.rsiBear,45);
 assert.equal(bad.notes.length,600);
 const clean=sanitizeStrategyEdits({day:cfg,unknown:{notes:"ignored"}});
 assert.deepEqual(Object.keys(clean),["day"]);
 const legacy=strategyExplanation("xmi",{});assert.match(legacy.conditions,/Not scored/);
});
test("Valid local editor thresholds modify descriptive RSI research without enabling orders",()=>{
 const standard=evaluateStrategy("day",sample(),"CURRENT");
 assert.equal(standard.ready,true);
 const edited=evaluateStrategy("day",sample(),"CURRENT",
  normalizeStrategyEdit("day",{rsiBull:65,rsiBear:35,requireMacd:true}));
 assert.equal(edited.ready,true);
 assert.notEqual(standard.zone,edited.zone);
 const missing=evaluateStrategy("day",sample(),"STALE",normalizeStrategyEdit("day",{}));
 assert.equal(missing.ready,false);
 assert.equal(evaluateStrategy("xmi",sample(),"CURRENT").state,"NOT_VALIDATED");
});
test("Headline flags are explicitly context-only, not claims of future price movement",()=>{
 const up=newsContextFlag({title:"Company beats estimates, record profit",scope:"ticker-related"});
 const down=newsContextFlag({title:"Company layoffs and weakens",scope:"pair-related"});
 const unknown=newsContextFlag({title:"Market update",scope:"broader-market"});
 assert.equal(up.type,"positive");assert.equal(down.type,"negative");assert.equal(unknown.type,"unclear");
 assert.match(up.notice,/unverified/);assert.match(unknown.scope,/Broad market/);
});
test("Workspace has dedicated left market utilities and right-first strategy engine",()=>{
 const live=readFileSync(new URL("../app/xmi/XMIEngineDesk.jsx",import.meta.url),"utf8");
 const main=readFileSync(new URL("../app/xmi/XMIWorkstation.jsx",import.meta.url),"utf8");
 const css=readFileSync(new URL("../app/xmi/xmi.module.css",import.meta.url),"utf8");
 assert.match(live,/Left market sidebar/);
 assert.match(live,/Market watchlist/);
 assert.match(live,/XMIScreenSnapshot/);assert.match(live,/XMITickerNews/);
 assert.doesNotMatch(live,/<span>Signal status<\/span>/);
 assert.doesNotMatch(live,/<span>Strategy<\/span>/);
 assert.ok(live.indexOf("Strategy engine ·")<live.indexOf("Market structure ·"));
 assert.match(main,/strategyLabEditor/);assert.match(main,/strategyScroll/);
 assert.match(css,/\.strategyMatrix\{[^}]*aspect-ratio:1\/1/);
});
