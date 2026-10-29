"use client";
import {useEffect,useRef,useState} from "react";
import {computeFive,FX_RESOLUTIONS,quoteState} from "../../lib/xmiLiveMath.mjs";
import {parseHistoricalFile} from "../../lib/xmiHistoricalFile.mjs";
import {nextFeedDelay,feedHealth,retryableFeedError} from "../../lib/xmiFeedRecovery.mjs";
import styles from "./xmi.module.css";
import {defaultStructureSettings,requiredStructureTimeframes,detectStructure,assembleStructure} from "../../lib/xmiStructure.mjs";
import {StructureOverlayPrimitive,toStructureMarkers} from "../../lib/xmiStructureOverlay.mjs";
import {XMIDrawingPrimitive} from "../../lib/xmiDrawingPrimitive.mjs";
import {DEFAULT_CHART_SETTINGS,DEFAULT_TECH,chartSeriesData,autoFibonacci,detectClassicPatterns,requiredClicks,drawingPoint,TOOL_CATALOG} from "../../lib/xmiChartTools.mjs";
const COLOR={ema20:"#59c9d8",ema50:"#d1ad5b",ema200:"#a690fa",vwap:"#ef9ed9",
 rsi:"#60ccf5",macd:"#7c95ed",macdSignal:"#f1a45d"};
