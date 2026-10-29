/* Validated local-only educational preset edits. Do not edit broker trading rules. */
import {STRATEGIES} from "./xmiStrategyPresets.mjs";
export const EDITS_KEY="xmi-strategy-edits-v1";
const TIMES=new Set(["1m","5m","15m","30m","1H","4H","1D"]);
const defaults=id=>({
 timeframe:STRATEGIES.find(p=>p.id===id)?.timeframe||"15m",
 rsiBull:55,rsiBear:45,requireMacd:id!=="day",requireVwap:false,notes:""
});
export function normalizeStrategyEdit(id,source={}){
 const preset=STRATEGIES.find(p=>p.id===id);if(!preset)throw Error("Unknown strategy preset");
 const base=defaults(id);
 if(!source||typeof source!=="object"||Array.isArray(source))return base;
 const merged={...base};
 if(TIMES.has(source.timeframe))merged.timeframe=source.timeframe;
 const hi=Number(source.rsiBull),lo=Number(source.rsiBear);
 if(Number.isInteger(hi)&&hi>=50&&hi<=75)merged.rsiBull=hi;
 if(Number.isInteger(lo)&&lo>=25&&lo<=50)merged.rsiBear=lo;
 if(merged.rsiBull-merged.rsiBear<5){
  merged.rsiBull=base.rsiBull;merged.rsiBear=base.rsiBear;
 }
 if(typeof source.requireMacd==="boolean")merged.requireMacd=source.requireMacd;
 if(typeof source.requireVwap==="boolean")merged.requireVwap=source.requireVwap;
 if(typeof source.notes==="string")merged.notes=source.notes.slice(0,600);
 return Object.freeze(merged);
}
export function sanitizeStrategyEdits(data){
 if(!data||typeof data!=="object"||Array.isArray(data))return {};
 return Object.fromEntries(STRATEGIES.filter(p=>data[p.id]&&typeof data[p.id]==="object")
  .map(p=>[p.id,normalizeStrategyEdit(p.id,data[p.id])]));
}
export function strategyExplanation(id,edit){
 const preset=STRATEGIES.find(p=>p.id===id);
 if(!preset)throw Error("Unknown strategy preset");
 const cfg=normalizeStrategyEdit(id,edit);
 const summary=preset.id==="scalp"?"Short-term EMA trend and RSI/MACD momentum on closed intraday candles.":
  preset.id==="day"?"Intraday EMA trend, RSI momentum and optional session VWAP confirmation.":
  preset.id==="swing"?"Multi-session EMA50/200 trend and RSI/MACD momentum with higher timeframe context.":
  "Existing XMI rules are retained as an unscored reference; the original hard-confirm algorithm has not been ported.";
 return {preset,cfg,summary,
  data:"Uses the latest confirmed candle and the fixed EMA20, EMA50, EMA200, RSI14, MACD and VWAP calculations available from the current chart. Selected timeframe changes chart candles, not the indicator periods.",
  conditions:preset.unscored?"Not scored — no entry/exit conditions inferred.":
   "Trend: "+(id==="swing"?"EMA50 versus EMA200":"EMA20 versus EMA50")+
   ". Momentum: RSI14 >= "+cfg.rsiBull+" indicates positive and <= "+cfg.rsiBear+
   " indicates negative; other readings are neutral. MACD histogram helps determine momentum."+
   (cfg.requireMacd?" MACD confirmation required.":" MACD not required if unavailable.")+
   (cfg.requireVwap?" VWAP alignment required for a directional result.":" VWAP remains contextual."),
  risk:"Educational, descriptive research only. No strategy has verified predictive performance, stops, position sizing, or executable entry/exit rules."};
}
