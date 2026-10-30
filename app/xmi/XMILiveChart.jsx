"use client";
import {useEffect,useRef,useState} from "react";
import {computeFive,FX_RESOLUTIONS,quoteState} from "../../lib/xmiLiveMath.mjs";
import {parseHistoricalFile} from "../../lib/xmiHistoricalFile.mjs";
import {nextFeedDelay,feedHealth,retryableFeedError} from "../../lib/xmiFeedRecovery.mjs";
import {inspectCandleQuality} from "../../lib/xmiDataQuality.mjs";
import styles from "./xmi.module.css";
import {defaultStructureSettings,STRUCTURE_CONCEPTS,requiredStructureTimeframes,detectStructure,assembleStructure} from "../../lib/xmiStructure.mjs";
import {StructureOverlayPrimitive,toStructureMarkers} from "../../lib/xmiStructureOverlay.mjs";
import {XMIDrawingPrimitive} from "../../lib/xmiDrawingPrimitive.mjs";
import {buildIndicatorMarkers,stackChartMarkers,markerSeriesPayload} from "../../lib/xmiIndicatorMarkers.mjs";
import {computeChartAlgorithms} from "../../lib/xmiChartAlgorithms.mjs";
import {DEFAULT_INDICATOR_SETTINGS} from "../../lib/xmiIndicatorSettings.mjs";
import {SCALP_PRESET_ID,evaluateScalpResearch} from "../../lib/xmiScalpResearch.mjs";
import {DEFAULT_CHART_SETTINGS,DEFAULT_TECH,chartSeriesData,autoFibonacci,detectClassicPatterns,requiredClicks,drawingPoint,TOOL_CATALOG} from "../../lib/xmiChartTools.mjs";
const COLOR={ema20:"#59c9d8",ema50:"#d1ad5b",ema200:"#a690fa",vwap:"#ef9ed9",
 rsi:"#60ccf5",macd:"#7c95ed",macdSignal:"#f1a45d"};
