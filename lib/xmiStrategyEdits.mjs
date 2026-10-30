/* Validated local-only educational preset edits. Do not edit broker trading rules. */
import {STRATEGIES} from "./xmiStrategyPresets.mjs";
export const EDITS_KEY="xmi-strategy-edits-v1";
const TIMES=new Set(["1m","5m","15m","30m","1H","4H","1D"]);
const defaults=id=>({
 timeframe:STRATEGIES.find(p=>p.id===id)?.timeframe||"15m",
 rsiBull:55,rsiBear:45,requireMacd:["scalp","swing"].includes(id),requireVwap:false,
 requireAdx:Boolean(STRATEGIES.find(x=>x.id===id)?.pairs),
 requireAtr:Boolean(STRATEGIES.find(x=>x.id===id)?.pairs),
 adxMin:id==="eur-scalp-5m"?25:20,atrMinPips:0,
 stopAtr:1.2,rewardRisk:1.5,maxHoldBars:8,notes:""
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
 if(typeof source.requireAdx==="boolean")merged.requireAdx=source.requireAdx;
 if(typeof source.requireAtr==="boolean")merged.requireAtr=source.requireAtr;
 if(Number.isInteger(source.adxMin)&&source.adxMin>=10&&source.adxMin<=45)merged.adxMin=source.adxMin;
 if(typeof source.atrMinPips==="number"&&Number.isFinite(source.atrMinPips)&&
  source.atrMinPips>=0&&source.atrMinPips<=50)merged.atrMinPips=source.atrMinPips;
 for(const [name,min,max] of [["stopAtr",0.5,3],["rewardRisk",1,3]]){
  if(typeof source[name]==="number"&&Number.isFinite(source[name])&&source[name]>=min&&source[name]<=max)
   merged[name]=source[name];
 }
 if(Number.isInteger(source.maxHoldBars)&&source.maxHoldBars>=2&&source.maxHoldBars<=36)
  merged.maxHoldBars=source.maxHoldBars;
 if(id==="eur-scalp-5m"){merged.timeframe="5m";merged.requireAdx=true;merged.requireAtr=true;}
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
  id==="eur-scalp-5m"?"5m EUR/USD pullback setup with confirmed 15m EMA trend. Candidate entry and historical exit markers are observations, never actual fills.":
  preset.pairs?"Closed-candle pair-specific observational strategy for "+preset.pairs.join(", ")+". ADX and ATR help evaluate strength and volatility; no entries, fills or claimed win rates.":
  "Existing XMI rules are retained as an unscored reference; the original hard-confirm algorithm has not been ported.";
 return {preset,cfg,summary,
  data:"All studies use user-editable bounded periods. Preset signals use confirmed closes only; the EUR/USD 5m/15m setup requires both source resolutions.",
  conditions:preset.unscored?"Not scored — no entry/exit conditions inferred.":
   id==="eur-scalp-5m"?"EURUSD 5m EMA20/50 aligned with confirmed 15m EMA20/50; RSI directional, ADX >= "+cfg.adxMin+
   "; previous candle touches fast EMA and confirmation candle closes back in trend direction. ATR stop x"+
   cfg.stopAtr+"; hypothetical target "+cfg.rewardRisk+"R; exit after stop/target/EMA reversal or "+
   cfg.maxHoldBars+" completed 5m bars. Both stop and target in one candle means UNKNOWN sequence.":
   "Trend: "+(id==="swing"?"EMA50 versus EMA200":"EMA20 versus EMA50")+
   ". Momentum: RSI14 >= "+cfg.rsiBull+" indicates positive and <= "+cfg.rsiBear+
   " indicates negative; other readings are neutral. MACD histogram helps determine momentum."+
   (cfg.requireMacd?" MACD confirmation required.":" MACD not required if unavailable.")+
   (cfg.requireVwap?" VWAP alignment required for a directional result.":" VWAP remains contextual.")+
   (cfg.requireAdx||preset.pairs?" ADX must be at least "+cfg.adxMin+".":"")+
   (cfg.requireAtr||preset.pairs?" ATR must be at least "+cfg.atrMinPips+" approximate pips.":"")+
   (preset.pairs?" Only "+preset.pairs.join(", ")+" is eligible.":"")+
   (id==="gbp-breakout"?" Prior-20 Donchian breakout required.":"")+
   (id==="jpy-pullback"?" Stochastic direction must agree with EMA trend.":""),
  risk:"Research-only overlays. The EUR/USD study has hypothetical stop/target thresholds, not executable orders or validated fills. No predictive performance, lot sizing, spread/slippage or leverage assumptions."};
}
