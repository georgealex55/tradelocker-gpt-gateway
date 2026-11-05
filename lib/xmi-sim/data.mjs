import {digest,MAJORS,SECONDS} from './registry.mjs';
export function annotateDataQuality(dataset){
 const bars=dataset.bars||[],daily=dataset.timeframe==='1D';
 let saturdayBars=0,outOfSessionBars=0;
 if(!daily)for(const b of bars){const d=new Date(b.time*1000),day=d.getUTCDay(),hour=d.getUTCHours();if(day===6)saturdayBars++;if(day===6||day===0&&hour<20||day===5&&hour>=23)outOfSessionBars++;}
 const failures=(dataset.unresolvedGaps||0)+(outOfSessionBars>0?1:0)+(daily?1:0);
 return {...dataset,qualityAuditVersion:2,saturdayBars,outOfSessionBars,unresolvedDataFailures:failures,calendarStatus:outOfSessionBars?'OUT_OF_SESSION_CANDLES':daily?'DAILY_CALENDAR_UNVERIFIED':'BASIC_WEEKEND_CHECK_PASSED',qualityStatus:outOfSessionBars?'QUARANTINED':failures?'REVIEW_REQUIRED':'BASIC_CHECKS_PASSED'};
}
export function verifyDataset(input,{symbol='EURUSD',timeframe='15m',provider='USER_IMPORT',acquiredAt=Date.now(),synthetic=false}={}){
 if(!MAJORS.includes(symbol)||!SECONDS[timeframe]||!Array.isArray(input)||input.length<60||input.length>10000||!Number.isFinite(acquiredAt))throw Error('Invalid bounded Forex dataset');
 const step=SECONDS[timeframe],unique=new Map();let duplicates=0,excludedForming=0;
 for(const row of input){
  const b={time:row.time,open:Number(row.open),high:Number(row.high),low:Number(row.low),close:Number(row.close),volume:null,closed:true};
  if(!Number.isSafeInteger(b.time)||b.time<=0||b.time%step||['open','high','low','close'].some(k=>!Number.isFinite(b[k])||b[k]<=0)||b.high<Math.max(b.open,b.close)||b.low>Math.min(b.open,b.close)||b.low>b.high)throw Error('Invalid OHLC or UTC candle alignment');
  if(b.time+step>acquiredAt/1000||row.closed===false){excludedForming++;continue;}
  if(unique.has(b.time)){if(digest(unique.get(b.time))!==digest(b))throw Error('Conflicting duplicate candle');duplicates++;}else unique.set(b.time,b);
 }
 const bars=[...unique.values()].sort((a,b)=>a.time-b.time);if(bars.length<60)throw Error('Insufficient closed data');
 const gaps=[];
 for(let i=1;i<bars.length;i++)if(bars[i].time-bars[i-1].time>step){
  // Market closure classification remains explicit; no prices are filled in.
  const from=bars[i-1].time+step,to=bars[i].time;let weekendOnly=to-from<=72*3600;
  for(let t=from;weekendOnly&&t<to;t+=step){const d=new Date(t*1000),day=d.getUTCDay(),h=d.getUTCHours();if(!(day===6||day===0&&h<22||day===5&&h>=22)){weekendOnly=false;break;}}
  gaps.push({from,to,missingIntervals:(to-from)/step,classification:weekendOnly?'POSSIBLE_WEEKEND_CLOSURE':'UNRESOLVED_GAP'});
 }
 const data={symbol,timeframe,bars,provider,acquiredAt,synthetic,volumeBasis:'none',duplicatesRemoved:duplicates,excludedForming,gaps,unresolvedGaps:gaps.filter(g=>g.classification==='UNRESOLVED_GAP').length,sourceAuthenticated:provider==='Twelve Data',depth:bars.length,first:bars[0].time,last:bars.at(-1).time};
 return annotateDataQuality({...data,id:digest({symbol,timeframe,provider,bars}),provenance:'Vendor OHLC; no bid/ask, depth, or broker fills. Calendar closures are not independently authenticated.'});
}
export async function fetchForexHistory({symbol,timeframe,outputsize=5000,end=null},{env=process.env,fetchImpl=fetch,now=Date.now()}={}){
 if(!MAJORS.includes(symbol)||!SECONDS[timeframe]||!Number.isInteger(outputsize)||outputsize<100||outputsize>5000)throw Error('Invalid history request');
 if(!env.TWELVEDATA_API_KEY)throw Error('PROVIDER_NOT_CONFIGURED');
 const intervals={'1m':'1min','5m':'5min','15m':'15min','30m':'30min','1H':'1h','4H':'4h','1D':'1day'};
 const url=new URL('https://api.twelvedata.com/time_series');
 for(const [k,v] of Object.entries({symbol:symbol.slice(0,3)+'/'+symbol.slice(3),interval:intervals[timeframe],outputsize,timezone:'UTC',order:'ASC',format:'JSON',apikey:env.TWELVEDATA_API_KEY}))url.searchParams.set(k,String(v));
 if(end!==null){if(!Number.isSafeInteger(end)||end<=0||end*1000>now)throw Error('Invalid backfill boundary');url.searchParams.set('end_date',new Date(end*1000).toISOString().slice(0,19).replace('T',' '));}
 let response;try{response=await fetchImpl(url,{method:'GET',signal:AbortSignal.timeout(12000),cache:'no-store'});}catch{throw Error('PROVIDER_TIMEOUT');}
 if(!response.ok)throw Error(response.status===429?'PROVIDER_QUOTA':'PROVIDER_UNAVAILABLE');
 const body=await response.json();if(body.status==='error')throw Error(Number(body.code)===429?'PROVIDER_QUOTA':'PROVIDER_ACCESS_OR_DEPTH_LIMIT');
 if(body.meta?.timezone&&!['UTC','Etc/UTC'].includes(body.meta.timezone))throw Error('Provider timezone mismatch');
 if(body.meta?.symbol!==symbol.slice(0,3)+'/'+symbol.slice(3))throw Error('Provider symbol mismatch');
 const bars=(body.values||[]).map(b=>({...b,time:Date.parse(b.datetime.replace(' ','T')+(b.datetime.length===10?'T00:00:00Z':'Z'))/1000}));
 return verifyDataset(bars,{symbol,timeframe,provider:'Twelve Data',acquiredAt:now});
}
