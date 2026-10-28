"use client";
import {useEffect,useRef,useState} from "react";
import styles from "./xmi.module.css";
import XMILiveChart from "./XMILiveChart";
import XMIToolbox from "./XMIToolbox";
import {parseInstrument,validateWatchlist} from "../../lib/xmiLiveMath.mjs";
import {defaultStructureSettings,STRUCTURE_CONCEPTS} from "../../lib/xmiStructure.mjs";
import {DEFAULT_CHART_SETTINGS,DEFAULT_TECH,resolveChartSettings,
 validateDrawings,serializeWorkspace,deserializeWorkspace,drawingsForSymbol} from "../../lib/xmiChartTools.mjs";
const START=["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","NASDAQ:AAPL","AMEX:SPY"];
const DEFAULT=START.map(parseInstrument),KEY="xmi-chart-workbench-v1";
export default function XMIEngineDesk({selected,onSelected,onResearch,active=true,focusMode=false,onFocusMode}){
 const root=useRef(null),counter=useRef(0);
 const [watchlist,setWatchlist]=useState(DEFAULT),[watchInput,setWatchInput]=useState(""),[error,setError]=useState("");
 const [layout,setLayout]=useState(1),[focus,setFocus]=useState(0);
 const [watchOpen,setWatchOpen]=useState(true),[watchVisible,setWatchVisible]=useState(true);
 const [intelOpen,setIntelOpen]=useState(true),[intelVisible,setIntelVisible]=useState(true);
 const [activePanel,setActivePanel]=useState(null),[orientation,setOrientation]=useState("vertical");
 const [docked,setDocked]=useState(false),[pinned,setPinned]=useState(false);
 const [structure,setStructure]=useState(defaultStructureSettings);
 const [tech,setTech]=useState({...DEFAULT_TECH});
 const [globalSettings,setGlobalSettings]=useState({...DEFAULT_CHART_SETTINGS});
 const [chartOverride,setChartOverride]=useState({});
 const [drawTool,setDrawTool]=useState(null),[savedDrawings,setSavedDrawings]=useState([]);
 const [loaded,setLoaded]=useState(false),[autoPatterns,setAutoPatterns]=useState(true),[autoFib,setAutoFib]=useState(false);
 const [observations,setObservations]=useState({}),[patterns,setPatterns]=useState({});
 const [maximized,setMaximized]=useState(false),[browserFullscreen,setBrowserFullscreen]=useState(false);
 const [chartKeys,setChartKeys]=useState(()=>[DEFAULT[0].key,DEFAULT[1].key,DEFAULT[2].key,DEFAULT[3].key]);
 const [resolutions,setResolutions]=useState(["5m","15m","1H","1D"]);
 useEffect(()=>{
  try{
   const raw=window.localStorage.getItem(KEY);
   if(raw){const data=deserializeWorkspace(raw);setSavedDrawings(data.drawings);
    setGlobalSettings(data.settings);setChartOverride(data.overrides);setTech(data.technical);}
  }catch{ /* Private browsing / older schema: fail closed to default settings. */ }
  setLoaded(true);
 },[]);
 useEffect(()=>{
  if(!loaded)return;
  try{window.localStorage.setItem(KEY,serializeWorkspace(savedDrawings,globalSettings,tech,chartOverride));}
  catch{setError("Local drawing storage unavailable. Export JSON to retain this session.");}
 },[loaded,savedDrawings,globalSettings,tech,chartOverride]);
 useEffect(()=>{
  const change=()=>setBrowserFullscreen(document.fullscreenElement===root.current);
  document.addEventListener("fullscreenchange",change);
  return ()=>document.removeEventListener("fullscreenchange",change);
 },[]);
 function choose(key){onSelected(key);setChartKeys(old=>old.map((x,i)=>i===focus?key:x));}
 function add(event){
  event.preventDefault();
  try{
   const item=parseInstrument(watchInput);
   if(watchlist.some(x=>x.key===item.key))throw Error("Already in the watchlist");
   setWatchlist(validateWatchlist([...watchlist.map(x=>x.key),item.key]));
   setWatchInput("");setError("");choose(item.key);
  }catch(e){setError(e.message);}
 }
 function remove(key){
  const next=watchlist.filter(x=>x.key!==key);
  if(!next.length){setError("Keep at least one instrument.");return;}
  setWatchlist(next);setChartKeys(old=>old.map(x=>x===key?next[0].key:x));
  if(selected===key)onSelected(next[0].key);
 }
 function changeLayout(num){setLayout(num);if(focus>=num){setFocus(0);onSelected(chartKeys[0]);}}
 function setResolution(slot,value){
  setResolutions(old=>old.map((r,i)=>i===slot||globalSettings.syncTimeframes?value:r));
 }
 function onChartDrawing(symbol,drawing){
  counter.current++;
  try{
   const next=validateDrawings([...savedDrawings,{...drawing,
    id:Date.now().toString(36)+"-"+counter.current.toString(36),symbol}]);
   setSavedDrawings(next);setError("");return true;
  }catch(e){setError(e.message);return false;}
 }
 function undo(){
  const current=parseInstrument(chartKeys[focus]);
  setSavedDrawings(old=>{
   const index=old.map(x=>x.symbol).lastIndexOf(current.symbol);
   return index<0?old:old.filter((_,i)=>i!==index);
  });
 }
 function clear(){
  const current=parseInstrument(chartKeys[focus]);
  if(window.confirm("Delete saved drawings for "+current.label+"? This does not affect trades.")){
   setSavedDrawings(old=>old.filter(x=>x.symbol!==current.symbol));
  }
 }
 function exportJson(){
  const body=serializeWorkspace(savedDrawings,globalSettings,tech,chartOverride);
  const url=URL.createObjectURL(new Blob([body],{type:"application/json"}));
  const link=document.createElement("a");link.href=url;link.download="xmi-chart-drawings.json";
  link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 async function importJson(file){
  try{
   if(file.size>350000)throw Error("Import file too large");
   const parsed=deserializeWorkspace(await file.text());
   setSavedDrawings(parsed.drawings);setGlobalSettings(parsed.settings);
   setChartOverride(parsed.overrides);
   setTech(parsed.technical);setError("");setDrawTool(null);
  }catch(e){setError("Drawing import declined: "+e.message);}
 }
 async function toggleFullscreen(){
  try{
   if(document.fullscreenElement===root.current)await document.exitFullscreen();
   else await root.current?.requestFullscreen();
  }catch{setError("Browser fullscreen unavailable; use Maximize instead.");}
 }
 const current=parseInstrument(chartKeys[focus]),report=observations[focus+"|"+current.key+"|"+resolutions[focus]];
 const patternReport=patterns[focus+"|"+current.key+"|"+resolutions[focus]]||[];
 const count=STRUCTURE_CONCEPTS.filter(x=>structure[x.id].enabled).length;
 const showLeft=watchVisible&&!focusMode,showRight=intelVisible&&!focusMode;
 const deskClass=[styles.studioDesk,maximized?styles.studioMaximized:"",
  !showLeft?styles.studioNoLeft:"",!showRight?styles.studioNoRight:"",
  focusMode?styles.studioFocused:"",browserFullscreen?styles.studioBrowserFullscreen:""].join(" ");
 return <div ref={root} className={deskClass}>
  <header className={styles.studioCommand}>
   <div className={styles.studioCommandLeft}>
    <strong>XMI CHART STUDIO</strong><span>READ ONLY</span>
    <button type="button" onClick={()=>setWatchVisible(x=>!x)} aria-pressed={showLeft}>{showLeft?"Hide":"Show"} watchlist</button>
    <button type="button" onClick={()=>setIntelVisible(x=>!x)} aria-pressed={showRight}>{showRight?"Hide":"Show"} intelligence</button>
   </div>
   <div className={styles.studioCommandRight}>
    {[1,2,4].map(n=><button key={n} type="button" aria-pressed={layout===n} onClick={()=>changeLayout(n)}>{n} chart{n>1?"s":""}</button>)}
    {focusMode?<button type="button" onClick={onFocusMode}>Restore panels</button>:null}
   </div>
  </header>
  <div className={styles.studioBody}>
   {showLeft?<aside className={styles.liveWatch+" "+styles.studioWatch}>
    <div className={styles.liveSideTitle}><strong>Market watchlist</strong>
     <div className={styles.sideTitleActions}><span>{watchlist.length}/10</span>
      <button type="button" aria-expanded={watchOpen} onClick={()=>setWatchOpen(x=>!x)}>
       {watchOpen?"Collapse":"Expand"}</button></div></div>
    {watchOpen?<><p className={styles.sideHint}>Five visible rows · scroll to browse</p>
     <div className={styles.watchRows} role="list">
      {watchlist.map(item=><div key={item.key} role="listitem" className={styles.watchRow+
       (item.key===current.key?" "+styles.watchActive:"")}>
       <button type="button" className={styles.watchSelect} aria-pressed={item.key===current.key} onClick={()=>choose(item.key)}>
        <strong>{item.label}</strong><small>{item.asset==="forex"?"FX · TradeLocker":"Equity feed pending"}</small></button>
       <button type="button" className={styles.watchRemove} aria-label={"Remove "+item.label}
        onClick={()=>remove(item.key)}>×</button>
      </div>)}
     </div>
     <form onSubmit={add} className={styles.watchAdd}>
      <label htmlFor="studio-add-symbol">Add instrument</label>
      <input id="studio-add-symbol" value={watchInput} onChange={e=>setWatchInput(e.target.value)}
       maxLength={20} placeholder="EURJPY or NASDAQ:AAPL"/>
      <button type="submit" disabled={watchlist.length>=10}>Add symbol</button>
     </form></>:null}
    <button type="button" className={styles.studioHide} onClick={()=>setWatchVisible(false)}>Hide watchlist panel</button>
   </aside>:null}
   <section className={styles.studioCenter}>
    <XMIToolbox activePanel={activePanel} setActivePanel={setActivePanel}
     orientation={orientation} setOrientation={setOrientation}
     docked={docked} setDocked={setDocked} pinned={pinned} setPinned={setPinned}
     tech={tech} setTech={setTech} structure={structure} setStructure={setStructure}
     drawTool={drawTool} setDrawTool={setDrawTool} autoPatterns={autoPatterns}
     setAutoPatterns={setAutoPatterns} autoFib={autoFib} setAutoFib={setAutoFib}
     globalSettings={globalSettings} setGlobalSettings={setGlobalSettings}
     chartOverride={chartOverride} setChartOverride={setChartOverride} slot={focus}
     onUndo={undo} onClear={clear} onExport={exportJson} onImport={importJson}
     onFullscreen={toggleFullscreen} onMaximize={()=>setMaximized(x=>!x)}
     maximized={maximized} onFocusMode={onFocusMode} focusMode={focusMode}
     drawingsCount={savedDrawings.filter(x=>x.symbol===current.symbol).length}/>
    <div className={styles.studioChartArea+(activePanel&&docked?" "+styles.studioDockOpen:"")}>
     <div className={layout===1?styles.single:layout===2?styles.double:styles.quad}>
      {chartKeys.slice(0,layout).map((key,index)=>{
       const item=parseInstrument(key);
       return <div key={index} className={styles.liveChartItem}>
        {item.asset==="forex"?<XMILiveChart symbol={item.symbol} resolution={resolutions[index]}
         onResolution={v=>setResolution(index,v)}
         selected={index===focus} onFocus={()=>{setFocus(index);onSelected(key);}}
         structureSettings={structure} technicalEnabled={tech}
         chartSettings={resolveChartSettings(globalSettings,chartOverride,index)}
         drawTool={index===focus?drawTool:null} onDrawing={d=>onChartDrawing(item.symbol,d)}
         savedDrawings={drawingsForSymbol(savedDrawings,item.symbol)}
         autoPatterns={autoPatterns} autoFib={autoFib}
         onPatterns={result=>setPatterns(old=>({...old,[index+"|"+key+"|"+resolutions[index]]:result}))}
         onStructure={result=>setObservations(old=>({...old,[index+"|"+key+"|"+resolutions[index]]:result}))}
         compact={layout>1} active={active}/>:
         <div className={styles.feedMissing}><h3>{item.label}</h3><p>Stock/ETF feed pending; no synthetic candles.</p>
          <button type="button" onClick={()=>{setFocus(index);onSelected(key);}}>Focus research</button></div>}
       </div>;
      })}
     </div>
    </div>
   </section>
   {showRight?<aside className={styles.liveIntelligence+" "+styles.studioIntel} aria-label="Strategy intelligence">
    <div className={styles.liveSideTitle}><strong>Intelligence</strong>
     <div className={styles.sideTitleActions}><span>READ ONLY</span>
      <button type="button" aria-expanded={intelOpen} onClick={()=>setIntelOpen(v=>!v)}>{intelOpen?"Collapse":"Expand"}</button>
     </div></div>
    {intelOpen?<><h3>{current.label}</h3>
     <div className={styles.liveState}><span>Signal status</span><strong>NO ACTIVE STRATEGY</strong></div>
     <div className={styles.liveState}><span>Market structure</span><strong>{count} enabled</strong></div>
     <div className={styles.structureResults}>
      {current.asset!=="forex"?<p className={styles.watchFoot}>Equity candles unavailable.</p>:
       report?.summaries?.length?report.summaries.slice(0,5).map(({concept,resolution,event})=>
        <div className={styles.structureFinding} key={concept+"|"+resolution}>
         <strong>{concept} <span>{resolution}</span></strong><p>{event.summary}</p>
         <small>Confirmed {new Date(event.confirmedAt*1000).toLocaleString()}</small>
        </div>):<p className={styles.watchFoot}>No confirmed market structure found in available candles.</p>}
     </div>
     <div className={styles.liveState}><span>Automatic chart patterns</span>
      <strong>{autoPatterns?patternReport.length+" price-pattern observations":"Detection hidden"}</strong></div>
     {autoPatterns&&patternReport.slice(0,3).map(p=><div key={p.id} className={styles.structureFinding}>
      <strong>{p.concept}</strong><p>{p.summary}</p>
      <small>Observed after candle close</small></div>)}
     <div className={styles.liveState}><span>Economic context</span>
      <button type="button" onClick={onResearch} className={styles.newsJump}>News & Research</button></div>
     <p className={styles.watchFoot}>Automatic patterns, Fibonacci levels and manual drawings are analytical only. No execution, actual fills or order placement.</p>
    </>:null}
    <button type="button" className={styles.studioHide} onClick={()=>setIntelVisible(false)}>Hide intelligence panel</button>
   </aside>:null}
  </div>
  {error?<p role="alert" className={styles.studioError}>{error}</p>:null}
  <footer className={styles.studioFooter}>XMI 2.0 · Chart drawings are stored locally · no broker execution</footer>
 </div>;
}
