/* Simulation-only deterministic strategy definitions. No broker dependencies. */
import {createHash} from 'node:crypto';
export const MAJORS=Object.freeze(['EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','USDCAD','NZDUSD']);
export const STYLES=Object.freeze({scalping:['1m','5m','15m'],intraday:['15m','30m','1H'],swing:['4H','1D']});
export const SECONDS=Object.freeze({'1m':60,'5m':300,'15m':900,'30m':1800,'1H':3600,'4H':14400,'1D':86400});
export const LIFECYCLE=Object.freeze(['DISCOVERED','TESTING','REJECTED','HISTORICALLY QUALIFIED','FORWARD DEMO','FORWARD QUALIFIED','DEGRADED','PAUSED','RETIRED','AWAITING DEPLOYMENT APPROVAL']);
export const SIGNAL_STATES=Object.freeze(['NO_SIGNAL','ENTRY_CANDIDATE','CONFIRMED_ENTRY','POSITION_OPEN','EXIT_CANDIDATE','CONFIRMED_EXIT','CLOSED']);
export const BALANCES=Object.freeze([100,500,1000,5000,10000,25000]);
export const RISKS=Object.freeze([0.0025,0.005,0.01,0.02]);
export function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 if(typeof value==='number'&&!Number.isFinite(value))throw Error('Non-finite canonical value');
 return JSON.stringify(value);
}
export const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
const definitions=[
 {id:'ema-trend',name:'EMA trend',family:'trend',indicators:['EMA'],entry:'Closed fast EMA crosses slow EMA.',exit:'Opposite EMA cross, protective price levels or maximum holding time.'},
 {id:'rsi-recovery',name:'RSI extreme recovery',family:'mean-reversion',indicators:['RSI'],entry:'Closed RSI crosses back above 30 or below 70.',exit:'Opposite recovery, protective price levels or maximum holding time.'},
 {id:'donchian-breakout',name:'Prior-channel breakout',family:'breakout',indicators:['Donchian'],entry:'Close crosses the highest high or lowest low of prior N bars, excluding the decision bar.',exit:'Opposite channel break, protective price levels or maximum holding time.'},
 {id:'trend-momentum',name:'EMA trend + RSI momentum',family:'hybrid',indicators:['EMA','RSI'],entry:'EMA trend with RSI crossing 55 upward or 45 downward.',exit:'Opposite confirmation, protective price levels or maximum holding time.'}
];
export const REGISTRY=Object.freeze(definitions.map(d=>Object.freeze({...d,indicators:Object.freeze([...d.indicators]),version:'1.0.0',symbols:MAJORS,timeframes:Object.freeze(Object.keys(SECONDS)),sessions:'UTC all / London 07–16 / New York 13–22',source:'lib/xmi-sim/registry.mjs#confirm',status:'DISCOVERED',execution:'INTERNAL_SIMULATION_ONLY'})));
export function makeVersion(input={}){
 const def=REGISTRY.find(x=>x.id===input.strategyId);if(!def)throw Error('Unknown executable strategy');
 const style=input.style||'intraday',timeframe=input.timeframe||'15m',symbol=input.symbol||'EURUSD';
 if(!STYLES[style]?.includes(timeframe)||!MAJORS.includes(symbol))throw Error('Unsupported Forex style, timeframe or pair');
 const p={fast:10,slow:30,period:14,lookback:20,stopPips:20,rewardRisk:2,maxHoldBars:24,direction:'both',session:'all',trailingPips:0,breakevenR:0,partialAtR:0,...input.parameters};
 const limits={fast:[2,80],slow:[3,240],period:[3,50],lookback:[5,100],stopPips:[2,500],rewardRisk:[0.5,5],maxHoldBars:[2,300],trailingPips:[0,500],breakevenR:[0,5],partialAtR:[0,5]};
 if(Object.keys(p).some(k=>!Object.hasOwn(limits,k)&&!['direction','session'].includes(k)))throw Error('Unknown strategy parameter');
 for(const [key,[min,max]] of Object.entries(limits))if(!Number.isFinite(p[key])||p[key]<min||p[key]>max||(['fast','slow','period','lookback','maxHoldBars'].includes(key)&&!Number.isInteger(p[key])))throw Error('Invalid parameter: '+key);
 if(p.fast>=p.slow||!['long','short','both'].includes(p.direction)||!['all','london','new-york'].includes(p.session))throw Error('Invalid strategy configuration');
 const spec={strategyId:def.id,version:def.version,symbol,style,timeframe,parameters:p};
 return Object.freeze({...spec,parameters:Object.freeze(p),configurationHash:digest(spec),warmup:Math.max(p.slow+2,p.period*3,p.lookback+2),entryRules:def.entry,exitRules:def.exit,requiredIndicators:def.indicators,positionSizing:'Equity risk budget; round units down; reject below minimum.',stopLogic:'Fixed pip distance from modeled fill; stop-first if ambiguous.',source:def.source});
}
function calculations(version,bars){
 const p=version.parameters;let fast=null,slow=null,gain=0,loss=0;
 const rows=[];
 for(let i=0;i<bars.length;i++){
  const fp=fast,sp=slow,rp=rows.at(-1)?.rsi??null;
  if(i===p.fast-1)fast=bars.slice(0,p.fast).reduce((n,b)=>n+b.close,0)/p.fast;
  else if(i>=p.fast)fast+=2/(p.fast+1)*(bars[i].close-fast);
  if(i===p.slow-1)slow=bars.slice(0,p.slow).reduce((n,b)=>n+b.close,0)/p.slow;
  else if(i>=p.slow)slow+=2/(p.slow+1)*(bars[i].close-slow);
  if(i){const d=bars[i].close-bars[i-1].close;
   if(i<=p.period){gain+=Math.max(0,d)/p.period;loss+=Math.max(0,-d)/p.period;}
   else{gain=(gain*(p.period-1)+Math.max(0,d))/p.period;loss=(loss*(p.period-1)+Math.max(0,-d))/p.period;}}
  const r=i>=p.period?(loss===0?(gain===0?50:100):100-100/(1+gain/loss)):null;
  let direction=0,conditions={};
  if(i+1>=version.warmup){
   if(version.strategyId==='ema-trend'){direction=fp<=sp&&fast>slow?1:fp>=sp&&fast<slow?-1:0;conditions={fastEMA:fast,slowEMA:slow};}
   else if(version.strategyId==='trend-momentum'){direction=fast>slow&&rp<=55&&r>55?1:fast<slow&&rp>=45&&r<45?-1:0;conditions={fastEMA:fast,slowEMA:slow,rsi:r};}
   else if(version.strategyId==='rsi-recovery'){direction=rp<=30&&r>30?1:rp>=70&&r<70?-1:0;conditions={previousRSI:rp,rsi:r};}
   else{const prior=bars.slice(i-p.lookback,i),old=bars.slice(i-p.lookback-1,i-1),prev=bars[i-1];
    const upper=Math.max(...prior.map(b=>b.high)),lower=Math.min(...prior.map(b=>b.low));
    conditions={priorUpper:upper,priorLower:lower,excludesCurrentBar:true};
    direction=bars[i].close>upper&&prev.close<=Math.max(...old.map(b=>b.high))?1:bars[i].close<lower&&prev.close>=Math.min(...old.map(b=>b.low))?-1:0;}
  }
  rows.push({direction,conditions,rsi:r});
 }
 return rows;
}
function signalFrom(version,bars,index,calculation,datasetId,availableAt=null){
 const last=bars[index],step=SECONDS[version.timeframe],decisionTime=last.time+step;
 if(availableAt!==null&&decisionTime>availableAt)throw Error('Decision candle is not available');
 const p=version.parameters,hour=new Date(decisionTime*1000).getUTCHours();
 if(p.session==='london'&&(hour<7||hour>=16)||p.session==='new-york'&&(hour<13||hour>=22))return null;
 const {direction,conditions}=calculation;
 if(!direction||p.direction==='long'&&direction<0||p.direction==='short'&&direction>0)return null;
 const sourceCandles=bars.slice(Math.max(0,index-Math.max(p.slow,p.period+2,p.lookback+2)+1),index+1).map(b=>({time:b.time,closeTime:b.time+step}));
 const sourceDataHash=digest(bars.slice(0,index+1).map(b=>[b.time,b.open,b.high,b.low,b.close]));
 const base={sourceDataHash,strategyId:version.strategyId,strategyVersion:version.version,configurationHash:version.configurationHash,datasetId,instrument:version.symbol,direction:direction===1?'LONG':'SHORT',timestamp:decisionTime,timeframe:version.timeframe,conditions,sourceCandles,referencePrice:last.close,
  instructions:{entry:'NEXT_AVAILABLE_PRICE',stopPips:p.stopPips,takeProfitR:p.rewardRisk,maxHoldBars:p.maxHoldBars},risk:{sizing:'EQUITY_FRACTION',...p},state:'CONFIRMED_ENTRY',transitions:['NO_SIGNAL','ENTRY_CANDIDATE','CONFIRMED_ENTRY']};
 const {datasetId:provenanceId,...identity}=base;const signalId=digest(identity);return Object.freeze({...base,signalId,idempotencyKey:signalId});
}
function validateSignalHistory(version,bars){
 if(!version||makeVersion(version).configurationHash!==version.configurationHash)throw Error('Strategy version was modified');
 if(!Array.isArray(bars)||bars.some((b,i)=>b.closed!==true||!Number.isSafeInteger(b.time)||i&&b.time<=bars[i-1].time))throw Error('Signal inputs must be ordered closed candles');
}
export function confirm(version,bars,{datasetId='unbound',availableAt=null}={}){
 validateSignalHistory(version,bars);if(bars.length<version.warmup)return null;
 return signalFrom(version,bars,bars.length-1,calculations(version,bars).at(-1),datasetId,availableAt);
}
export function compileSignals(version,dataset){
 validateSignalHistory(version,dataset.bars);
 if(dataset.symbol!==version.symbol||dataset.timeframe!==version.timeframe)throw Error('Dataset/configuration mismatch');
 const computed=calculations(version,dataset.bars),out=new Map();
 for(let i=version.warmup-1;i<dataset.bars.length;i++){
  if(computed[i].direction){const signal=signalFrom(version,dataset.bars,i,computed[i],dataset.id);if(signal)out.set(i,signal);}
 }
 return out;
}
export function closedHigherBars(bars,decisionTime,timeframe){const step=SECONDS[timeframe];if(!step)throw Error('Unknown timeframe');return bars.filter(b=>b.closed===true&&b.time+step<=decisionTime);}
