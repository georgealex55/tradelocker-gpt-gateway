/* User-editable, bounded technical study periods; browser-local and research-only. */
export const INDICATOR_SETTINGS_KEY="xmi-indicator-settings-v1";
export const INDICATOR_PARAMETERS=Object.freeze([
 {key:"emaFast",section:"EMA",label:"Fast EMA",default:20,min:3,max:80,step:1},
 {key:"emaSlow",section:"EMA",label:"Slow EMA",default:50,min:10,max:150,step:1},
 {key:"emaLong",section:"EMA",label:"Long EMA",default:200,min:60,max:300,step:1},
 {key:"rsiPeriod",section:"RSI",label:"RSI period",default:14,min:3,max:50,step:1},
 {key:"macdFast",section:"MACD",label:"MACD fast",default:12,min:3,max:35,step:1},
 {key:"macdSlow",section:"MACD",label:"MACD slow",default:26,min:6,max:70,step:1},
 {key:"macdSignal",section:"MACD",label:"MACD signal",default:9,min:2,max:30,step:1},
 {key:"volumeAverage",section:"Volume",label:"Volume average",default:1,min:1,max:50,step:1},
 {key:"vwapSession",section:"VWAP",label:"VWAP reset (UTC)",default:"daily",choices:["daily","weekly"]},
 {key:"atrPeriod",section:"ATR",label:"ATR period",default:14,min:3,max:60,step:1},
 {key:"adxPeriod",section:"ADX",label:"ADX/DMI period",default:14,min:3,max:60,step:1},
 {key:"bbPeriod",section:"Bollinger",label:"Bollinger period",default:20,min:5,max:100,step:1},
 {key:"bbDeviation",section:"Bollinger",label:"Std. deviations",default:2,min:0.5,max:4,step:0.5},
 {key:"donchianPeriod",section:"Donchian",label:"Prior-bar lookback",default:20,min:5,max:100,step:1},
 {key:"stochPeriod",section:"Stochastic",label:"Stochastic lookback",default:14,min:3,max:60,step:1},
 {key:"stochSmooth",section:"Stochastic",label:"Smooth %K",default:3,min:1,max:10,step:1},
 {key:"stochSignal",section:"Stochastic",label:"Signal %D",default:3,min:1,max:10,step:1}
]);
export const DEFAULT_INDICATOR_SETTINGS=Object.freeze(Object.fromEntries(INDICATOR_PARAMETERS.map(p=>[p.key,p.default])));
export function normalizeIndicatorSettings(source={}){
 if(!source||typeof source!=="object"||Array.isArray(source))return {...DEFAULT_INDICATOR_SETTINGS};
 const result={};
 for(const p of INDICATOR_PARAMETERS){
  const value=source[p.key];
  if(p.choices){result[p.key]=p.choices.includes(value)?value:p.default;continue;}
  result[p.key]=typeof value==="number"&&Number.isFinite(value)&&value>=p.min&&value<=p.max&&
   Math.abs(Math.round((value-p.min)/p.step)-(value-p.min)/p.step)<1e-8?value:p.default;
 }
 if(result.emaFast>=result.emaSlow){result.emaFast=20;result.emaSlow=50;}
 if(result.emaSlow>=result.emaLong)result.emaLong=200;
 if(result.macdFast>=result.macdSlow){result.macdFast=12;result.macdSlow=26;}
 return result;
}
