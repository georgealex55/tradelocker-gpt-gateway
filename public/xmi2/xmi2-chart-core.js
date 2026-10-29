/* XMI 2.0 — browser/Node research-only chart core. No network, secrets or orders. */
(function(root,factory){
 const api=factory();
 if(typeof module==="object"&&module.exports)module.exports=api;
 if(root)root.XMIChartCore=api;
})(typeof window!=="undefined"?window:null,function(){
 "use strict";
 const STEPS=Object.freeze({"1m":60,"5m":300,"15m":900,"30m":1800,"1H":3600,"4H":14400,"1D":86400});
 const TECH=Object.freeze(["EMA","VWAP","RSI","MACD","Volume"]);
 const SMC=Object.freeze(["BOS","CHoCH","FVG","Order Blocks","Liquidity Sweeps","HH / HL / LH / LL","Support / Resistance","MSS","Premium / Discount","Displacement","Session High / Low"]);
 const TYPES=Object.freeze(["Candlesticks","Hollow Candles","Heikin Ashi","OHLC Bars","Line","Area"]);
 function checkSymbol(value){
  const s=String(value||"").toUpperCase().trim();
  if(!/^FX:[A-Z]{6}$/.test(s))throw Error("Use a qualified forex symbol such as FX:EURUSD");
  return s;
 }
 function normalize(input){
  if(!input||typeof input!=="object")throw Error("Import an OHLC JSON object");
  const symbol=checkSymbol(input.symbol),timeframe=input.timeframe;
  if(!Object.hasOwn(STEPS,timeframe))throw Error("Unsupported timeframe");
  if(!Array.isArray(input.bars)||input.bars.length<2||input.bars.length>5000)throw Error("Import 2–5,000 candles");
  if(typeof input.asOf!=="string"||!/(Z|[+-]\d{2}:\d{2})$/.test(input.asOf))throw Error("Explicit source asOf timestamp required");
  const asOfMs=Date.parse(input.asOf);
  if(!Number.isFinite(asOfMs))throw Error("Invalid asOf timestamp");
  const step=STEPS[timeframe];
  let previous=-Infinity;
  const bars=input.bars.map((b,i)=>{
   const time=typeof b.time==="string"?Date.parse(b.time)/1000:b.time;
   if(!Number.isSafeInteger(time)||time<=0||time<=previous||time*1000>asOfMs)throw Error("Unordered, invalid or future candle at index "+i);
   previous=time;
   const n=["open","high","low","close"].map(k=>Number(b[k]));
   const [open,high,low,close]=n;
   if(n.some(x=>!Number.isFinite(x)||x<=0)||low>Math.min(open,close)||high<Math.max(open,close))throw Error("Invalid OHLC at index "+i);
   const volume=b.volume==null?null:Number(b.volume);
   if(volume!==null&&(!Number.isFinite(volume)||volume<0))throw Error("Invalid volume at index "+i);
   return {time,open,high,low,close,volume,closed:(time+step)*1000<=asOfMs};
  });
  return {symbol,timeframe,asOf:input.asOf,origin:"user-import",source:String(input.source||"unspecified").slice(0,80),bars};
 }
 function normalizeGateway(input){
  if(!input||input.ok!==true||input.readOnly!==true||
    input.contract!=="xmi-market-feed/v1"||input.source!=="tradelocker-readonly"||
    input.provider!=="TradeLocker"||input.origin!=="gateway-readonly"||
    input.asset!=="forex"||input.volumeBasis!=="broker-tick")
   throw Error("Unverified gateway source");
  if(typeof input.observedAt!=="string"||!Number.isFinite(Date.parse(input.observedAt))||
    Date.parse(input.observedAt)<Date.parse(input.asOf))
   throw Error("Missing observation timestamp");
  const normalized=normalize({symbol:input.symbol,timeframe:input.timeframe,
   asOf:input.asOf,source:"TradeLocker via private read-only gateway",bars:input.bars});
  return {...normalized,origin:"gateway-readonly",observedAt:input.observedAt,
   provider:"TradeLocker",volumeBasis:"broker-tick"};
 }
 function ema(values,n){
  const out=values.map(()=>null);if(values.length<n)return out;
  let last=values.slice(0,n).reduce((a,b)=>a+b,0)/n;
  out[n-1]=last;const k=2/(n+1);
  for(let i=n;i<values.length;i++){last=(values[i]-last)*k+last;out[i]=last;}
  return out;
 }
 function indicators(bars){
  const closed=bars.filter(b=>b.closed),closes=closed.map(b=>b.close);
  const gains=[],losses=[];let gain=0,loss=0;
  const rsi=closed.map(()=>null);
  for(let i=1;i<closed.length;i++){
   const delta=closes[i]-closes[i-1];gains.push(Math.max(0,delta));losses.push(Math.max(0,-delta));
   if(i===14){gain=gains.slice(0,14).reduce((a,b)=>a+b,0)/14;loss=losses.slice(0,14).reduce((a,b)=>a+b,0)/14;}
   else if(i>14){gain=(gain*13+gains[i-1])/14;loss=(loss*13+losses[i-1])/14;}
   if(i>=14)rsi[i]=loss===0?(gain===0?50:100):100-100/(1+gain/loss);
  }
  const e12=ema(closes,12),e26=ema(closes,26);
  const macd=e12.map((v,i)=>v===null||e26[i]===null?null:v-e26[i]);
  const eligible=macd.filter(v=>v!==null),signalValues=ema(eligible,9);
  const signal=closed.map(()=>null);let j=0;
  for(let i=0;i<macd.length;i++)if(macd[i]!==null)signal[i]=signalValues[j++];
  const vwap=closed.map(()=>null);let day=null,sumPV=0,sumV=0;
  for(let i=0;i<closed.length;i++){
   const b=closed[i],bucket=Math.floor(b.time/86400);
   if(bucket!==day){day=bucket;sumPV=0;sumV=0;}
   if(b.volume!==null&&b.volume>0){sumPV+=(b.high+b.low+b.close)/3*b.volume;sumV+=b.volume;}
   if(sumV>0)vwap[i]=sumPV/sumV;
  }
  const toLine=(values)=>values.map((v,i)=>v==null?null:{time:closed[i].time,value:v}).filter(Boolean);
  return {closed,ema20:toLine(ema(closes,20)),ema50:toLine(ema(closes,50)),
   ema200:toLine(ema(closes,200)),vwap:toLine(vwap),rsi:toLine(rsi),macd:toLine(macd),
   macdSignal:toLine(signal),volume:closed.filter(b=>b.volume!=null).map(b=>({time:b.time,value:b.volume}))};
 }
 function pivots(bars){
  const b=bars.filter(x=>x.closed),out=[];
  const step=b.length>1?b[1].time-b[0].time:60;
  for(let i=2;i+2<b.length;i++){
   const window=b.slice(i-2,i+3);
   if(window.every((v,j)=>j===2||v.high<b[i].high))out.push({kind:"H",price:b[i].high,time:b[i].time,confirmedAt:b[i+2].time+step});
   if(window.every((v,j)=>j===2||v.low>b[i].low))out.push({kind:"L",price:b[i].low,time:b[i].time,confirmedAt:b[i+2].time+step});
  }
  return out.sort((a,b)=>a.confirmedAt-b.confirmedAt);
 }
 function structure(bars,limit=5){
  const b=bars.filter(x=>x.closed),all=Object.fromEntries(SMC.map(id=>[id,[]]));
  const put=(concept,c,description,detail={})=>all[concept].push({concept,time:c.time,
   confirmedAt:c.time,description,...detail});
  let previousHigh=null,previousLow=null,lastHigh=null,lastLow=null,trend=null;
  let usedHigh=null,usedLow=null;
  const step=b.length>1?b[1].time-b[0].time:60;
  for(let i=4;i<b.length;i++){
   const c=b[i],prev=b[i-1],p=b[i-2],window=b.slice(i-4,i+1);
   const isHigh=window.every((v,j)=>j===2||v.high<p.high),isLow=window.every((v,j)=>j===2||v.low>p.low);
   if(isHigh){
    previousHigh=lastHigh;lastHigh={price:p.high,time:p.time};
    put("Support / Resistance",c,"Confirmed resistance swing",{price:p.high,side:"resistance"});
    if(previousHigh)put("HH / HL / LH / LL",c,p.high>previousHigh.price?"Higher high":"Lower high",{price:p.high});
   }
   if(isLow){
    previousLow=lastLow;lastLow={price:p.low,time:p.time};
    put("Support / Resistance",c,"Confirmed support swing",{price:p.low,side:"support"});
    if(previousLow)put("HH / HL / LH / LL",c,p.low>previousLow.price?"Higher low":"Lower low",{price:p.low});
   }
   const average=b.slice(Math.max(0,i-12),i).reduce((s,x)=>s+(x.high-x.low),0)/Math.min(12,i);
   const impulse=(c.high-c.low)>average*1.5&&Math.abs(c.close-c.open)>(c.high-c.low)*.55;
   if(impulse)put("Displacement",c,"Large directional closing candle",{side:c.close>=c.open?"bull":"bear"});
   if(lastHigh&&c.high>lastHigh.price&&c.close<lastHigh.price)put("Liquidity Sweeps",c,"Wick swept resistance and closed below",{price:lastHigh.price});
   if(lastLow&&c.low<lastLow.price&&c.close>lastLow.price)put("Liquidity Sweeps",c,"Wick swept support and closed above",{price:lastLow.price});
   const up=lastHigh&&c.close>lastHigh.price&&prev.close<=lastHigh.price&&usedHigh!==lastHigh.time;
   const down=lastLow&&c.close<lastLow.price&&prev.close>=lastLow.price&&usedLow!==lastLow.time;
   if(up||down){
    const side=up?"bull":"bear",level=up?lastHigh:lastLow;
    const reversal=trend!==null&&trend!==side,name=reversal?"CHoCH":"BOS";
    put(name,c,name+" confirmed by closed candle",{side,price:level.price});
    if(reversal&&impulse)put("MSS",c,"Reversal with displacement",{side,price:level.price});
    if(impulse){
     const opposite=b.slice(Math.max(0,i-5),i).reverse().find(x=>
      up?x.close<x.open:x.close>x.open);
     if(opposite)put("Order Blocks",c,"Heuristic opposing candle before break",
      {side,zone:{top:opposite.high,bottom:opposite.low}});
    }
    trend=side;if(up)usedHigh=lastHigh.time;else usedLow=lastLow.time;
   }
   if(i>=2&&average>0){
    const first=b[i-2];
    if(c.low>first.high&&c.low-first.high>average*.1)put("FVG",c,"Bullish three-candle gap",{side:"bull",zone:{top:c.low,bottom:first.high}});
    if(c.high<first.low&&first.low-c.high>average*.1)put("FVG",c,"Bearish three-candle gap",{side:"bear",zone:{top:first.low,bottom:c.high}});
   }
   if(lastHigh&&lastLow&&lastHigh.price>lastLow.price){
    const mid=(lastHigh.price+lastLow.price)/2;
    if((c.close>mid&&prev.close<=mid)||(c.close<mid&&prev.close>=mid))
     put("Premium / Discount",c,c.close>mid?"Premium half":"Discount half",{price:mid});
   }
  }
  if(b.length>1&&step<=3600){
   const groups=new Map();
   for(const candle of b){
    const day=Math.floor(candle.time/86400);
    for(const session of [{name:"Asia",start:0,end:8},{name:"London",start:8,end:16},{name:"New York",start:13,end:22}]){
     const from=day*86400+session.start*3600,to=day*86400+session.end*3600;
     if(candle.time<from||candle.time+step>to)continue;
     const key=day+"|"+session.name,g=groups.get(key)||{high:-Infinity,low:Infinity,to,name:session.name};
     g.high=Math.max(g.high,candle.high);g.low=Math.min(g.low,candle.low);groups.set(key,g);
    }
   }
   for(const g of groups.values()){
    const closing=b.find(c=>c.time>=g.to);
    if(closing)put("Session High / Low",closing,g.name+" UTC reference high / low",{zone:{top:g.high,bottom:g.low}});
   }
  }
  for(const key of SMC)all[key]=all[key].sort((x,y)=>x.time-y.time).slice(-Math.min(5,Math.max(1,limit)));
  return all;
 }
 function patterns(bars){
  const p=pivots(bars),detected=[];
  for(let i=2;i<p.length;i++){
   const [a,b,c]=p.slice(i-2,i+1);
   if(a.kind!==c.kind||a.kind===b.kind)continue;
   if(Math.abs(a.price-c.price)/Math.max(a.price,c.price)>.012)continue;
   detected.push({time:c.confirmedAt,pattern:a.kind==="H"?"Double Top":"Double Bottom",
    points:[a,b,c]});
  }
  return detected.slice(-5);
 }
 function chartBars(bars,type){
  if(!TYPES.includes(type))throw Error("Unknown chart type");
  if(type==="Line"||type==="Area")return bars.map(b=>({time:b.time,value:b.close}));
  if(type!=="Heikin Ashi")return bars.map(({time,open,high,low,close})=>({time,open,high,low,close}));
  let o=0,c=0;
  return bars.map((b,i)=>{const close=(b.open+b.high+b.low+b.close)/4,
   open=i?(o+c)/2:(b.open+b.close)/2;o=open;c=close;
   return {time:b.time,open,close,high:Math.max(b.high,open,close),low:Math.min(b.low,open,close)};});
 }
 return Object.freeze({STEPS,TECH,SMC,TYPES,checkSymbol,normalize,normalizeGateway,ema,indicators,pivots,structure,patterns,chartBars});
});
