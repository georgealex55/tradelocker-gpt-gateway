/* Read-only MT5 descriptive replay + independent pretrade risk feasibility.
 * This is NOT a backtest: no fills, exits, P&L, account balance updates or orders.
 */
import {adaptMt5ExportBars,replayMt5Export} from "./replayBridge.mjs";
import {calculateMt5RiskLanes} from "./riskLanes.mjs";
function fail(code){const error=new Error(code);error.code=code;throw error;}
export function inspectMt5ReplayRisk({manifest,rawPayload,spec,stopDistancePrice,spreadPrice,slippagePrice,strategyId="day",edit={},indicatorSettings={}}={}){
 const imported=adaptMt5ExportBars({manifest,rawPayload});
 if(!["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD"].includes(imported.symbol))
  fail("MT5_RISK_REPLAY_SEVEN_PAIR_SCOPE");
 // Explicit cost/spec inputs are required. Never silently use public or other-provider spreads.
 const replay=replayMt5Export({manifest,rawPayload,strategyId,edit,indicatorSettings});
 const last=imported.bars.at(-1);
 const asOfUtc=new Date((last.time+({ "1m":60,"5m":300,"15m":900,"30m":1800,"1H":3600,"4H":14400,"1D":86400 }[imported.resolution]))*1000).toISOString().replace(".000Z","Z");
 const feasibility=calculateMt5RiskLanes({spec,stopDistancePrice,spreadPrice,slippagePrice,source:imported.source,sourceSha256:imported.sourceSha256,asOfUtc});
 // A signal at bar i cannot be considered before the open of bar i+1.
 // The final observation has no next bar, and is intentionally excluded.
 const causalObservations=replay.observations.slice(0,-1).map((observation,index)=>Object.freeze({
  signalBarUtc:new Date(observation.time*1000).toISOString(),
  nextBarUtc:new Date(imported.bars[index+1].time*1000).toISOString(),
  state:observation.state,category:observation.category,
  nextBarOpenReference:imported.bars[index+1].open,
  fillVerified:false,tradeExecuted:false
 }));
 return Object.freeze({source:imported.source,sourceSha256:imported.sourceSha256,
  symbol:imported.symbol,resolution:imported.resolution,validation:"PROVISIONAL_UNRANKED",
  researchType:"DESCRIPTIVE_REPLAY_PLUS_INDEPENDENT_PRETRADE_FEASIBILITY",
  executionEnabled:false,fillAssumed:false,pnlCalculated:false,
  riskLanes:feasibility.lanes,startingCapitalUsd:1000,
  observations:Object.freeze(causalObservations),
  excludedTerminalObservation:1,
  brokerCostStatus:"EXPLICIT_INPUTS_NOT_AUTHENTICATED_BY_THIS_MODULE"});
}
