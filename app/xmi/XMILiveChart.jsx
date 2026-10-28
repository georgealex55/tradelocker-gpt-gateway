"use client";
import {useEffect,useRef,useState} from "react";
import {computeFive,FX_RESOLUTIONS,quoteState} from "../../lib/xmiLiveMath.mjs";
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
 autoPatterns=true,autoFib=false,onPatterns}){
 const el=useRef(null),chart=useRef(null),series=useRef(null),drawings=useRef(null);
 const interaction=useRef({points:[],stroke:[],count:0});
 const [pendingCount,setPendingCount]=useState(0);
 const [drawingError,setDrawingError]=useState("");
 const onPatternsRef=useRef(onPatterns);onPatternsRef.current=onPatterns;
 const onDrawingRef=useRef(onDrawing);onDrawingRef.current=onDrawing;
 const onStructureRef=useRef(onStructure);onStructureRef.current=onStructure;
 const [auxData,setAuxData]=useState({});
 const [overlayMessage,setOverlayMessage]=useState("");
 const extraRes=requiredStructureTimeframes(structureSettings,resolution);
 const extraKey=extraRes.join("|");
 const [feed,setFeed]=useState({phase:"loading",message:"Waiting for read-only forex data",last:null,stats:null,asOf:null});
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
   ema20:technicalEnabled.EMA,ema50:enabled.EMA,ema200:enabled.EMA,vwap:technicalEnabled.VWAP,
   rsi:technicalEnabled.RSI,macd:technicalEnabled.MACD,macdSignal:enabled.MACD,histogram:enabled.MACD,
   volume:technicalEnabled.Volume
  };
  for(const [key,on] of Object.entries(visible))all[key].applyOptions({visible:on});
 },[technicalEnabled,libReady]);
 useEffect(()=>{
  if(!libReady||!series.current||!active)return;
  let running=true,abort=null,timer=null;
  const all=series.current;
  let fitted=false;
  // No synthetic candles or broker-order requests. Refresh a bounded OHLC snapshot.
  async function refresh(){
   if(!running)return;
   if(document.visibilityState==="hidden"){timer=setTimeout(refresh,20000);return;}
   abort=new AbortController();
   try{
    const u="/api/xmi/live?"+new URLSearchParams({symbol,resolution});
    const res=await fetch(u,{cache:"no-store",signal:abort.signal});
    const data=await res.json();
    if(!res.ok||!data.ok)throw Error(data.error||"Broker candles unavailable");
    const stats=computeFive(data.bars,resolution,Date.parse(data.asOf),data.volumeBasis);
    if(!running)return;
    const mapped=stats.bars.map(({time,open,high,low,close})=>({time,open,high,low,close}));
    if(mapped.length){
     all.candle.setData(chartSeriesData(mapped,chartSettings.chartType));
     for(const key of ["ema20","ema50","ema200","vwap","rsi","macd","macdSignal"]){
      all[key].setData(stats.overlays[key]);
     }
     all.histogram.setData(stats.overlays.macdHistogram.map(p=>({...p,color:p.value>=0?"#339a9a":"#b66c84"})));
     all.volume.setData(stats.overlays.volume);
     if(!fitted){
      // Showing all 320 candles compresses them into an almost invisible strip.
      // Start on the last ~70 actual bars, preserving the user's pan/zoom thereafter.
      const last=mapped.length-1;
      chart.current?.timeScale().setVisibleLogicalRange({
       from:Math.max(0,last-69),to:last+5
      });
      fitted=true;
     }
    }
    const quality=quoteState(stats.lastClosed,Date.parse(data.asOf),resolution);
    setFeed({phase:quality==="STALE"?"stale":mapped.length?"ready":"empty",
     message:mapped.length?(quality==="CURRENT"?"Read-only candles · "+data.delivery:"Broker candles are not recent"):"No candles returned",
     stats,asOf:data.asOf,last:stats.latest,quality});
   }catch(e){if(!running||e.name==="AbortError")return;
    setFeed(prev=>({...prev,phase:"error",message:e.message,stats:null,last:null,quality:"UNAVAILABLE"}));
   }finally{if(running)timer=setTimeout(refresh,20000);}
  }
  setFeed({phase:"loading",message:"Loading verified broker candles…",last:null,stats:null,asOf:null});
  // Clear stale previous symbol history immediately.
  for(const key of Object.keys(all))all[key].setData([]);
  refresh();
  return ()=>{running=false;abort?.abort();if(timer)clearTimeout(timer);};
 },[symbol,resolution,libReady,active,chartSettings.chartType]);
 // Additional timeframes use the same protected, read-only candle API.
 // Each distinct selected timeframe is fetched once; settings are shared by all charts.
 useEffect(()=>{
  if(!active||!libReady||!extraKey)return;
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
 },[symbol,active,libReady,extraKey]);
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
 const stats=feed.stats;const ready=feed.phase==="ready";
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
   </div>
  </div>
  <div className={styles.indicatorControls} role="group" aria-label="Chart indicators">
   {FIVE_INDICATORS.map(name=><label key={name} title={name==="VWAP"?"Forex VWAP is a UTC-reset broker-tick-volume proxy.":undefined}>
    <input type="checkbox" checked={enabled[name]} onChange={e=>setEnabled(old=>({...old,[name]:e.target.checked}))}/>
    {title(name)}</label>)}
  </div>
  <div className={styles.engineCanvas} ref={el} style={{height:compact?460:620}} aria-label="Programmable candlestick chart"/>
  <div className={styles.engineFooter}>
   <span className={feed.phase==="ready"?styles.liveOk:styles.feedWarn}>
    {ready?"CANDLES RECEIVING":feed.phase==="loading"?"CONNECTING":feed.phase==="stale"?"STALE DATA":"NOT LIVE"}
   </span>
   <span role="status">{feed.message}</span>
   <span>{feed.last?(feed.last.closed?"Last bar closed":"Last bar forming")+" · "+new Date(feed.last.time*1000).toLocaleString():"No verified price"}</span>
   {stats?.bars?.length?<span className={styles.candleReadout}>
    {stats.bars.length} verified candles · O {feed.last.open.toFixed(5)} · H {feed.last.high.toFixed(5)} · L {feed.last.low.toFixed(5)} · C {feed.last.close.toFixed(5)}
   </span>:null}
   {overlayMessage?<span>{overlayMessage}</span>:null}
  </div>
  {stats?<div className={styles.engineNotes}>
    <span>{stats.volumeLabel}. {stats.vwapLabel}.</span>
    <span>Indicators may use a forming candle. Confirmed signals require an activated strategy and a closed candle.</span>
   </div>:null}
  <div className={styles.engineSignal}>
   <strong>Strategy monitor</strong><span>NO ACTIVE STRATEGY</span>
   <small>Indicator plots are informational. No confirmed entry, stop or target is invented.</small>
  </div>
 </article>;
}
