/* Causal chart algorithms, descriptive only. Inputs must be verified OHLC.
 * All calculated points read no later than their bar; forming bars are excluded.
 */
export const ALGORITHM_MODES=Object.freeze(["off","regression","atrBands","both"]);
export const ALGORITHM_WINDOWS=Object.freeze([20,50,100]);
export const ALGORITHM_MULTIPLIERS=Object.freeze([1,1.5,2,3]);
const safe=(x)=>typeof x==="number"&&Number.isFinite(x);
function line(rows,values){return rows.flatMap((bar,i)=>safe(values[i])?[{time:bar.time,value:values[i]}]:[]);}
export function computeChartAlgorithms(bars,{mode="off",window=50,multiplier=2}={}){
 if(!ALGORITHM_MODES.includes(mode)||!ALGORITHM_WINDOWS.includes(window)||!ALGORITHM_MULTIPLIERS.includes(multiplier))
  throw Error("Invalid chart algorithm settings");
 if(!Array.isArray(bars)||bars.length>3000)throw Error("Invalid algorithm candle history");
 let previous=-Infinity;
 for(const b of bars){
  if(!b||!Number.isSafeInteger(b.time)||b.time<=previous||
    ![b.open,b.high,b.low,b.close].every(safe)||b.low<=0||b.high<Math.max(b.open,b.close)||
    b.low>Math.min(b.open,b.close))throw Error("Invalid chronological algorithm candles");
  previous=b.time;
 }
 const closed=bars.filter(x=>x.closed===true);
 const output={regression:[],regUpper:[],regLower:[],atrUpper:[],atrLower:[]};
 if(mode==="off")return Object.freeze(output);
 let atr=null,initialTR=0;
 const atrValues=[];
 for(let i=0;i<closed.length;i++){
  const bar=closed[i],prior=closed[i-1];
  const tr=prior?Math.max(bar.high-bar.low,Math.abs(bar.high-prior.close),Math.abs(bar.low-prior.close)):bar.high-bar.low;
  if(i===0){atrValues.push(null);continue;}
  if(i<=14){initialTR+=tr;if(i===14)atr=initialTR/14;}
  else atr=(atr*13+tr)/14;
  atrValues.push(i>=14?atr:null);
 }
 if(mode==="atrBands"||mode==="both"){
  for(let i=15;i<closed.length;i++){
   const prior=closed[i-1],a=atrValues[i-1];
   if(!safe(a))continue;
   output.atrUpper.push({time:closed[i].time,value:prior.close+a*multiplier});
   output.atrLower.push({time:closed[i].time,value:prior.close-a*multiplier});
  }
 }
 if(mode==="regression"||mode==="both"){
  const xmean=(window-1)/2,denom=window*(window*window-1)/12;
  for(let end=window-1;end<closed.length;end++){
   const sample=closed.slice(end-window+1,end+1);
   const average=sample.reduce((sum,b)=>sum+b.close,0)/window;
   const slope=sample.reduce((sum,b,i)=>sum+(i-xmean)*(b.close-average),0)/denom;
   const intercept=average-slope*xmean;
   const variance=sample.reduce((sum,b,i)=>sum+(b.close-(intercept+slope*i))**2,0)/window;
   const mid=intercept+slope*(window-1),sigma=Math.sqrt(variance);
   output.regression.push({time:closed[end].time,value:mid});
   output.regUpper.push({time:closed[end].time,value:mid+multiplier*sigma});
   output.regLower.push({time:closed[end].time,value:mid-multiplier*sigma});
  }
 }
 return Object.freeze(output);
}
