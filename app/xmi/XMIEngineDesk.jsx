"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {CHART_UI_KEY,normalizeChartUI} from "../../lib/xmiWorkspaceState.mjs";
import styles from "./xmi.module.css";
import XMILiveChart from "./XMILiveChart";
import XMIChartErrorBoundary from "./XMIChartErrorBoundary";
import XMIToolbox from "./XMIToolbox";
import XMITickerNews from "./XMITickerNews";
import XMIScreenSnapshot from "./XMIScreenSnapshot";
import XMIStrategyEngine from "./XMIStrategyEngine";
import {STRATEGIES,strategyById,evaluateStrategy} from "../../lib/xmiStrategyPresets.mjs";
import {normalizeStrategyEdit} from "../../lib/xmiStrategyEdits.mjs";
import {TOOL_CATALOG} from "../../lib/xmiChartTools.mjs";
import {parseInstrument} from "../../lib/xmiLiveMath.mjs";
import {normalizeWatchlistCollections,createWatchlistCollection,renameWatchlistCollection,
 removeWatchlistCollection,updateActiveWatchlistSymbols,MAX_WATCHLIST_COLLECTIONS}
 from "../../lib/xmiWatchlistCollections.mjs";
import {defaultStructureSettings,STRUCTURE_CONCEPTS} from "../../lib/xmiStructure.mjs";
import {DEFAULT_CHART_SETTINGS,DEFAULT_TECH,resolveChartSettings,
 validateDrawings,serializeWorkspace,deserializeWorkspace,drawingsForSymbol,samePatternEvents} from "../../lib/xmiChartTools.mjs";
