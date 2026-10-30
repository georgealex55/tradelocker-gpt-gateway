/* XMI: causal historical-only technical indicators.
 * Every value at index i reads bars <= i, never future pivots or future candles.
 * Displaying a forming bar is permitted, but research markers use CLOSED bars.
 */
const finite=x=>typeof x==="number"&&Number.isFinite(x);
export const ADVANCED_INDICATORS=Object.freeze([
 {id:"ATR",label:"ATR 14 · volatility",kind:"volatility",warmup:15},
 {id:"ADX",label:"ADX 14 / +DI / −DI · trend strength",kind:"strength",warmup:28},
 {id:"Bollinger",label:"Bollinger Bands 20 ±2σ",kind:"volatility",warmup:20},
 {id:"Donchian",label:"Donchian 20 · prior-bar breakout",kind:"levels",warmup:21},
 {id:"Stochastic",label:"Stochastic 14 / 3 · momentum",kind:"momentum",warmup:16}
]);
function line(bars,values){return bars.flatMap((b,i)=>finite(values[i])?[{time:b.time,value:values[i]}]:[]);}
export function computeAdvancedIndicators(bars){
 if(!Array.isArray(bars)||bars.length>3000)throw Error("Unsupported indicator history length");
 for(let i=0;i<bars.length;i++){
  const b=bars[i];
  if(!b||!Number.isSafeInteger(b.time)||![b.open,b.high,b.low,b.close].every(finite)||
   b.low<=0||b.low>Math.min(b.open,b.close)||b.high<Math.max(b.open,b.close)||
   (i>0&&bars[i-1].time>=b.time))throw Error("Invalid chronological indicator candles");
 }
 const n=bars.length,period=14;
 const result=Object.fromEntries(["atr","adx","plusDI","minusDI","bbUpper","bbBasis","bbLower",
  "donchianUpper","donchianLower","stochK","stochD"].map(x=>[x,Array(n).fill(null)]));
 let atr=null,pdm=null,mdm=null,adx=null,dxSeed=0,dxCount=0;
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
   if(i<=period){sumTR+=tr[i];sumPD+=rawPlus[i];sumMD+=rawMinus[i];}
   if(i===period){atr=sumTR/period;pdm=sumPD;mdm=sumMD;}
   else if(i>period){
    atr=(atr*(period-1)+tr[i])/period;
    pdm=pdm*(period-1)/period+rawPlus[i];
    mdm=mdm*(period-1)/period+rawMinus[i];
   }
   if(i>=period){
    result.atr[i]=atr;
    const plus=atr>0?100*pdm/(period*atr):0;
    const minus=atr>0?100*mdm/(period*atr):0;
    result.plusDI[i]=plus;result.minusDI[i]=minus;
    const dx=plus+minus>0?100*Math.abs(plus-minus)/(plus+minus):0;
    if(i<2*period){dxSeed+=dx;dxCount++;if(i===2*period-1)adx=dxSeed/dxCount;}
    else adx=(adx*(period-1)+dx)/period;
    if(i>=2*period-1)result.adx[i]=adx;
   }
  }
  if(i>=19){
   const close=bars.slice(i-19,i+1).map(x=>x.close);
   const avg=close.reduce((a,v)=>a+v,0)/20;
   const dev=Math.sqrt(close.reduce((a,v)=>a+(v-avg)**2,0)/20);
   result.bbBasis[i]=avg;result.bbUpper[i]=avg+2*dev;result.bbLower[i]=avg-2*dev;
  }
  // Prior 20 CLOSED observations, excluding i, so bar i cannot push its own threshold.
  if(i>=20){
   const earlier=bars.slice(i-20,i);
   result.donchianUpper[i]=Math.max(...earlier.map(x=>x.high));
   result.donchianLower[i]=Math.min(...earlier.map(x=>x.low));
  }
  if(i>=13){
   const window=bars.slice(i-13,i+1);
   const high=Math.max(...window.map(x=>x.high)),low=Math.min(...window.map(x=>x.low));
   stochRaw[i]=high===low?50:(b.close-low)/(high-low)*100;
  }
  if(i>=15){
   result.stochK[i]=(stochRaw[i]+stochRaw[i-1]+stochRaw[i-2])/3;
   if(i>=17&&finite(result.stochK[i-2]))
    result.stochD[i]=(result.stochK[i]+result.stochK[i-1]+result.stochK[i-2])/3;
  }
 }
 return Object.freeze(Object.fromEntries(Object.entries(result).map(([name,values])=>[name,line(bars,values)])));
}
