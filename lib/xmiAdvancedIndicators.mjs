/* XMI: causal historical-only technical indicators.
 * Every value at index i reads bars <= i, never future pivots or future candles.
 * Displaying a forming bar is permitted, but research markers use CLOSED bars.
 */
import {normalizeIndicatorSettings} from "./xmiIndicatorSettings.mjs";
const finite=x=>typeof x==="number"&&Number.isFinite(x);
export const ADVANCED_INDICATORS=Object.freeze([
 {id:"ATR",label:"ATR 14 · volatility",kind:"volatility",warmup:15},
 {id:"ADX",label:"ADX 14 / +DI / −DI · trend strength",kind:"strength",warmup:28},
 {id:"Bollinger",label:"Bollinger Bands 20 ±2σ",kind:"volatility",warmup:20},
 {id:"Donchian",label:"Donchian 20 · prior-bar breakout",kind:"levels",warmup:21},
 {id:"Stochastic",label:"Stochastic 14 / 3 · momentum",kind:"momentum",warmup:16}
]);
function line(bars,values){return bars.flatMap((b,i)=>finite(values[i])?[{time:b.time,value:values[i]}]:[]);}
export function computeAdvancedIndicators(bars,parameters={}){
 const cfg=normalizeIndicatorSettings(parameters);
 if(!Array.isArray(bars)||bars.length>3000)throw Error("Unsupported indicator history length");
 for(let i=0;i<bars.length;i++){
  const b=bars[i];
  if(!b||!Number.isSafeInteger(b.time)||![b.open,b.high,b.low,b.close].every(finite)||
   b.low<=0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||
   (i>0&&bars[i-1].time>=b.time))throw Error("Invalid chronological indicator candles");
 }
 const n=bars.length,atrPeriod=cfg.atrPeriod,adxPeriod=cfg.adxPeriod;
 const result=Object.fromEntries(["atr","adx","plusDI","minusDI","bbUpper","bbBasis","bbLower",
  "donchianUpper","donchianLower","stochK","stochD"].map(x=>[x,Array(n).fill(null)]));
 let atr=null,pdm=null,mdm=null,adx=null,dxSeed=0,dxCount=0;
 let atrSeed=0;
 let sumTR=0,sumPD=0,sumMD=0;
 const tr=[],rawPlus=[],rawMinus=[],stochRaw=Array(n).fill(null);
 for(let i=0;i<n;i++){
  const b=bars[i],prev=bars[i-1];
  tr[i]=prev?Math.max(b.high-b.low,Math.abs(b.high-prev.close),Math.abs(b.low-prev.close)):b.high-b.low;
  rawPlus[i]=0;rawMinus[i]=0;
  if(prev){
   const up=b.high-prev.high,down=prev.low-b.low;
   rawPlus[i]=up>down&&up>0?up:0;
   rawMinus[i]=down>up&&down>0?down:0;
   if(i<=atrPeriod)atrSeed+=tr[i];
   if(i===atrPeriod)atr=atrSeed/atrPeriod;
   else if(i>atrPeriod)atr=(atr*(atrPeriod-1)+tr[i])/atrPeriod;
   if(i>=atrPeriod)result.atr[i]=atr;
   if(i<=adxPeriod){sumTR+=tr[i];sumPD+=rawPlus[i];sumMD+=rawMinus[i];}
   if(i===adxPeriod){pdm=sumPD;mdm=sumMD;}
   else if(i>adxPeriod){
    pdm=pdm*(adxPeriod-1)/adxPeriod+rawPlus[i];
    mdm=mdm*(adxPeriod-1)/adxPeriod+rawMinus[i];
   }
   if(i>=adxPeriod){
    const smoothTR=i===adxPeriod?sumTR:
     (result._smoothTR??sumTR)*(adxPeriod-1)/adxPeriod+tr[i];
    result._smoothTR=smoothTR;
    const plus=smoothTR>0?100*pdm/smoothTR:0;
    const minus=smoothTR>0?100*mdm/smoothTR:0;
    result.plusDI[i]=plus;result.minusDI[i]=minus;
    const dx=plus+minus>0?100*Math.abs(plus-minus)/(plus+minus):0;
    if(i<2*adxPeriod){dxSeed+=dx;dxCount++;if(i===2*adxPeriod-1)adx=dxSeed/dxCount;}
    else adx=(adx*(adxPeriod-1)+dx)/adxPeriod;
    if(i>=2*adxPeriod-1)result.adx[i]=adx;
   }
  }
  if(i>=cfg.bbPeriod-1){
   const close=bars.slice(i-cfg.bbPeriod+1,i+1).map(x=>x.close);
   const avg=close.reduce((a,v)=>a+v,0)/cfg.bbPeriod;
   const dev=Math.sqrt(close.reduce((a,v)=>a+(v-avg)**2,0)/cfg.bbPeriod);
   result.bbBasis[i]=avg;result.bbUpper[i]=avg+cfg.bbDeviation*dev;
   result.bbLower[i]=avg-cfg.bbDeviation*dev;
  }
  // Prior 20 CLOSED observations, excluding i, so bar i cannot push its own threshold.
  if(i>=cfg.donchianPeriod){
   const earlier=bars.slice(i-cfg.donchianPeriod,i);
   result.donchianUpper[i]=Math.max(...earlier.map(x=>x.high));
   result.donchianLower[i]=Math.min(...earlier.map(x=>x.low));
  }
  if(i>=cfg.stochPeriod-1){
   const window=bars.slice(i-cfg.stochPeriod+1,i+1);
   const high=Math.max(...window.map(x=>x.high)),low=Math.min(...window.map(x=>x.low));
   stochRaw[i]=high===low?50:(b.close-low)/(high-low)*100;
  }
  if(i>=cfg.stochPeriod+cfg.stochSmooth-2){
   result.stochK[i]=stochRaw.slice(i-cfg.stochSmooth+1,i+1)
    .reduce((a,b)=>a+b,0)/cfg.stochSmooth;
   if(i>=cfg.stochPeriod+cfg.stochSmooth+cfg.stochSignal-3)
    result.stochD[i]=result.stochK.slice(i-cfg.stochSignal+1,i+1)
     .reduce((a,b)=>a+b,0)/cfg.stochSignal;
  }
 }
 delete result._smoothTR;
 return Object.freeze(Object.fromEntries(Object.entries(result).map(([name,values])=>[name,line(bars,values)])));
}