const TIMEFRAMES=Object.keys(FX_RESOLUTIONS);
const NO_STRUCTURE=defaultStructureSettings();
export default function XMILiveChart({symbol,resolution,onResolution,selected,onFocus,compact=false,active=true,
 structureSettings=NO_STRUCTURE,onStructure,technicalEnabled=DEFAULT_TECH,
 indicatorSettings=DEFAULT_INDICATOR_SETTINGS,strategyId="day",strategyEdit={},
 chartSettings=DEFAULT_CHART_SETTINGS,drawTool=null,savedDrawings=[],onDrawing,onDrawingMove,
 autoPatterns=true,autoFib=false,onPatterns,patternEnabled={},onAnalysis,strategyName="No preset",
 onTechnicalChange,onStructureChange,onPatternChange,onPatternsEnabled,onChartSettingChange}){
 const el=useRef(null),chart=useRef(null),series=useRef(null),drawings=useRef(null);
 const importInput=useRef(null);
 const markerItems=useRef([]);
 const [expandedMarkerId,setExpandedMarkerId]=useState("");
 const [zoomStatus,setZoomStatus]=useState("");
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
 const onDrawingMoveRef=useRef(onDrawingMove);onDrawingMoveRef.current=onDrawingMove;
 const moving=useRef(null);
 const onStructureRef=useRef(onStructure);onStructureRef.current=onStructure;
 const [auxData,setAuxData]=useState({});
 const [overlayMessage,setOverlayMessage]=useState("");
 const scalpActive=strategyId===SCALP_PRESET_ID&&symbol==="EURUSD"&&resolution==="5m";
 const extraRes=requiredStructureTimeframes(structureSettings,resolution);
 if(scalpActive&&!extraRes.includes("15m"))extraRes.push("15m");
 const extraKey=extraRes.sort().join("|");
 const [feed,setFeed]=useState({phase:"loading",message:"Waiting for read-only forex data",
  last:null,stats:null,asOf:null,quality:"UNAVAILABLE",failures:0,
  lastCheckedAt:null,lastSuccessAt:null,lastClosedAt:null,nextRefreshMs:null,
  sourceSymbol:symbol,sourceResolution:resolution});
 useEffect(()=>{
  if(!selected)return;
  const higher=auxData[symbol+"|15m"];
  const trusted=scalpActive&&feed.quality==="CURRENT"&&feed.stats?.dataHealth?.researchReady===true&&
   higher?.scalpStats&&Date.now()-higher.loadedAt<10*60000&&
   quoteState(higher.scalpStats.lastClosed,Date.now(),"15m")==="CURRENT";
  const research=scalpActive?
   trusted?evaluateScalpResearch(feed.stats,higher.scalpStats,strategyEdit):
    {ready:false,reason:"Waiting for a fresh, validated 15m trend source",markers:[]}:
   null;
  onAnalysisRef.current?.({stats:research&&feed.stats?{...feed.stats,scalpResearch:research}:feed.stats,
   quality:feed.quality||"UNAVAILABLE",asOf:feed.asOf});
 },[feed.stats,feed.quality,feed.asOf,selected,scalpActive,symbol,auxData,
  strategyEdit.adxMin,strategyEdit.stopAtr,strategyEdit.rewardRisk,strategyEdit.maxHoldBars]);
 const [libReady,setLibReady]=useState(false);
 useEffect(()=>{interaction.current={points:[],stroke:[],count:0};moving.current=null;setPendingCount(0);setDrawingError("");},[drawTool,symbol]);
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
    handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:true},
    handleScale:{mouseWheel:true,pinch:true,axisPressedMouseMove:{time:true,price:true},
     axisDoubleClickReset:{time:true,price:true}},
    kineticScroll:{mouse:chartSettings.kineticScroll,touch:chartSettings.kineticScroll},
    timeScale:{timeVisible:true,secondsVisible:false,borderColor:"#354862",rightOffset:5,minBarSpacing:2,barSpacing:8}
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
   // Allocate only visible lower panes; disabled oscillators never leave empty space.
   let pane=0;
   const momentumPane=technicalEnabled.RSI||technicalEnabled.ADX||technicalEnabled.Stochastic?++pane:null;
   const macdPane=technicalEnabled.MACD?++pane:null;
   const atrPane=technicalEnabled.ATR?++pane:null;
   const volumePane=technicalEnabled.Volume?++pane:null;
   const rsi=momentumPane?newLine(COLOR.rsi,momentumPane):null;
   const adx=momentumPane?newLine("#f4c760",momentumPane):null;
   const plusDI=momentumPane?newLine("#24cea4",momentumPane):null;
   const minusDI=momentumPane?newLine("#f46e87",momentumPane):null;
   const stochK=momentumPane?newLine("#a28afc",momentumPane):null;
   const stochD=momentumPane?newLine("#ffbd75",momentumPane):null;
   const macd=macdPane?newLine(COLOR.macd,macdPane):null;
   const macdSignal=macdPane?newLine(COLOR.macdSignal,macdPane):null;
   const histogram=macdPane?c.addSeries(lib.HistogramSeries,{priceLineVisible:false,
      priceFormat:{type:"price",precision:5,minMove:0.00001}},macdPane):null;
   const atr=atrPane?newLine("#ffca73",atrPane):null;
   const volumeMA=volumePane?newLine("#d8b96b",volumePane):null;
   const volume=volumePane?c.addSeries(lib.HistogramSeries,{priceLineVisible:false,
     priceFormat:{type:"volume"},priceScaleId:""},volumePane):null;
   const bbUpper=newLine("#b88fff"),bbBasis=newLine("#a39ab3"),bbLower=newLine("#b88fff");
   const donchianUpper=newLine("#54d8ad"),donchianLower=newLine("#e58f9f");
   try{for(let i=1;i<=pane;i++)c.panes()[i]?.setHeight(i===momentumPane?110:85);}catch{}
   const regLine=newLine("#f2c86e"),regUpper=newLine("#edaa58"),regLower=newLine("#edaa58");
   const atrUpper=newLine("#39bfa5"),atrLower=newLine("#df8ca0");
   series.current={candle,ema20,ema50,ema200,vwap,rsi,macd,macdSignal,histogram,volume,volumeMA,
    regLine,regUpper,regLower,atrUpper,atrLower,
    atr,adx,plusDI,minusDI,stochK,stochD,bbUpper,bbBasis,bbLower,donchianUpper,donchianLower};
   const primitive=new StructureOverlayPrimitive();
   candle.attachPrimitive(primitive);
   const manualPrimitive=new XMIDrawingPrimitive();candle.attachPrimitive(manualPrimitive);
   drawings.current={marker:lib.createSeriesMarkers(candle,[]),primitive,manualPrimitive};
   c.subscribeClick(param=>{
    const id=param?.hoveredInfo?.objectId??param?.hoveredObjectId;
    if(typeof id==="string"&&id.startsWith("xmi:")&&markerItems.current.some(m=>m.id===id))
     setExpandedMarkerId(old=>old===id?"":id);
   });
   const resizeObserver=new ResizeObserver(entries=>{
    const rect=entries[0]?.contentRect;
    if(rect&&live)c.applyOptions({width:Math.max(300,Math.floor(rect.width)),height:Math.max(290,Math.floor(rect.height))});
   });
   resizeObserver.observe(root);resize=resizeObserver;
   setLibReady(true);
  }).catch(()=>setFeed(x=>({...x,phase:"error",message:"Chart engine unavailable"})));
  return ()=>{live=false;resize?.disconnect();chart.current?.remove();chart.current=null;series.current=null;drawings.current=null;setLibReady(false);};
 },[chartSettings.chartType,technicalEnabled.RSI,technicalEnabled.MACD,
  technicalEnabled.ADX,technicalEnabled.Stochastic,technicalEnabled.ATR,technicalEnabled.Volume]);
 useEffect(()=>{
  if(!libReady||!chart.current||!series.current)return;
  const dark=chartSettings.theme==="dark",bg=dark?"#0b1729":"#f7faff",grid=dark?"#1c2e43":"#dce4ee";
  chart.current.applyOptions({
   layout:{background:{type:"solid",color:bg},textColor:dark?"#9cacc7":"#31435a"},
   grid:{vertLines:{color:chartSettings.grid?grid:"transparent"},horzLines:{color:chartSettings.grid?grid:"transparent"}},
   crosshair:{mode:chartSettings.crosshair?0:2},
   rightPriceScale:{mode:chartSettings.scale==="log"?1:0},
   kineticScroll:{mouse:chartSettings.kineticScroll,touch:chartSettings.kineticScroll},
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
   volume:technicalEnabled.Volume,volumeMA:technicalEnabled.Volume&&indicatorSettings.volumeAverage>1,atr:technicalEnabled.ATR,
   adx:technicalEnabled.ADX,plusDI:technicalEnabled.ADX,minusDI:technicalEnabled.ADX,
   stochK:technicalEnabled.Stochastic,stochD:technicalEnabled.Stochastic,
   bbUpper:technicalEnabled.Bollinger,bbBasis:technicalEnabled.Bollinger,bbLower:technicalEnabled.Bollinger,
   donchianUpper:technicalEnabled.Donchian,donchianLower:technicalEnabled.Donchian
  };
  const mode=chartSettings.algorithmMode;
  Object.assign(visible,{
   regLine:mode==="regression"||mode==="both",regUpper:mode==="regression"||mode==="both",
   regLower:mode==="regression"||mode==="both",atrUpper:mode==="atrBands"||mode==="both",
   atrLower:mode==="atrBands"||mode==="both"
  });
  for(const [key,on] of Object.entries(visible))all[key]?.applyOptions({visible:!!on});
 },[technicalEnabled,libReady,chartSettings.algorithmMode,indicatorSettings.volumeAverage]);
 useEffect(()=>{
  if(!libReady||!series.current||!active)return;
  let running=true,abort=null,timer=null,failures=0,inFlight=false;
  let lastSuccessAt=null,lastClosedAt=null;
  const all=series.current;
  let fitted=false;
  function schedule(){
   if(!running)return;
   const delay=nextFeedDelay({resolution,now:Date.now(),failures,
    profile:chartSettings.refreshProfile,
    hidden:document.visibilityState==="hidden"});
   setFeed(prev=>({...prev,nextRefreshMs:delay}));
   timer=setTimeout(refresh,delay);
  }
  function onVisible(){
   if(document.visibilityState!=="visible"||!running||inFlight)return;
   if(timer)clearTimeout(timer);
   timer=setTimeout(refresh,250);
  }
  document.addEventListener("visibilitychange",onVisible);
  // No synthetic candles or broker-order requests. Refresh a bounded OHLC snapshot.
  async function refresh(){
   if(!running||inFlight)return;
   const local=offline?.symbol===symbol&&offline?.resolution===resolution?offline:null;
   if(!local&&document.visibilityState==="hidden"){schedule();return;}
   inFlight=true;
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
    const reportedAt=Date.parse(data.asOf),observedNow=Date.now();
    if(!Number.isFinite(reportedAt))
     throw Error("Candle source observation time is invalid; no current data inferred");
    const stats=computeFive(data.bars,resolution,reportedAt,data.volumeBasis,indicatorSettings);
    if(!running)return;
    const observedQuality=local?"HISTORICAL":quoteState(stats.lastClosed,observedNow,resolution);
    if(observedQuality==="INVALID_TIME")
     throw Error("Broker candle timestamps are invalid; no current research may be inferred");
    const dataHealth=inspectCandleQuality({bars:stats.bars,overlays:stats.overlays,
     resolution,asOf:reportedAt,now:observedNow,sourceQuality:observedQuality});
    stats.dataHealth=dataHealth;
    const reasonSet=new Set(dataHealth.reasons);
    const outdated=reasonSet.has("SOURCE_CHECK_TOO_OLD")||
     reasonSet.has("LAST_CLOSED_CANDLE_STALE")||observedQuality==="STALE";
    const quality=dataHealth.researchReady?observedQuality:outdated?"STALE":"UNAVAILABLE";
    const mapped=stats.bars.map(({time,open,high,low,close})=>({time,open,high,low,close}));
    if(mapped.length){
     const priorVisible=fitted?chart.current?.timeScale().getVisibleLogicalRange():null;
     all.candle.setData(chartSeriesData(mapped,chartSettings.chartType));
     for(const key of ["ema20","ema50","ema200","vwap","rsi","macd","macdSignal",
       "atr","adx","plusDI","minusDI","stochK","stochD","bbUpper","bbBasis","bbLower",
       "donchianUpper","donchianLower"]){
       if(all[key])all[key].setData(stats.overlays[key]||[]);
      }
      all.histogram?.setData(stats.overlays.macdHistogram.map(p=>({...p,color:p.value>=0?"#339a9a":"#b66c84"})));
      all.volume?.setData(stats.overlays.volume);
      all.volumeMA?.setData(stats.overlays.volumeMA);
      if(priorVisible&&Number.isFinite(priorVisible.from)&&Number.isFinite(priorVisible.to))
       chart.current?.timeScale().setVisibleLogicalRange(priorVisible);
      if(!fitted){
      const last=mapped.length-1;
      chart.current?.timeScale().setVisibleLogicalRange({from:Math.max(0,last-69),to:last+5});
      fitted=true;
     }
    }
    failures=0;
    lastSuccessAt=Date.now();
    lastClosedAt=stats.lastClosed?.time?stats.lastClosed.time*1000:null;
    setFeed({phase:local?"historical":quality==="STALE"?"stale":quality==="CURRENT"?"ready":"empty",
     message:local?"Imported historical OHLC · device only · no broker connection":
      mapped.length?(quality==="CURRENT"?"Read-only candles · "+data.delivery:
       "Closed-bar/source verification unavailable; indicators not current"):"No candles returned",
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
   }finally{if(requestTimeout)clearTimeout(requestTimeout);
    inFlight=false;
    if(running&&!local)schedule();}
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
  // Clear only when switching symbols or timeframes. A manual refresh retains
  // the last verified plotted bars, prominently flagged as not current, while
  // analytical stats are invalidated until fresh data is verified.
  const retained=feed.sourceSymbol===symbol&&feed.sourceResolution===resolution&&!!feed.last;
  if(!retained)for(const key of Object.keys(all))all[key]?.setData([]);
  refresh();
  return ()=>{running=false;document.removeEventListener("visibilitychange",onVisible);
   abort?.abort();if(timer)clearTimeout(timer);};
 },[symbol,resolution,libReady,active,chartSettings.chartType,chartSettings.refreshProfile,offline,refreshNonce,indicatorSettings]);
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
     const reported=Date.parse(data.asOf);
     if(!Number.isFinite(reported))throw Error("Invalid auxiliary source observation time");
     const structured=computeFive(data.bars,tf,reported,data.volumeBasis,indicatorSettings);
     const quality=quoteState(structured.lastClosed,Date.now(),tf);
     const health=inspectCandleQuality({bars:structured.bars,overlays:structured.overlays,
      resolution:tf,asOf:reported,now:Date.now(),sourceQuality:quality});
     if(!health.researchReady||quality!=="CURRENT")throw Error("Unverified or stale "+tf+" candles");
     const structure=detectStructure(structured.bars,tf,reported);
     if(running)setAuxData(old=>({...old,[key]:{structure,loadedAt:reported,
      scalpStats:tf==="15m"?structured:null}}));
    }catch(err){
     if(running&&err.name!=="AbortError")
      setAuxData(old=>({...old,[key]:{error:"Market data unavailable for "+tf}}));
    }
   }));
   if(running)timer=setTimeout(load,65000);
  }
  load();
  return ()=>{running=false;if(timer)clearTimeout(timer);controllers.forEach(c=>c.abort());};
 },[symbol,resolution,active,libReady,extraKey,offline,refreshNonce,indicatorSettings]);
 useEffect(()=>{
  const overlay=drawings.current;
  if(!libReady||!overlay)return;
  if(!feed.stats){
   overlay.marker.setMarkers([]);
   markerItems.current=[];
   overlay.primitive.setAnnotations([],null);
   setOverlayMessage("");
   if(selected)onStructureRef.current?.({summaries:[],annotations:[],unavailable:[{concept:"Market data",resolution,reason:"Awaiting verified candles"}]});
   return;
  }
  let localStructure;
  try{
   const at=Date.parse(feed.asOf);
   if(!Number.isFinite(at))throw Error("Invalid source observation timestamp");
   localStructure=detectStructure(feed.stats.bars,resolution,at);
  }catch{
   overlay.marker.setMarkers([]);
   markerItems.current=[];
   overlay.primitive.setAnnotations([],null);
   setOverlayMessage("Structure source unavailable; chart candles retained");
   if(selected)onStructureRef.current?.({summaries:[],annotations:[],
    unavailable:[{concept:"Market structure",resolution,reason:"Invalid or incomplete candle timing"}]});
   return;
  }
  const byResolution={[resolution]:{structure:localStructure}};
  for(const tf of extraRes){
   const stored=auxData[symbol+"|"+tf];
   if(stored)byResolution[tf]=stored;
  }
  const display=feed.stats.bars;
  let result;
  try{result=assembleStructure(structureSettings,byResolution,resolution,display);}
  catch{
   overlay.marker.setMarkers([]);markerItems.current=[];
   overlay.primitive.setAnnotations([],null);
   setOverlayMessage("Market-structure projection unavailable; candles retained");
   return;
  }
  try{
   const closeTimes=new Set(display.filter(b=>b.closed).map(b=>b.time));
   const structures=chartSettings.markerStructure?
    toStructureMarkers(result.annotations).filter(m=>closeTimes.has(m.time)):[];
   const indicators=buildIndicatorMarkers(display,feed.stats.overlays,{
    mode:chartSettings.markerStyle,palette:chartSettings.markerPalette,
    enabled:{
     ADX:technicalEnabled.ADX&&chartSettings.markerADX,
     Bollinger:technicalEnabled.Bollinger&&chartSettings.markerBollinger,
     Donchian:technicalEnabled.Donchian&&chartSettings.markerDonchian,
     Stochastic:technicalEnabled.Stochastic&&chartSettings.markerStochastic
    }
   });
   const higher=auxData[symbol+"|15m"];
   const trusted=scalpActive&&feed.quality==="CURRENT"&&feed.stats?.dataHealth?.researchReady===true&&
    higher?.scalpStats&&Date.now()-higher.loadedAt<10*60000&&
    quoteState(higher.scalpStats.lastClosed,Date.now(),"15m")==="CURRENT";
   const candidate=trusted?evaluateScalpResearch(feed.stats,higher.scalpStats,strategyEdit):null;
   const stacked=stackChartMarkers(structures,indicators,{
    mode:chartSettings.markerStyle,expandedId:expandedMarkerId,strategy:candidate?.markers||[]});
   markerItems.current=stacked;
   overlay.marker.setMarkers(markerSeriesPayload(stacked));
   overlay.primitive.setAnnotations(
    chartSettings.markerStructure&&chartSettings.markerStyle!=="compact"?result.annotations:[],
    display.at(-1)?.time??null);
   setOverlayMessage(stacked.length+" stacked markers · "+result.unavailable.length+" unavailable structure timeframes");
  }catch{
   setOverlayMessage("Optional chart markers unavailable; candle feed remains read-only");
  }
  if(selected)onStructureRef.current?.(result);
 },[symbol,resolution,feed.stats,feed.asOf,structureSettings,auxData,libReady,selected,active,extraKey,
  technicalEnabled,chartSettings.markerStyle,chartSettings.markerPalette,
  chartSettings.markerStructure,chartSettings.markerADX,chartSettings.markerBollinger,
  chartSettings.markerDonchian,chartSettings.markerStochastic,expandedMarkerId,
  scalpActive,feed.quality,strategyEdit.adxMin,strategyEdit.stopAtr,
  strategyEdit.rewardRisk,strategyEdit.maxHoldBars]);
 // Causal algorithmic overlays consume only confirmed closed price history.
 useEffect(()=>{
  const all=series.current;if(!all||!libReady)return;
  const keys=["regLine","regUpper","regLower","atrUpper","atrLower"];
  if(!feed.stats){for(const key of keys)all[key]?.setData([]);return;}
  try{
   const out=computeChartAlgorithms(feed.stats.bars,{
    mode:chartSettings.algorithmMode,window:chartSettings.algorithmWindow,
    multiplier:chartSettings.algorithmMultiplier
   });
   for(const [name,key] of [["regression","regLine"],["regUpper","regUpper"],
    ["regLower","regLower"],["atrUpper","atrUpper"],["atrLower","atrLower"]])
    all[key]?.setData(out[name]);
  }catch{for(const key of keys)all[key]?.setData([]);}
 },[feed.stats,libReady,chartSettings.algorithmMode,chartSettings.algorithmWindow,
  chartSettings.algorithmMultiplier]);
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
  if(drawTool==="Move saved drawings"){
   const root=el.current,scale=chart.current?.timeScale(),price=series.current?.candle;
   if(!root||!scale||!price)return;
   const rect=root.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
   let best=null;
   for(const d of savedDrawings)for(let i=0;i<d.points.length;i++){
    const p=d.points[i],px=scale.timeToCoordinate(p.time),py=price.priceToCoordinate(p.price);
    if(px==null||py==null)continue;
    const distance=Math.hypot(px-x,py-y);
    if(distance<=18&&(!best||distance<best.distance))
     best={id:d.id,index:i,distance};
   }
   if(!best){setDrawingError("Drag within 18 pixels of a saved drawing anchor");return;}
   moving.current={...best,point:null};
   e.currentTarget.setPointerCapture(e.pointerId);
   setDrawingError("");return;
  }
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
  if(drawTool==="Move saved drawings"&&moving.current){
   const point=pointerPoint(e);if(!point)return;
   moving.current.point=point;
   const changed=savedDrawings.map(d=>d.id===moving.current.id?
    {...d,points:d.points.map((p,i)=>i===moving.current.index?point:p)}:d);
   drawings.current?.manualPrimitive?.setDrawings(changed);
   return;
  }
  if(drawTool!=="Freehand drawing"||!interaction.current.stroke.length)return;
  const point=pointerPoint(e);
  if(point&&interaction.current.stroke.length<600){
   const stroke=interaction.current.stroke;
   if(stroke.at(-1).time!==point.time||Math.abs(stroke.at(-1).price-point.price)>1e-7)stroke.push(point);
  }
 }
 function pointerUp(e){
  if(drawTool==="Move saved drawings"&&moving.current){
   const drag=moving.current;moving.current=null;
   if(drag.point)onDrawingMoveRef.current?.(drag.id,drag.index,drag.point);
   if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
   return;
  }
  if(drawTool!=="Freehand drawing"||!interaction.current.stroke.length)return;
  const stroke=interaction.current.stroke.slice();
  if(stroke.length>1)commitPoints(drawTool,stroke);
  interaction.current.stroke=[];
  setPendingCount(0);
  if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
 }
 function zoomChart(factor){
  const scale=chart.current?.timeScale();const range=scale?.getVisibleLogicalRange();
  if(!range)return;
  const width=range.to-range.from,next=Math.max(8,Math.min(800,width*factor));
  try{scale.setVisibleLogicalRange({from:(range.from+range.to-next)/2,
   to:(range.from+range.to+next)/2});setZoomStatus("Zoom adjusted");}
  catch{setZoomStatus("Zoom unavailable");}
 }
 const stats=feed.stats;const ready=feed.phase==="ready";
 const health=feedHealth({...feed,now:clock||Date.now()});
 const untilClose=Math.ceil((FX_RESOLUTIONS[resolution]*1000-clock%(FX_RESOLUTIONS[resolution]*1000))/1000);
 const countdown=clock===0?"--:--":String(Math.floor(untilClose/60)).padStart(2,"0")+":"+String(untilClose%60).padStart(2,"0");
 return <article className={styles.engineCard+(selected?" "+styles.chartActive:"")} aria-label={symbol+" live forex chart"}>
  <div className={styles.engineTop}>
   <div><strong className={styles.engineSymbol}>{symbol.slice(0,3)}/{symbol.slice(3)}</strong>
    <small>TradeLocker · read-only {compact?"":"· forming candles shown when supplied"}</small>
    <span className={styles.provenanceTag} data-state={health.state} data-current={health.isLive}
     role="status" aria-label={symbol+" data status"}
     title="Source status for this chart. An unlocked feed session alone does not verify candle freshness.">{health.label}</span></div>
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
  <div className={styles.chartZoomTools} role="toolbar" aria-label={symbol+" chart navigation"}>
   <button type="button" onClick={()=>zoomChart(0.8)} aria-label={symbol+" Zoom in"}>＋ Zoom</button>
   <button type="button" onClick={()=>zoomChart(1.25)} aria-label={symbol+" Zoom out"}>− Zoom</button>
   <button type="button" onClick={()=>{chart.current?.timeScale().fitContent();setZoomStatus("Fit all");}}>Fit</button>
   <button type="button" onClick={()=>{chart.current?.timeScale().scrollToRealTime();setZoomStatus("Latest candle");}}>Latest</button>
   <button type="button" aria-pressed={chartSettings.scale==="log"}
    onClick={()=>onChartSettingChange?.("scale",chartSettings.scale==="log"?"normal":"log")}>
    {chartSettings.scale==="log"?"Log ✓":"Log scale"}</button>
   <label>Algorithm <select aria-label={symbol+" chart algorithm"} value={chartSettings.algorithmMode}
    onChange={e=>onChartSettingChange?.("algorithmMode",e.target.value)}>
    <option value="off">Off</option><option value="regression">Regression channel</option>
    <option value="atrBands">ATR bands</option><option value="both">Both</option>
   </select></label>
   {zoomStatus?<small role="status">{zoomStatus}</small>:null}
  </div>
  <details className={styles.chartQuickStudies}>
   <summary>Live Chart · Indicators & Markers</summary>
   <div className={styles.chartQuickSections}>
    <fieldset><legend>Technical indicators · shared</legend>
     <div className={styles.chartQuickActions}>
      <button type="button" onClick={()=>Object.keys(DEFAULT_TECH).forEach(id=>onTechnicalChange?.(id,true))}>Apply all</button>
      <button type="button" onClick={()=>Object.keys(DEFAULT_TECH).forEach(id=>onTechnicalChange?.(id,false))}>Hide all</button>
     </div><div className={styles.chartQuickChecks}>
      {Object.keys(DEFAULT_TECH).map(id=><label key={id}>
       <input type="checkbox" checked={!!technicalEnabled[id]}
        onChange={e=>onTechnicalChange?.(id,e.target.checked)}/>{id}</label>)}
     </div>
    </fieldset>
    <fieldset><legend>Marker sources · this chart</legend>
     <div className={styles.chartQuickActions}>
      <button type="button" onClick={()=>["markerStructure","markerADX","markerBollinger","markerDonchian","markerStochastic"].forEach(key=>onChartSettingChange?.(key,true))}>Apply all</button>
      <button type="button" onClick={()=>["markerStructure","markerADX","markerBollinger","markerDonchian","markerStochastic"].forEach(key=>onChartSettingChange?.(key,false))}>Hide all</button>
      <select aria-label={symbol+" marker display"} value={chartSettings.markerStyle}
       onChange={e=>onChartSettingChange?.("markerStyle",e.target.value)}>
       <option value="compact">Stacked dots</option><option value="full">Shapes</option><option value="off">Off</option>
      </select></div><div className={styles.chartQuickChecks}>
      {["markerStructure","markerADX","markerBollinger","markerDonchian","markerStochastic"].map(key=>
       <label key={key}><input type="checkbox" checked={!!chartSettings[key]}
        onChange={e=>onChartSettingChange?.(key,e.target.checked)}/>{key.slice(6)}</label>)}
     </div>
    </fieldset>
    <fieldset><legend>Market structure · shared</legend>
     <div className={styles.chartQuickActions}>
      <button type="button" onClick={()=>STRUCTURE_CONCEPTS.forEach(x=>onStructureChange?.(x.id,true))}>Apply all</button>
      <button type="button" onClick={()=>STRUCTURE_CONCEPTS.forEach(x=>onStructureChange?.(x.id,false))}>Hide all</button>
     </div><div className={styles.chartQuickChecks}>
      {STRUCTURE_CONCEPTS.map(x=><label key={x.id}><input type="checkbox"
       checked={!!structureSettings[x.id]?.enabled}
       onChange={e=>onStructureChange?.(x.id,e.target.checked)}/>{x.label}</label>)}
     </div>
    </fieldset>
    <fieldset><legend>Patterns · shared</legend>
     <div className={styles.chartQuickActions}>
      <button type="button" onClick={()=>{onPatternsEnabled?.(true);TOOL_CATALOG.Patterns.forEach(x=>onPatternChange?.(x,true));}}>Apply all</button>
      <button type="button" onClick={()=>{onPatternsEnabled?.(false);TOOL_CATALOG.Patterns.forEach(x=>onPatternChange?.(x,false));}}>Hide all</button>
     </div>
     <label><input type="checkbox" checked={autoPatterns}
      onChange={e=>onPatternsEnabled?.(e.target.checked)}/>Auto-detection</label>
     <div className={styles.chartQuickChecks}>
      {TOOL_CATALOG.Patterns.map(x=><label key={x}><input type="checkbox"
       checked={patternEnabled[x]!==false} onChange={e=>onPatternChange?.(x,e.target.checked)}/>{x}</label>)}
     </div>
    </fieldset>
    <fieldset><legend>Algorithms & motion</legend>
     <label>Lookback <select aria-label={symbol+" algorithm lookback"} value={chartSettings.algorithmWindow}
      onChange={e=>onChartSettingChange?.("algorithmWindow",Number(e.target.value))}>
      {[20,50,100].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
     <label>Band multiplier <select aria-label={symbol+" algorithm multiplier"} value={chartSettings.algorithmMultiplier}
      onChange={e=>onChartSettingChange?.("algorithmMultiplier",Number(e.target.value))}>
      {[1,1.5,2,3].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
     <label><input type="checkbox" checked={chartSettings.kineticScroll}
      onChange={e=>onChartSettingChange?.("kineticScroll",e.target.checked)}/>Smooth inertial scroll</label>
    </fieldset>
   </div>
   <small>Closed-bar chart research only. Click a stacked dot to toggle its label.</small>
  </details>
  {scalpActive?<div className={styles.chartMarkerDetail} role="status">
   EUR/USD 5m pullback research · 15m EMA confirmation · ATR stop {strategyEdit.stopAtr??1.2}× ·
   target {strategyEdit.rewardRisk??1.5}R · exits are hypothetical, not fills.
   {auxData[symbol+"|15m"]?.error?" Higher-timeframe source unavailable.":""}
  </div>:null}
  <div className={styles.engineDrawingCaption}>
   <span>{chartSettings.chartType}{chartSettings.chartType==="Heikin Ashi"?" · transformed prices (not broker executions)":""}</span>
   <span>Indicators · {chartSettings.markerStyle==="compact"?"non-overlapping dots":chartSettings.markerStyle==="full"?"color symbols":"markers hidden"} · read-only</span>
   {chartSettings.candleTimer?<span role="timer">Candle boundary in {countdown} · local-clock estimate</span>:null}
  </div>
  <div className={styles.engineDrawHost}>
   {health.warning?<div className={styles.feedOverlayWarning} role="status">
    <strong>{health.label}</strong>
    <span>{health.verifiedAt?"Last successful check: "+new Date(health.verifiedAt).toLocaleTimeString()+
     " · displayed candles are not current":
     "Live data verification unavailable. Do not interpret displayed prices as current."}</span>
    {!feed.last?<span>Use Import OHLC JSON for historical research, or check read-only feed access above.</span>:null}
   </div>:null}
   <div className={styles.engineCanvas} ref={el} style={{height:compact?460:620}}
    aria-label={chartSettings.chartType+" market chart"}/>
   {drawTool&&!TOOL_CATALOG.Fibonacci.includes(drawTool)?<div className={styles.engineDrawCapture} role="application"
    aria-label={"Drawing tool "+drawTool} title={"Click chart points for "+drawTool}
    onPointerDown={pointerDown} onPointerMove={pointerMove}
    onPointerUp={pointerUp} onPointerCancel={pointerUp}/>:null}
  </div>
  {expandedMarkerId&&markerItems.current.some(x=>x.id===expandedMarkerId)?
   <div className={styles.chartMarkerDetail} role="status">
    <strong>Marker label: </strong>{markerItems.current.find(x=>x.id===expandedMarkerId)?.label}
    <button type="button" onClick={()=>setExpandedMarkerId("")}>Hide label</button>
   </div>:null}
  {drawTool?<div className={styles.engineDrawStatus} role="status">
   Drawing: {drawTool} · {drawTool==="Move saved drawings"?"Drag a saved endpoint to reposition it":TOOL_CATALOG.Fibonacci.includes(drawTool)?"Automatically anchored to confirmed swings":drawTool==="Freehand drawing"?"Drag on chart":"Select "+requiredClicks(drawTool)+" chart point(s)"}
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
    {stats.bars.length} source candles · O {feed.last.open.toFixed(5)} · H {feed.last.high.toFixed(5)} · L {feed.last.low.toFixed(5)} · C {feed.last.close.toFixed(5)}
   </span>:null}
   {stats?.dataHealth?<span className={styles.feedDiagnostics} aria-label="Closed-candle data integrity">
    {stats.dataHealth.label} · {stats.dataHealth.closedBars} closed bars
    {stats.dataHealth.recentGaps?" · "+stats.dataHealth.recentGaps+" recent gaps (market closures possible)":""}
    {" · EMA200 "+(stats.dataHealth.indicatorStatus.ema200?"ready":"warming")}
    {" · RSI "+(stats.dataHealth.indicatorStatus.rsi14?"ready":"warming")}
    {" · MACD "+(stats.dataHealth.indicatorStatus.macd?"ready":"warming")}
    {" · VWAP "+(stats.dataHealth.indicatorStatus.vwap?"ready":"unavailable")}
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
