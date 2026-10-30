/* EURUSD 5-minute closed-candle study, verified 15-minute trend. Research markers only.
 * No broker orders, assumed fills, leveraged lot suggestions or profit estimates.
 */
export const SCALP_PRESET_ID="eur-scalp-5m";
const finite=n=>typeof n==="number"&&Number.isFinite(n);
export function normalizeScalpSettings(raw={}){
 const number=(key,def,min,max)=>finite(raw?.[key])&&raw[key]>=min&&raw[key]<=max?raw[key]:def;
 return Object.freeze({
  adxMin:number("adxMin",25,15,40),
  rsiLong:number("rsiLong",50,45,70),
  rsiShort:number("rsiShort",50,30,55),
  stopAtr:number("stopAtr",1.2,0.5,3),
  rewardRisk:number("rewardRisk",1.5,1,3),
  maxHoldBars:Math.round(number("maxHoldBars",8,2,36)),
  maxMarkers:Math.round(number("maxMarkers",60,10,150))
 });
}
export function evaluateScalpResearch(primary,confirm,settings={}){
 const cfg=normalizeScalpSettings(settings);
 if(!primary?.bars||!confirm?.bars)return {ready:false,reason:"Verified 5m and 15m candle histories are required",markers:[]};
 const closed=primary.bars.filter(b=>b.closed===true),higher=confirm.bars.filter(b=>b.closed===true);
 if(closed.length<55||higher.length<55)return {ready:false,reason:"Insufficient closed 5m / 15m candle history",markers:[]};
 const tmap=(rows)=>new Map(rows.map(x=>[x.time,x.value]));
 const o=primary.overlays,h=confirm.overlays;
 if(!o||!h)return {ready:false,reason:"Indicator series unavailable",markers:[]};
 const p=Object.fromEntries(["ema20","ema50","rsi","adx","atr"].map(k=>[k,tmap(o[k]||[])]));
 const high20=tmap(h.ema20||[]),high50=tmap(h.ema50||[]);
 const hBars=higher.map(x=>({t:x.time,closeAt:x.time+900}));let hi=0;
 const markers=[];let open=null,lastSignal=null;
 for(let i=1;i<closed.length;i++){
  const b=closed[i],prev=closed[i-1],confirmAt=b.time+300;
  while(hi+1<hBars.length&&hBars[hi+1].closeAt<=confirmAt)hi++;
  const hBar=hBars[hi];
  const hReady=hBar&&hBar.closeAt<=confirmAt;
  if(open){
   const adverse=open.side==="LONG"?b.low<=open.stop:b.high>=open.stop;
   const favorable=open.side==="LONG"?b.high>=open.target:b.low<=open.target;
   const expired=i-open.index>=cfg.maxHoldBars;
   const fast=p.ema20.get(b.time),slow=p.ema50.get(b.time);
   const reversed=finite(fast)&&finite(slow)&&(open.side==="LONG"?fast<slow:fast>slow);
   if(adverse||favorable||expired||reversed){
    const reason=adverse?"STOP_TESTED":favorable?"TARGET_TESTED":expired?"TIME_LIMIT":"EMA_REVERSAL";
    // Both threshold touches in one OHLC bar are explicitly indeterminate. Do not
    // attribute a favorable fill, and treat stop threshold as the conservative event.
    markers.push({time:b.time,kind:"EXIT",side:open.side,reason:adverse&&favorable?"BOTH_TOUCHED_UNKNOWN_ORDER":reason,
     color:"#f7c16a",shape:"square",position:"aboveBar",
     label:"EXIT watch · "+(adverse&&favorable?"stop and target touched; order unknown":reason.replaceAll("_"," "))});
    open=null;
   }
   continue;
  }
  if(!hReady||!finite(high20.get(hBar.t))||!finite(high50.get(hBar.t)))continue;
  const ema=p.ema20.get(b.time),slow=p.ema50.get(b.time),
   rsi=p.rsi.get(b.time),adx=p.adx.get(b.time),atr=p.atr.get(b.time);
  const emaPrev=p.ema20.get(prev.time);
  if(![ema,slow,rsi,adx,atr,emaPrev].every(finite)||atr<=0||adx<cfg.adxMin)continue;
  const hDirection=Math.sign(high20.get(hBar.t)-high50.get(hBar.t));
  const direction=Math.sign(ema-slow);
  if(direction===0||direction!==hDirection)continue;
  // Prior closed bar must touch / penetrate the causal fast EMA, and the
  // current confirmed bar must regain it with directional candle body.
  const long=direction>0&&rsi>=cfg.rsiLong&&prev.low<=emaPrev&&b.close>ema&&b.close>b.open;
  const short=direction<0&&rsi<=cfg.rsiShort&&prev.high>=emaPrev&&b.close<ema&&b.close<b.open;
  if(!long&&!short)continue;
  const side=long?"LONG":"SHORT",entry=b.close;
  const nearby=closed.slice(Math.max(0,i-5),i+1);
  const swing=long?Math.min(...nearby.map(x=>x.low)):Math.max(...nearby.map(x=>x.high));
  const stop=long?Math.min(swing,entry-cfg.stopAtr*atr):Math.max(swing,entry+cfg.stopAtr*atr);
  const risk=Math.abs(entry-stop);if(!finite(risk)||risk<=0)continue;
  const target=long?entry+cfg.rewardRisk*risk:entry-cfg.rewardRisk*risk;
  open={side,index:i,stop,target};
  lastSignal={side,time:b.time,price:entry,stop,target,confirmedAfter:confirmAt};
  markers.push({time:b.time,kind:"ENTRY",side,color:long?"#25d6ab":"#ff5b8a",
   shape:long?"arrowUp":"arrowDown",position:long?"belowBar":"aboveBar",
   label:(long?"LONG":"SHORT")+" candidate · 5m/15m closed · no assumed execution"});
 }
 return {ready:true,reason:"Research candidates only; no execution or performance assumptions",
  lastSignal,openCandidate:open!==null,markers:markers.slice(-cfg.maxMarkers)};
}