const TIMEFRAMES=Object.keys(FX_RESOLUTIONS);
const NO_STRUCTURE=defaultStructureSettings();
export default function XMILiveChart({symbol,resolution,onResolution,selected,onFocus,compact=false,active=true,
 structureSettings=NO_STRUCTURE,onStructure,technicalEnabled=DEFAULT_TECH,
 chartSettings=DEFAULT_CHART_SETTINGS,drawTool=null,savedDrawings=[],onDrawing,
 autoPatterns=true,autoFib=false,onPatterns,patternEnabled={},onAnalysis,strategyName="No preset"}){
 const el=useRef(null),chart=useRef(null),series=useRef(null),drawings=useRef(null);
 const importInput=useRef(null);
 const [offline,setOffline]=useState(null),[refreshNonce,setRefreshNonce]=useState(0);
 useEffect(()=>{
  const changed=()=>setRefreshNonce(n=>n+1);
  window.addEventListener("xmi:feed-access-changed",changed);
  return ()=>window.removeEventListener("xmi:feed-access-changed",changed);
 },[]);
 const interaction=useRef({points:[],stroke:[],count:0});
 const [pendingCount,setPendingCount]=useState(0);
 const [drawingError,setDrawingError]=useState("");
 const onPatternsRef=useRef(onPatterns);onPatternsRef.current=onPatterns;
 const onAnalysisRef=useRef(onAnalysis);onAnalysisRef.current=onAnalysis;
 const [clock,setClock]=useState(0);
 useEffect(()=>{if(!chartSettings.candleTimer)return;setClock(Date.now());const id=setInterval(()=>setClock(Date.now()),1000);return ()=>clearInterval(id);},[chartSettings.candleTimer]);
 const onDrawingRef=useRef(onDrawing);onDrawingRef.current=onDrawing;
 const onStructureRef=useRef(onStructure);onStructureRef.current=onStructure;
 const [auxData,setAuxData]=useState({});
 const [overlayMessage,setOverlayMessage]=useState("");
 const extraRes=requiredStructureTimeframes(structureSettings,resolution);
 const extraKey=extraRes.join("|");
 const [feed,setFeed]=useState({phase:"loading",message:"Waiting for read-only forex data",
  last:null,stats:null,asOf:null,quality:"UNAVAILABLE",failures:0,
  lastCheckedAt:null,lastSuccessAt:null,lastClosedAt:null,nextRefreshMs:null,
  sourceSymbol:symbol,sourceResolution:resolution});
 useEffect(()=>{if(selected)onAnalysisRef.current?.({stats:feed.stats,quality:feed.quality||"UNAVAILABLE",asOf:feed.asOf});},[feed.stats,feed.quality,feed.asOf,selected]);
 const [libReady,setLibReady]=useState(false);
 useEffect(()=>{interaction.current={points:[],stroke:[],count:0};setPendingCount(0);setDrawingError("");},[drawTool,symbol]);
 useEffect(()=>{
  if(!el.current)return;
  let live=true,resize;
  import("lightweight-charts").then(lib=>{
   if(!live||!el.current)return;
   const root=el.current;
   const dark=chartSettings.theme==="dark",bg=dark?"#0b1729":"#f7faff",grid=dark?"#1c2e43":"#dce4ee";
   const c=lib.createChart(root,{
    width:Math.max(300,root.clientWidth),height:root.clientHeight||620,
    layout:{background:{type:"solid",color:bg},textColor:dark?"#9cacc7":"#31435a",
      attributionLogo:true,fontSize:11},
    grid:{vertLines:{color:chartSettings.grid?grid:"transparent"},horzLines:{color:chartSettings.grid?grid:"transparent"}},
    rightPriceScale:{borderColor:"#354862",mode:chartSettings.scale==="log"?1:0},
    crosshair:{mode:chartSettings.crosshair?0:2},
    timeScale:{timeVisible:true,secondsVisible:false,borderColor:"#354862",rightOffset:5}
   });
   chart.current=c;
   const type=chartSettings.chartType;
   const seriesKind=type==="Line"?lib.LineSeries:type==="Area"?lib.AreaSeries:type==="OHLC Bars"?lib.BarSeries:lib.CandlestickSeries;
   const priceOptions={priceFormat:{type:"price",precision:chartSettings.precision,
     minMove:10**(-chartSettings.precision)},priceLineVisible:chartSettings.priceLine};
   const candle=c.addSeries(seriesKind,{
    ...priceOptions,
    ...(type==="Line"?{color:chartSettings.bull,lineWidth:2}:
       type==="Area"?{lineColor:chartSettings.bull,topColor:"rgba(40,173,157,.28)",bottomColor:"rgba(40,173,157,.02)"}:
       type==="OHLC Bars"?{upColor:chartSettings.bull,downColor:chartSettings.bear}:
       {upColor:type==="Hollow Candles"?"rgba(0,0,0,0)":chartSettings.bull,
        downColor:chartSettings.bear,borderVisible:chartSettings.borders||type==="Hollow Candles",
        borderUpColor:chartSettings.bull,borderDownColor:chartSettings.bear,
        wickVisible:chartSettings.wicks,wickUpColor:chartSettings.bull,wickDownColor:chartSettings.bear})
   },0);
   const newLine=(color,pane=0)=>c.addSeries(lib.LineSeries,{color,lineWidth:2,priceLineVisible:false,lastValueVisible:true,
    crosshairMarkerVisible:false},pane);
   const ema20=newLine(COLOR.ema20),ema50=newLine(COLOR.ema50),ema200=newLine(COLOR.ema200);
   const vwap=newLine(COLOR.vwap);
   const rsi=newLine(COLOR.rsi,1);
   const macd=newLine(COLOR.macd,2),macdSignal=newLine(COLOR.macdSignal,2);
   const histogram=c.addSeries(lib.HistogramSeries,{priceLineVisible:false,
      priceFormat:{type:"price",precision:5,minMove:0.00001}},2);
   const volume=c.addSeries(lib.HistogramSeries,{priceLineVisible:false,
     priceFormat:{type:"volume"},priceScaleId:""},3);
   try{c.panes()[1]?.setHeight(100);c.panes()[2]?.setHeight(95);c.panes()[3]?.setHeight(85);}catch{}
   series.current={candle,ema20,ema50,ema200,vwap,rsi,macd,macdSignal,histogram,volume};
   const primitive=new StructureOverlayPrimitive();
   candle.attachPrimitive(primitive);
   const manualPrimitive=new XMIDrawingPrimitive();candle.attachPrimitive(manualPrimitive);
   drawings.current={marker:lib.createSeriesMarkers(candle,[]),primitive,manualPrimitive};
   const resizeObserver=new ResizeObserver(entries=>{
    const rect=entries[0]?.contentRect;
    if(rect&&live)c.applyOptions({width:Math.max(300,Math.floor(rect.width)),height:Math.max(290,Math.floor(rect.height))});
   });
   resizeObserver.observe(root);resize=resizeObserver;
   setLibReady(true);
  }).catch(()=>setFeed(x=>({...x,phase:"error",message:"Chart engine unavailable"})));
  return ()=>{live=false;resize?.disconnect();chart.current?.remove();chart.current=null;series.current=null;drawings.current=null;setLibReady(false);};
 },[chartSettings.chartType]);
 useEffect(()=>{
  if(!libReady||!chart.current||!series.current)return;
  const dark=chartSettings.theme==="dark",bg=dark?"#0b1729":"#f7faff",grid=dark?"#1c2e43":"#dce4ee";
  chart.current.applyOptions({
   layout:{background:{type:"solid",color:bg},textColor:dark?"#9cacc7":"#31435a"},
   grid:{vertLines:{color:chartSettings.grid?grid:"transparent"},horzLines:{color:chartSettings.grid?grid:"transparent"}},
   crosshair:{mode:chartSettings.crosshair?0:2},
   rightPriceScale:{mode:chartSettings.scale==="log"?1:0},
   localization:{timeFormatter:t=>new Intl.DateTimeFormat("en-US",{timeZone:chartSettings.timezone,
    month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(t*1000))},
   timeScale:{tickMarkFormatter:t=>new Intl.DateTimeFormat("en-US",{timeZone:chartSettings.timezone,
    hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(t*1000))}
  });
  series.current.candle.applyOptions({
   priceFormat:{type:"price",precision:chartSettings.precision,minMove:10**(-chartSettings.precision)},
   priceLineVisible:chartSettings.priceLine,
   ...(chartSettings.chartType==="Line"?{color:chartSettings.bull}:
      chartSettings.chartType==="Area"?{lineColor:chartSettings.bull}:
      chartSettings.chartType==="OHLC Bars"?{upColor:chartSettings.bull,downColor:chartSettings.bear}:
      {upColor:chartSettings.chartType==="Hollow Candles"?"rgba(0,0,0,0)":chartSettings.bull,
       downColor:chartSettings.bear,borderVisible:chartSettings.borders||chartSettings.chartType==="Hollow Candles",
       borderUpColor:chartSettings.bull,borderDownColor:chartSettings.bear,
       wickVisible:chartSettings.wicks,wickUpColor:chartSettings.bull,wickDownColor:chartSettings.bear})
  });
 },[chartSettings,libReady]);
 useEffect(()=>{
  const all=series.current;if(!all)return;
  const visible={
   ema20:technicalEnabled.EMA,ema50:technicalEnabled.EMA,ema200:technicalEnabled.EMA,vwap:technicalEnabled.VWAP,
   rsi:technicalEnabled.RSI,macd:technicalEnabled.MACD,macdSignal:technicalEnabled.MACD,histogram:technicalEnabled.MACD,
   volume:technicalEnabled.Volume
  };
  for(const [key,on] of Object.entries(visible))all[key].applyOptions({visible:on});
 },[technicalEnabled,libReady]);
 useEffect(()=>{
  if(!libReady||!series.current||!active)return;
  let running=true,abort=null,timer=null,failures=0;
  let lastSuccessAt=null,lastClosedAt=null;
  const all=series.current;
  let fitted=false;
  function schedule(){
   if(!running)return;
   const delay=nextFeedDelay({resolution,now:Date.now(),failures,
    hidden:document.visibilityState==="hidden"});
   setFeed(prev=>({...prev,nextRefreshMs:delay}));
   timer=setTimeout(refresh,delay);
  }
  function onVisible(){
   if(document.visibilityState!=="visible"||!running)return;
   if(timer)clearTimeout(timer);
   timer=setTimeout(refresh,250);
  }
  document.addEventListener("visibilitychange",onVisible);
  // No synthetic candles or broker-order requests. Refresh a bounded OHLC snapshot.
  async function refresh(){
   if(!running)return;
   const local=offline?.symbol===symbol&&offline?.resolution===resolution?offline:null;
   if(!local&&document.visibilityState==="hidden"){schedule();return;}
   abort=local?null:new AbortController();
   const requestTimeout=abort?setTimeout(()=>abort.abort(
    new DOMException("Read-only candle request exceeded 15 seconds","TimeoutError")),15000):null;
   try{
    let data;
    if(local){
     data={ok:true,bars:local.bars,asOf:new Date().toISOString(),
      delivery:"manual historical import",volumeBasis:"provider",readOnly:true};
    }else{
     const u="/api/xmi/live?"+new URLSearchParams({symbol,resolution});
     const res=await fetch(u,{cache:"no-store",signal:abort.signal});
     data=await res.json();
     if(!res.ok||!data.ok){
      const e=new Error(data.error||"Candle source unavailable");e.code=data.code;throw e;
     }
    }
    const stats=computeFive(data.bars,resolution,Date.parse(data.asOf),data.volumeBasis);
    if(!running)return;
    const quality=local?"HISTORICAL":quoteState(stats.lastClosed,Date.parse(data.asOf),resolution);
    if(quality==="INVALID_TIME")throw Error("Broker candle timestamps are invalid; no current signal may be inferred");
    const mapped=stats.bars.map(({time,open,high,low,close})=>({time,open,high,low,close}));
    if(mapped.length){
     all.candle.setData(chartSeriesData(mapped,chartSettings.chartType));
     for(const key of ["ema20","ema50","ema200","vwap","rsi","macd","macdSignal"])
      all[key].setData(stats.overlays[key]);
     all.histogram.setData(stats.overlays.macdHistogram.map(p=>({...p,color:p.value>=0?"#339a9a":"#b66c84"})));
     all.volume.setData(stats.overlays.volume);
     if(!fitted){
      const last=mapped.length-1;
      chart.current?.timeScale().setVisibleLogicalRange({from:Math.max(0,last-69),to:last+5});
      fitted=true;
     }
    }
    failures=0;
    lastSuccessAt=Date.now();
    lastClosedAt=stats.lastClosed?.time?stats.lastClosed.time*1000:null;
    setFeed({phase:local?"historical":quality==="STALE"?"stale":mapped.length?"ready":"empty",
     message:local?"Imported historical OHLC · device only · no broker connection":
      mapped.length?(quality==="CURRENT"?"Read-only candles · "+data.delivery:"Broker candles are not recent"):"No candles returned",
     stats,asOf:data.asOf,last:stats.latest,quality,failures:0,
     lastCheckedAt:Date.now(),lastSuccessAt,lastClosedAt,nextRefreshMs:null,
     sourceSymbol:symbol,sourceResolution:resolution});
   }catch(e){
    if(!running||e.name==="AbortError")return;
    const disabled=e.code==="FEED_DISABLED",locked=e.code==="FEED_LOCKED";
    const retryable=retryableFeedError(e.code);
    failures=retryable?failures+1:0;
    setFeed(prev=>({...prev,phase:locked?"locked":disabled?"disabled":"error",
     message:locked?"Feed is locked. Use Unlock read-only feed in the top toolbar, then refresh.":
      disabled?"Production broker feed is not configured. Import OHLC JSON or open Historical Chart Studio.":e.message,
     stats:null,last:prev.last,quality:"UNAVAILABLE",asOf:prev.asOf,
     failures,lastCheckedAt:Date.now(),
     lastSuccessAt:lastSuccessAt||prev.lastSuccessAt,
     lastClosedAt:lastClosedAt||prev.lastClosedAt,
     nextRefreshMs:null}));
    if(!retryable)running=false;
   }finally{if(requestTimeout)clearTimeout(requestTimeout);if(running&&!local)schedule();}
  }
  setFeed(prev=>{
   const same=prev.sourceSymbol===symbol&&prev.sourceResolution===resolution;
   return {phase:"loading",message:"Loading verified broker candles…",
    last:same?prev.last:null,stats:null,asOf:same?prev.asOf:null,
    quality:"UNAVAILABLE",failures:0,lastCheckedAt:null,
    lastSuccessAt:same?prev.lastSuccessAt:null,
    lastClosedAt:same?prev.lastClosedAt:null,
    nextRefreshMs:null,sourceSymbol:symbol,sourceResolution:resolution};
  });
  // Clear stale previous symbol history immediately.
  for(const key of Object.keys(all))all[key].setData([]);
  refresh();
  return ()=>{running=false;document.removeEventListener("visibilitychange",onVisible);
   abort?.abort();if(timer)clearTimeout(timer);};
 },[symbol,resolution,libReady,active,chartSettings.chartType,offline,refreshNonce]);
 // Additional timeframes use the same protected, read-only candle API.
 // Each distinct selected timeframe is fetched once; settings are shared by all charts.
 useEffect(()=>{
  if(!active||!libReady||!extraKey||
   (offline?.symbol===symbol&&offline?.resolution===resolution))return;
  let running=true,timer=null;
  const controllers=[];
  async function load(){
   if(!running)return;
   if(document.visibilityState==="hidden"){timer=setTimeout(load,65000);return;}
   await Promise.all(extraKey.split("|").map(async tf=>{
    const controller=new AbortController();controllers.push(controller);
    const key=symbol+"|"+tf;
    try{
     const res=await fetch("/api/xmi/live?"+new URLSearchParams({symbol,resolution:tf}),
      {cache:"no-store",signal:controller.signal});
     const data=await res.json();
     if(!res.ok||!data.ok)throw Error(data.error||"No verified market candles");
     const structure=detectStructure(data.bars,tf,Date.parse(data.asOf));
     if(running)setAuxData(old=>({...old,[key]:{structure,loadedAt:Date.parse(data.asOf)}}));
    }catch(err){
     if(running&&err.name!=="AbortError")
      setAuxData(old=>({...old,[key]:{error:"Market data unavailable for "+tf}}));
    }
   }));
   if(running)timer=setTimeout(load,65000);
  }
  load();
  return ()=>{running=false;if(timer)clearTimeout(timer);controllers.forEach(c=>c.abort());};
 },[symbol,resolution,active,libReady,extraKey,offline,refreshNonce]);
 useEffect(()=>{
  const overlay=drawings.current;
  if(!libReady||!overlay)return;
  if(!feed.stats){
   overlay.marker.setMarkers([]);
   overlay.primitive.setAnnotations([],null);
   setOverlayMessage("");
   if(selected)onStructureRef.current?.({summaries:[],annotations:[],unavailable:[{concept:"Market data",resolution,reason:"Awaiting verified candles"}]});
   return;
  }
  const byResolution={
   [resolution]:{structure:detectStructure(feed.stats.bars,resolution,Date.parse(feed.asOf))}
  };
  for(const tf of extraRes){
   const stored=auxData[symbol+"|"+tf];
   if(stored)byResolution[tf]=stored;
  }
  const display=feed.stats.bars;
  const result=assembleStructure(structureSettings,byResolution,resolution,display);
  try{
   overlay.marker.setMarkers(toStructureMarkers(result.annotations));
   overlay.primitive.setAnnotations(result.annotations,display.at(-1)?.time??null);
   setOverlayMessage(result.annotations.length+" annotations · "+result.unavailable.length+" timeframes awaiting data");
  }catch(err){
   setOverlayMessage("Structure drawing unavailable; candle feed remains read-only");
  }
  if(selected)onStructureRef.current?.(result);
 },[symbol,resolution,feed.stats,feed.asOf,structureSettings,auxData,libReady,selected,active,extraKey]);
 // Manual drawings, completed price patterns, and swing-anchored Fibonacci use the
 // existing chart data only. Missing data clears every optional drawing primitive.
 useEffect(()=>{
  if(!libReady||!drawings.current)return;
  const primitive=drawings.current.manualPrimitive;
  if(!feed.stats){primitive.setDrawings([]);if(selected)onPatternsRef.current?.([]);return;}
  const bars=feed.stats.bars;
  const nearest=time=>{
   const b=bars.reduce((best,bar)=>!best||Math.abs(bar.time-time)<Math.abs(best.time-time)?bar:best,null);
   return b?.time??time;
  };
  const project=d=>({...d,points:d.points.map(p=>({...p,time:nearest(p.time)}))});
  const manual=savedDrawings.map(project);
  const detected=autoPatterns?detectClassicPatterns(bars).filter(x=>patternEnabled[x.concept]!==false):[];
  const patterns=detected.slice(0,16).map(p=>project({
   id:p.id,tool:p.concept,symbol,auto:true,points:p.points
  }));
  const fib=autoFib?autoFibonacci(bars,
   TOOL_CATALOG.Fibonacci.includes(drawTool)?drawTool:"Fib Retracement"):null;
  const fibDrawings=fib?[project({...fib,id:"fib:auto",symbol,auto:true})]:[];
  primitive.setDrawings([...manual,...patterns,...fibDrawings]);
  if(selected)onPatternsRef.current?.(detected.slice(0,8));
 },[feed.stats,libReady,savedDrawings,autoPatterns,autoFib,drawTool,symbol,selected,patternEnabled]);
 async function importHistory(event){
  const file=event.target.files?.[0];
  event.target.value="";
  if(!file)return;
  if(file.size>900000){setFeed(p=>({...p,message:"Historical file too large (900 KB maximum)"}));return;}
  try{
   const parsed=parseHistoricalFile(await file.text(),{symbol,resolution});
   setOffline(parsed);setRefreshNonce(n=>n+1);
  }catch(e){setFeed(p=>({...p,message:"Import rejected: "+e.message}));}
 }
 function pointerPoint(e){
  const root=el.current,seriesApi=series.current?.candle,chartApi=chart.current;
  if(!root||!seriesApi||!chartApi)return null;
  const rect=root.getBoundingClientRect();
  const time=chartApi.timeScale().coordinateToTime(e.clientX-rect.left);
  const price=seriesApi.coordinateToPrice(e.clientY-rect.top);
  if(typeof time!=="number"||!Number.isFinite(price)||price<=0)return null;
  return drawingPoint(time,price);
 }
 function commitPoints(tool,points){
  if(!points.length)return;
  const text=tool==="Text labels"?(window.prompt("Chart note (maximum 100 characters):","Note")||"").slice(0,100):"";
  if(tool==="Text labels"&&!text)return;
  const done=onDrawingRef.current?.({tool,points,text});
  if(done){interaction.current.points=[];interaction.current.stroke=[];setPendingCount(0);setDrawingError("");}
 }
 function pointerDown(e){
  if(!drawTool)return;
  e.preventDefault();e.stopPropagation();
  const point=pointerPoint(e);
  if(!point){setDrawingError("Click inside the plotted price area");return;}
  try{
   if(drawTool==="Freehand drawing"){
    interaction.current.stroke=[point];
    e.currentTarget.setPointerCapture(e.pointerId);
    setPendingCount(1);
   }else{
    const points=[...interaction.current.points,point];
    interaction.current.points=points;setPendingCount(points.length);
    if(points.length>=requiredClicks(drawTool))commitPoints(drawTool,points);
   }
  }catch{setDrawingError("Invalid chart point");}
 }
 function pointerMove(e){
  if(drawTool!=="Freehand drawing"||!interaction.current.stroke.length)return;
  const point=pointerPoint(e);
  if(point&&interaction.current.stroke.length<600){
   const stroke=interaction.current.stroke;
   if(stroke.at(-1).time!==point.time||Math.abs(stroke.at(-1).price-point.price)>1e-7)stroke.push(point);
  }
 }
 function pointerUp(e){
  if(drawTool!=="Freehand drawing"||!interaction.current.stroke.length)return;
  const stroke=interaction.current.stroke.slice();
  if(stroke.length>1)commitPoints(drawTool,stroke);
  interaction.current.stroke=[];
  setPendingCount(0);
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 }
 const stats=feed.stats;const ready=feed.phase==="ready";
 const health=feedHealth({...feed,now:clock||Date.now()});
 const untilClose=Math.ceil((FX_RESOLUTIONS[resolution]*1000-clock%(FX_RESOLUTIONS[resolution]*1000))/1000);
 const countdown=clock===0?"--:--":String(Math.floor(untilClose/60)).padStart(2,"0")+":"+String(untilClose%60).padStart(2,"0");
 return <article className={styles.engineCard+(selected?" "+styles.chartActive:"")} aria-label={symbol+" live forex chart"}>
  <div className={styles.engineTop}>
   <div><strong className={styles.engineSymbol}>{symbol.slice(0,3)}/{symbol.slice(3)}</strong>
    <small>TradeLocker · read-only {compact?"":"· forming candles shown when supplied"}</small></div>
   <div className={styles.engineActions}>
    <label className={styles.srOnly} htmlFor={"engine-"+symbol+"-"+(compact?"small":"large")}>Timeframe</label>
    <select id={"engine-"+symbol+"-"+(compact?"small":"large")} value={resolution}
      onChange={e=>onResolution(e.target.value)}>{TIMEFRAMES.map(t=><option value={t} key={t}>{t}</option>)}</select>
    <button type="button" aria-pressed={selected} onClick={onFocus}
      className={selected?styles.activeFocus:styles.focusButton}>{selected?"Research chart":"Focus"}</button>
     <button type="button" aria-label={"Refresh "+symbol+" chart"} onClick={()=>setRefreshNonce(n=>n+1)}>↻ Refresh chart</button>
     <input ref={importInput} type="file" accept=".json,application/json" hidden
       aria-label={"Import "+symbol+" historical OHLC JSON"} onChange={importHistory}/>
     <button type="button" onClick={()=>importInput.current?.click()}>Import OHLC JSON</button>
     {offline?.symbol===symbol&&offline?.resolution===resolution?
      <button type="button" onClick={()=>{setOffline(null);setRefreshNonce(n=>n+1);}}>Clear import</button>:null}
   </div>
  </div>
  <div className={styles.engineDrawingCaption}>
   <span>{chartSettings.chartType}{chartSettings.chartType==="Heikin Ashi"?" · transformed prices (not broker executions)":""}</span>
   <span>Indicators & patterns · unified toolbar</span>
   {chartSettings.candleTimer?<span role="timer">Candle boundary in {countdown} · local-clock estimate</span>:null}
  </div>
  <div className={styles.engineDrawHost}>
   {health.warning?<div className={styles.feedOverlayWarning} role="status">
    <strong>{health.label}</strong>
    <span>{health.verifiedAt?"Last successful check: "+new Date(health.verifiedAt).toLocaleTimeString()+
     " · displayed candles are not current":
     "Live data verification unavailable. Do not interpret displayed prices as current."}</span>
   </div>:null}
   <div className={styles.engineCanvas} ref={el} style={{height:compact?460:620}}
    aria-label={chartSettings.chartType+" market chart"}/>
   {drawTool&&!TOOL_CATALOG.Fibonacci.includes(drawTool)?<div className={styles.engineDrawCapture} role="application"
    aria-label={"Drawing tool "+drawTool} title={"Click chart points for "+drawTool}
    onPointerDown={pointerDown} onPointerMove={pointerMove}
    onPointerUp={pointerUp} onPointerCancel={pointerUp}/>:null}
  </div>
  {drawTool?<div className={styles.engineDrawStatus} role="status">
   Drawing: {drawTool} · {TOOL_CATALOG.Fibonacci.includes(drawTool)?"Automatically anchored to confirmed swings":drawTool==="Freehand drawing"?"Drag on chart":"Select "+requiredClicks(drawTool)+" chart point(s)"}
   {pendingCount?" · "+pendingCount+" point(s) selected":""}
   {drawingError?" · "+drawingError:""}
  </div>:null}
  <div className={styles.engineFooter}>
   <span className={feed.phase==="ready"?styles.liveOk:styles.feedWarn}>
    {feed.phase==="historical"?"IMPORTED HISTORY":ready?"CANDLES RECEIVING":
      feed.phase==="loading"?"CONNECTING":feed.phase==="stale"?"STALE DATA":
      feed.phase==="disabled"?"FEED DISABLED":feed.phase==="locked"?"FEED LOCKED":"NOT LIVE"}
   </span>
   <span role="status">{feed.message}</span>
   {(feed.phase==="disabled"||feed.phase==="locked")?
    <a href="/xmi2/chart-studio.html">Open offline Historical Chart Studio</a>:null}
   <span>{feed.last?(ready?"Latest broker bar":"Last previously verified bar")+" · "+
    new Date(feed.last.time*1000).toLocaleString():"No verified price"}</span>
   <span className={styles.feedDiagnostics}>
    Checked {health.checkedAt?new Date(health.checkedAt).toLocaleTimeString():"not yet"}
    {health.closedBarAt?" · Closed bar "+new Date(health.closedBarAt).toLocaleTimeString():""}
    {health.retries?" · Retry attempts "+health.retries:""}
    {feed.nextRefreshMs?" · Next check ~"+Math.round(feed.nextRefreshMs/1000)+"s":""}
   </span>
   {stats?.bars?.length?<span className={styles.candleReadout}>
    {stats.bars.length} verified candles · O {feed.last.open.toFixed(5)} · H {feed.last.high.toFixed(5)} · L {feed.last.low.toFixed(5)} · C {feed.last.close.toFixed(5)}
   </span>:null}
   {overlayMessage?<span>{overlayMessage}</span>:null}
  </div>
  {stats?<div className={styles.engineNotes}>
    <span>{stats.volumeLabel}. {stats.vwapLabel}.</span>
    <span>{feed.phase==="historical"?
      "Imported history is not a live quote. Research signals use confirmed closed candles only.":
      "Indicators may use a forming candle. Confirmed signals require an activated strategy and a closed candle."}</span>
   </div>:null}
  <div className={styles.engineSignal}>
   <strong>Strategy monitor</strong><span>{strategyName} · RESEARCH ONLY</span>
   <small>Educational preset active for display only. Order execution and automatic trade signals remain disabled.</small>
  </div>
 </article>;
}
