/* MT5 offline, non-executing risk feasibility model. No orders, terminal or network. */
const LANES=Object.freeze([{id:"risk_025",riskFraction:0.0025},{id:"risk_050",riskFraction:0.005},{id:"risk_100",riskFraction:0.01},{id:"fixed_001",fixedLots:0.01},{id:"experimental_200",riskFraction:0.02,experimental:true}]);
const fail=(code)=>{const e=new Error(code);e.code=code;throw e;};
function positive(n,name){if(typeof n!=="number"||!Number.isFinite(n)||n<=0)fail("MT5_RISK_INVALID_"+name);return n;}
function nonnegative(n,name){if(typeof n!=="number"||!Number.isFinite(n)||n<0)fail("MT5_RISK_INVALID_"+name);return n;}
function validateSpec(s){
 if(!s||typeof s!=="object")fail("MT5_RISK_SPEC_REQUIRED");
 const min=positive(s.volume_min,"MIN"),step=positive(s.volume_step,"STEP"),max=positive(s.volume_max,"MAX");
 if(min>max||step>max)fail("MT5_RISK_VOLUME_RANGE");
 // Inputs are explicit broker observations. Tick value must be in account currency.
 positive(s.trade_tick_size,"TICK_SIZE");positive(s.trade_tick_value,"TICK_VALUE");
 positive(s.margin_per_lot_usd,"MARGIN_PER_LOT");
 return {min,step,max};
}
function quantizeLots(target,spec){
 const {min,step,max}=validateSpec(spec);
 if(!Number.isFinite(target)||target<min-1e-10)return null;
 const capped=Math.min(target,max);
 // Broker volume grid is min + k*step, not necessarily a multiple of step.
 const steps=Math.floor((capped-min)/step+1e-9);
 const lots=Number((min+steps*step).toFixed(10));
 return lots>=min-1e-10&&lots<=max+1e-10?lots:null;
}
export function calculateMt5RiskLanes({spec,stopDistancePrice,spreadPrice,slippagePrice,startingCapitalUsd=1000,drawdownHaltFraction=0.10,source,sourceSha256,asOfUtc}={}){
 if(!["MT5_LOCAL_EXPORT","MT5_OFFLINE_IMPORT"].includes(source)||!/^[a-f0-9]{64}$/.test(sourceSha256||""))fail("MT5_RISK_SOURCE_REQUIRED");
 if(typeof asOfUtc!=="string"||!/^\d{4}-\d{2}-\d{2}T/.test(asOfUtc)||!Number.isFinite(Date.parse(asOfUtc))||!asOfUtc.endsWith("Z"))fail("MT5_RISK_UTC_REQUIRED");
 const {min,step,max}=validateSpec(spec);
 positive(stopDistancePrice,"STOP");nonnegative(spreadPrice,"SPREAD");nonnegative(slippagePrice,"SLIPPAGE");
 positive(startingCapitalUsd,"CAPITAL");
 if(startingCapitalUsd!==1000)fail("MT5_RISK_INDEPENDENT_1000_ONLY");
 if(drawdownHaltFraction!==0.10)fail("MT5_RISK_HALT_10_PERCENT_REQUIRED");
 const unit=spec.trade_tick_value/spec.trade_tick_size; // USD per lot per unit price movement
 const costPerLotUsd=(spreadPrice+slippagePrice)*unit;
 const stopLossPerLotUsd=stopDistancePrice*unit+costPerLotUsd;
 const results=LANES.map(lane=>{
  const target=lane.fixedLots??(startingCapitalUsd*lane.riskFraction/stopLossPerLotUsd);
  const lots=quantizeLots(target,spec);
  if(lots===null)return Object.freeze({lane:lane.id,experimental:!!lane.experimental,status:"unfundable",reason:"BELOW_MIN_VOLUME",startingCapitalUsd});
  const estimatedStopLossUsd=Number((lots*stopLossPerLotUsd).toFixed(8));
  const estimatedSpreadSlippageUsd=Number((lots*costPerLotUsd).toFixed(8));
  const requiredMarginUsd=Number((lots*spec.margin_per_lot_usd).toFixed(8));
  const budgetUsd=lane.fixedLots===undefined?startingCapitalUsd*lane.riskFraction:null;
  const reasons=[];
  if(requiredMarginUsd>startingCapitalUsd)reasons.push("INSUFFICIENT_INITIAL_MARGIN");
  if(estimatedStopLossUsd>startingCapitalUsd*drawdownHaltFraction)reasons.push("LOSS_EXCEEDS_10_PERCENT_HALT");
  if(budgetUsd!==null&&estimatedStopLossUsd>budgetUsd+1e-7)reasons.push("RISK_BUDGET_EXCEEDED");
  return Object.freeze({lane:lane.id,experimental:!!lane.experimental,status:reasons.length?"unfundable":"hypothetical_only",reasons,lots,startingCapitalUsd,budgetUsd,estimatedStopLossUsd,estimatedSpreadSlippageUsd,requiredMarginUsd});
 });
 return Object.freeze({source,sourceSha256,asOfUtc,accountCurrency:"USD",startingCapitalUsd,drawdownHaltFraction,model:"OFFLINE_PRETRADE_FEASIBILITY_ONLY",executionEnabled:false,fillAssumed:false,spreadPrice,slippagePrice,stopDistancePrice,volumeGrid:{min,step,max},lanes:results});
}
export function evaluateMt5Drawdown({startingCapitalUsd=1000,currentEquityUsd,peakEquityUsd=1000}={}){
 if(startingCapitalUsd!==1000)fail("MT5_RISK_INDEPENDENT_1000_ONLY");
 nonnegative(currentEquityUsd,"EQUITY");positive(peakEquityUsd,"PEAK");
 if(peakEquityUsd<startingCapitalUsd||currentEquityUsd>peakEquityUsd)fail("MT5_RISK_EQUITY_SEQUENCE");
 const drawdownFraction=(peakEquityUsd-currentEquityUsd)/peakEquityUsd;
 return Object.freeze({drawdownFraction,halted:drawdownFraction>=0.10,executionEnabled:false});
}