const START=["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","NASDAQ:AAPL","AMEX:SPY"];
const DEFAULT=START.map(parseInstrument),KEY="xmi-chart-workbench-v1";
export default function XMIEngineDesk({selected,onSelected,onResearch,active=true,focusMode=false,onFocusMode,strategyId="day",onStrategyChange,onResearchModel,onWorkspaceChange,remoteWorkspace,remotePatterns,remoteChartUI,strategyEdits={}}){
 const root=useRef(null),counter=useRef(0),presetHydrated=useRef(false);
 const [collections,setCollections]=useState(()=>normalizeWatchlistCollections(null,null,DEFAULT.map(x=>x.key)));
 const [watchInput,setWatchInput]=useState(""),[newListName,setNewListName]=useState(""),[error,setError]=useState("");
 const activeCollection=collections.lists.find(x=>x.id===collections.activeId);
 const watchlist=activeCollection.symbols.map(parseInstrument);
 const [layout,setLayout]=useState(1),[focus,setFocus]=useState(0);
 const [watchOpen,setWatchOpen]=useState(true),[watchVisible,setWatchVisible]=useState(true);
 const [leftView,setLeftView]=useState("watchlist");
 const [intelOpen,setIntelOpen]=useState(true),[intelVisible,setIntelVisible]=useState(true);
 const [activePanel,setActivePanel]=useState(null),[orientation,setOrientation]=useState("vertical");
 const [docked,setDocked]=useState(false),[pinned,setPinned]=useState(false);
 const [structure,setStructure]=useState(defaultStructureSettings);
 const [tech,setTech]=useState({...DEFAULT_TECH});
 const [globalSettings,setGlobalSettings]=useState({...DEFAULT_CHART_SETTINGS});
 const [chartOverride,setChartOverride]=useState({});
 const [drawTool,setDrawTool]=useState(null),[savedDrawings,setSavedDrawings]=useState([]);
 const [loaded,setLoaded]=useState(false),[autoPatterns,setAutoPatterns]=useState(true),[autoFib,setAutoFib]=useState(false);
 const [patternEnabled,setPatternEnabled]=useState(()=>Object.fromEntries(TOOL_CATALOG.Patterns.map(x=>[x,true])));
 const [strategyReports,setStrategyReports]=useState({});
 const edit=normalizeStrategyEdit(strategyId,strategyEdits[strategyId]);
 const [observations,setObservations]=useState({}),[patterns,setPatterns]=useState({});
 const [maximized,setMaximized]=useState(false),[browserFullscreen,setBrowserFullscreen]=useState(false);
 const [chartKeys,setChartKeys]=useState(()=>[DEFAULT[0].key,DEFAULT[1].key,DEFAULT[2].key,DEFAULT[3].key]);
 const [resolutions,setResolutions]=useState(["5m","15m","1H","1D"]);
 // Keep derived chart inputs referentially stable across intelligence feedback renders.
 // Otherwise each drawings array allocation retriggers pattern effects -> setPatterns -> render.
 const chartDrawingMap=useMemo(()=>Object.fromEntries(
  [...new Set(chartKeys.map(key=>parseInstrument(key).symbol))]
   .map(symbol=>[symbol,drawingsForSymbol(savedDrawings,symbol)])
 ),[chartKeys,savedDrawings]);
 const chartSettingsBySlot=useMemo(()=>[0,1,2,3].map(
  slot=>resolveChartSettings(globalSettings,chartOverride,slot)
 ),[globalSettings,chartOverride]);
 useEffect(()=>{
  try{
   const raw=window.localStorage.getItem(KEY);
   if(raw){const data=deserializeWorkspace(raw);setSavedDrawings(data.drawings);
    setGlobalSettings(data.settings);setChartOverride(data.overrides);setTech(data.technical);}
  }catch{ /* Private browsing / older schema: fail closed to default settings. */ }
  try{const value=JSON.parse(window.localStorage.getItem("xmi-pattern-types-v1")||"null");if(value&&typeof value==="object"&&Object.keys(value).every(k=>TOOL_CATALOG.Patterns.includes(k)))setPatternEnabled(value);}catch{}
  try{
   const raw=window.localStorage.getItem(CHART_UI_KEY);
   if(raw){
    const ui=normalizeChartUI(JSON.parse(raw));
    setCollections(normalizeWatchlistCollections(ui.watchlists,ui.activeWatchlistId,ui.watchlist));setChartKeys(ui.chartKeys);
    setResolutions(ui.resolutions);setLayout(ui.layout);setFocus(ui.focus);
    setWatchOpen(ui.watchOpen);setWatchVisible(ui.watchVisible);
    setIntelOpen(ui.intelOpen);setIntelVisible(ui.intelVisible);
    setLeftView(ui.leftView);setOrientation(ui.orientation);
    setAutoPatterns(ui.autoPatterns);setAutoFib(ui.autoFib);
    setMaximized(ui.maximized);onSelected?.(ui.chartKeys[ui.focus]);
   }
  }catch{setError("Saved chart layout could not be restored. Using safe defaults.");}
  setLoaded(true);
 },[]);
 useEffect(()=>{
  if(!loaded)return;
  try{
   const ui=normalizeChartUI({watchlist:activeCollection.symbols,
    watchlists:collections.lists,activeWatchlistId:collections.activeId,chartKeys,resolutions,
    layout,focus,watchOpen,watchVisible,intelOpen,intelVisible,leftView,orientation,
    autoPatterns,autoFib,maximized});
   window.localStorage.setItem(CHART_UI_KEY,JSON.stringify(ui));
  }catch{setError("Chart layout could not be saved in this browser.");}
 },[loaded,collections,chartKeys,resolutions,layout,focus,watchOpen,watchVisible,
    intelOpen,intelVisible,leftView,orientation,autoPatterns,autoFib,maximized]);
 useEffect(()=>{
  if(!loaded)return;
  try{window.localStorage.setItem(KEY,serializeWorkspace(savedDrawings,globalSettings,tech,chartOverride));}
  catch{setError("Local drawing storage unavailable. Export JSON to retain this session.");}
 },[loaded,savedDrawings,globalSettings,tech,chartOverride]);
 useEffect(()=>{if(loaded)onWorkspaceChange?.(serializeWorkspace(savedDrawings,globalSettings,tech,chartOverride));},
  [loaded,savedDrawings,globalSettings,tech,chartOverride,onWorkspaceChange]);
 useEffect(()=>{
  if(!remoteChartUI||!loaded)return;
  try{
   const ui=normalizeChartUI(remoteChartUI);
   setCollections(normalizeWatchlistCollections(ui.watchlists,ui.activeWatchlistId,ui.watchlist));setChartKeys(ui.chartKeys);
   setResolutions(ui.resolutions);setLayout(ui.layout);setFocus(ui.focus);
   setWatchOpen(ui.watchOpen);setWatchVisible(ui.watchVisible);
   setIntelOpen(ui.intelOpen);setIntelVisible(ui.intelVisible);
   setLeftView(ui.leftView);setOrientation(ui.orientation);
   setAutoPatterns(ui.autoPatterns);setAutoFib(ui.autoFib);
   setMaximized(ui.maximized);onSelected?.(ui.chartKeys[ui.focus]);
  }catch{setError("Encrypted chart layout restore rejected. Current layout retained.");}
 },[remoteChartUI,loaded,onSelected]);
 useEffect(()=>{if(remotePatterns&&typeof remotePatterns==="object")
  setPatternEnabled(Object.fromEntries(TOOL_CATALOG.Patterns.map(name=>[name,remotePatterns[name]!==false])));},[remotePatterns]);
 useEffect(()=>{if(!remoteWorkspace)return;try{
  const record=deserializeWorkspace(remoteWorkspace);
  setSavedDrawings(record.drawings);setGlobalSettings(record.settings);
  setChartOverride(record.overrides);setTech(record.technical);
 }catch{setError("Saved account workspace is invalid; local settings retained.");}},[remoteWorkspace]);
 useEffect(()=>{
  if(!loaded)return;
  if(!presetHydrated.current){presetHydrated.current=true;return;}
  const preset=strategyById(strategyId);
  if(!preset||preset.unscored)return;
  setResolutions(old=>old.map((r,i)=>i===focus?edit.timeframe:r));
  setTech(Object.fromEntries(Object.keys(DEFAULT_TECH).map(k=>[k,preset.indicators.includes(k)])));
  setGlobalSettings(old=>({...old,chartType:"Candlesticks",indicatorDefaults:true,candleTimer:true}));
  setChartOverride(old=>{
   if(!old[focus])return old;
   const current={...old[focus]};
   delete current.chartType;
   delete current.indicatorDefaults;
   delete current.candleTimer;
   return {...old,[focus]:current};
  });
 },[loaded,strategyId,edit.timeframe]);
 useEffect(()=>{if(loaded)try{window.localStorage.setItem("xmi-pattern-types-v1",JSON.stringify(patternEnabled));}catch{}},[loaded,patternEnabled]);
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
   setCollections(updateActiveWatchlistSymbols(collections,[...activeCollection.symbols,item.key]));
   setWatchInput("");setError("");choose(item.key);
  }catch(e){setError(e.message);}
 }
 function remove(key){
  const next=watchlist.filter(x=>x.key!==key);
  if(!next.length){setError("Keep at least one instrument.");return;}
  try{setCollections(updateActiveWatchlistSymbols(collections,next.map(x=>x.key)));
   setError("");setChartKeys(old=>old.map(x=>x===key?next[0].key:x));
   if(selected===key)onSelected(next[0].key);
  }catch(e){setError(e.message);}
 }
 function selectWatchlist(id){
  const list=collections.lists.find(x=>x.id===id);
  if(!list)return;
  setCollections(old=>({...old,activeId:id}));
  setNewListName("");setError("");choose(list.symbols[0]);
 }
 function createNewWatchlist(){
  try{
   const id="list-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,7);
   const next=createWatchlistCollection(collections,{id,name:newListName,symbol:current.key});
   setCollections(next);setNewListName("");setError("");
  }catch(e){setError(e.message);}
 }
 function renameCurrentWatchlist(){
  try{setCollections(renameWatchlistCollection(collections,newListName));
   setNewListName("");setError("");
  }catch(e){setError(e.message);}
 }
 function deleteCurrentWatchlist(){
  if(!window.confirm("Delete watchlist "+activeCollection.name+"? The instruments and chart drawings are not deleted."))return;
  try{
   const next=removeWatchlistCollection(collections);
   setCollections(next);choose(next.lists[0].symbols[0]);setNewListName("");setError("");
  }catch(e){setError(e.message);}
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
 const activeReport=strategyReports[focus+"|"+current.key+"|"+resolutions[focus]];
 const strategyResult=useMemo(()=>evaluateStrategy(strategyId,activeReport?.stats,activeReport?.quality,edit),
  [strategyId,activeReport?.stats,activeReport?.quality,edit.rsiBull,edit.rsiBear,edit.requireMacd,edit.requireVwap]);
 const strategyInfo=strategyById(strategyId);
 const count=STRUCTURE_CONCEPTS.filter(x=>structure[x.id].enabled).length;
 useEffect(()=>{onResearchModel?.({model:strategyResult,symbol:current.symbol,resolution:resolutions[focus],
  patternCount:patternReport.length,structureCount:count});},
  [onResearchModel,strategyResult,current.symbol,resolutions[focus],patternReport.length,count]);
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
   {showLeft?<aside className={styles.liveWatch+" "+styles.studioWatch} aria-label="Market sidebar">
    <div className={styles.liveSideTitle}><strong>Market watchlist</strong>
     <button type="button" className={styles.studioHide} onClick={()=>setWatchVisible(false)}>Hide</button>
    </div>
    <div className={styles.leftRailTabs} role="group" aria-label="Left market sidebar">
     {[["watchlist","Watchlist"],["snapshot","Snapshot"],["news","News / Research"]].map(([key,label])=>
      <button type="button" key={key} aria-pressed={leftView===key} onClick={()=>setLeftView(key)}>{label}</button>)}
    </div>
    {leftView==="watchlist"?<>
     <div className={styles.liveSideTitle}><strong>Watchlist</strong>
      <div className={styles.sideTitleActions}><span>{watchlist.length}/10 · {collections.lists.length}/6 lists</span>
       <button type="button" aria-expanded={watchOpen} onClick={()=>setWatchOpen(x=>!x)}>
        {watchOpen?"Collapse":"Expand"}</button></div>
     </div>
     {watchOpen?<><div className={styles.watchCollectionControls} role="group" aria-label="Named watchlists">
       <select aria-label="Active watchlist" value={collections.activeId} onChange={e=>selectWatchlist(e.target.value)}>
        {collections.lists.map(list=><option key={list.id} value={list.id}>{list.name}</option>)}
       </select>
       <input aria-label="New or renamed watchlist name" placeholder="List name (1–32 chars)"
        maxLength={32} value={newListName} onChange={e=>setNewListName(e.target.value)}/>
       <div>
        <button type="button" onClick={createNewWatchlist} disabled={collections.lists.length>=MAX_WATCHLIST_COLLECTIONS}>New</button>
        <button type="button" onClick={renameCurrentWatchlist}>Rename</button>
        <button type="button" onClick={deleteCurrentWatchlist} disabled={collections.lists.length===1}>Delete</button>
       </div>
      </div><p className={styles.sideHint}>Select a ticker to focus the chart</p>
      <div className={styles.watchRows} role="list">
       {watchlist.map(item=><div key={item.key} role="listitem" className={styles.watchRow+
        (item.key===current.key?" "+styles.watchActive:"")}>
        <button type="button" className={styles.watchSelect} aria-pressed={item.key===current.key} onClick={()=>choose(item.key)}>
         <strong>{item.label}</strong><small>{item.asset==="forex"?"FX · read-only":"Equity feed pending"}</small></button>
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
    </>:leftView==="snapshot"?
     <XMIScreenSnapshot strategyId={strategyId} report={strategyResult} symbol={current.symbol}
      resolution={resolutions[focus]} patternCount={patternReport.length} structureCount={count}/>:
     <><XMITickerNews ticker={current.key} watchlist={watchlist} active={active&&leftView==="news"} compact/>
      <button type="button" className={styles.newsJump} onClick={onResearch}>Open full news feed</button></>}
   </aside>:null}
   <section className={styles.studioCenter}>
    <XMIToolbox activePanel={activePanel} setActivePanel={setActivePanel}
     orientation={orientation} setOrientation={setOrientation}
     docked={docked} setDocked={setDocked} pinned={pinned} setPinned={setPinned}
     tech={tech} setTech={setTech} structure={structure} setStructure={setStructure}
     strategyId={strategyId} onStrategyChange={onStrategyChange}
     drawTool={drawTool} setDrawTool={setDrawTool} autoPatterns={autoPatterns}
     setAutoPatterns={setAutoPatterns} patternEnabled={patternEnabled} setPatternEnabled={setPatternEnabled}
     autoFib={autoFib} setAutoFib={setAutoFib}
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
        {item.asset==="forex"?<XMIChartErrorBoundary key={key+"|"+resolutions[index]}>
         <XMILiveChart symbol={item.symbol} resolution={resolutions[index]}
         onResolution={v=>setResolution(index,v)}
         selected={index===focus} onFocus={()=>{setFocus(index);onSelected(key);}}
         structureSettings={structure} technicalEnabled={tech} strategyName={strategyInfo?.name||"No preset"}
         chartSettings={chartSettingsBySlot[index]}
         drawTool={index===focus?drawTool:null} onDrawing={d=>onChartDrawing(item.symbol,d)}
         savedDrawings={chartDrawingMap[item.symbol]}
         autoPatterns={autoPatterns} autoFib={autoFib} patternEnabled={patternEnabled}
         onAnalysis={result=>setStrategyReports(old=>{
          const id=index+"|"+key+"|"+resolutions[index];
          if(old[id]?.stats===result.stats&&old[id]?.quality===result.quality)return old;
          return {...old,[id]:result};
         })}
         onPatterns={result=>setPatterns(old=>{
          const id=index+"|"+key+"|"+resolutions[index];
          return samePatternEvents(old[id],result)?old:{...old,[id]:result};
         })}
         onStructure={result=>setObservations(old=>({...old,[index+"|"+key+"|"+resolutions[index]]:result}))}
         compact={layout>1} active={active}/>
         </XMIChartErrorBoundary>:
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
     <details className={styles.intelDetails} open>
      <summary>Strategy engine · {strategyResult.state}</summary>
      <XMIStrategyEngine strategyId={strategyId} report={strategyResult} symbol={current.symbol}
       resolution={resolutions[focus]} showSnapshot={false}/>
      <label className={styles.strategyPick}>Research preset
       <select aria-label="Choose live strategy" value={strategyId} onChange={e=>onStrategyChange?.(e.target.value)}>
        {STRATEGIES.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
       </select>
      </label>
     </details>
     <details className={styles.intelDetails} open>
      <summary>Market structure · {count} enabled</summary>
      <div className={styles.structureResults}>
       {current.asset!=="forex"?<p className={styles.watchFoot}>Equity candles unavailable.</p>:
       report?.summaries?.length?report.summaries.slice(0,5).map(({concept,resolution,event})=>
        <div className={styles.structureFinding} key={concept+"|"+resolution}>
         <strong>{concept} <span>{resolution}</span></strong><p>{event.summary}</p>
         <small>Confirmed {new Date(event.confirmedAt*1000).toLocaleString()}</small>
        </div>):<p className={styles.watchFoot}>No confirmed structure in the available candle set.</p>}
      </div>
     </details>
     <details className={styles.intelDetails}>
      <summary>Automatic chart patterns · {autoPatterns?patternReport.length+" observations":"off"}</summary>
      {autoPatterns?patternReport.slice(0,5).map(p=><div key={p.id} className={styles.structureFinding}>
       <strong>{p.concept}</strong><p>{p.summary}</p><small>Confirmed after candle close</small>
      </div>):<p className={styles.watchFoot}>Detection disabled in Indicators.</p>}
     </details>
     <p className={styles.watchFoot}>Automatic patterns, Fibonacci levels and manual drawings are analytical only. No execution, actual fills or order placement.</p>
    </>:null}
    <button type="button" className={styles.studioHide} onClick={()=>setIntelVisible(false)}>Hide intelligence panel</button>
   </aside>:null}
  </div>
  {error?<p role="alert" className={styles.studioError}>{error}</p>:null}
  <footer className={styles.studioFooter}>XMI 2.0 · Chart drawings are stored locally · no broker execution</footer>
 </div>;
}
