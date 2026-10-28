/* Pure focus and layout transitions shared by XMI chart and research tabs.
 * No broker or network dependencies; source of truth remains the focused chart.
 */
import {normalizeTicker,validInterval} from "./xmiWorkspace.mjs";
export function focusedChart(charts,index){
 if(!Array.isArray(charts)||!charts.length)throw Error("At least one chart is required");
 return charts[Number.isInteger(index)&&index>=0&&index<charts.length?index:0];
}
export function updateSymbols(charts,index,raw,linked=false){
 const symbol=normalizeTicker(raw);
 if(!Array.isArray(charts)||!charts.length||!Number.isInteger(index)||
   index<0||index>=charts.length)throw Error("Selected chart not found");
 return charts.map((chart,i)=>linked||i===index?{...chart,symbol}:chart);
}
export function updateTimeframe(charts,index,interval){
 if(!validInterval(interval)||!Number.isInteger(index)||index<0||index>=charts.length)
  throw Error("Invalid chart timeframe");
 return charts.map((chart,i)=>i===index?{...chart,interval}:chart);
}
export function focusAfterLayout(current,count){
 if(![1,2,4].includes(count))throw Error("Use a 1, 2, or 4 chart layout");
 return Number.isInteger(current)&&current>=0&&current<count?current:0;
}
