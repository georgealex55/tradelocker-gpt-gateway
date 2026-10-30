"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {SHELL_UI_KEY,DEFAULT_SHELL_UI,normalizeShellUI} from "../../lib/xmiWorkspaceState.mjs";
import {workspaceShortcut} from "../../lib/xmiWorkspaceUX.mjs";
import styles from "./xmi.module.css";
import XMIEngineDesk from "./XMIEngineDesk";
import XMITickerNews from "./XMITickerNews";
import XMIStrategyEngine from "./XMIStrategyEngine";
import XMIAccountSettings from "./XMIAccountSettings";
import XMIReadOnlyFeedAccess from "./XMIReadOnlyFeedAccess";
import {STRATEGIES} from "../../lib/xmiStrategyPresets.mjs";
import {EDITS_KEY,normalizeStrategyEdit,sanitizeStrategyEdits,strategyExplanation} from "../../lib/xmiStrategyEdits.mjs";
import XMICoachPanel from "./XMICoachPanel";
import XMIHistoricalReplay from "./XMIHistoricalReplay";
import {parseInstrument} from "../../lib/xmiLiveMath.mjs";
const TABS=[
 {id:"live",title:"Live Chart",sub:"Candles & indicators"},
 {id:"research",title:"News & Research",sub:"Timestamped evidence"},
 {id:"strategy",title:"Strategy Lab",sub:"Rules & versions"},
 {id:"journal",title:"Trading Journal",sub:"Private records"},
 {id:"admin",title:"Admin",sub:"System & access"}
];
export default function XMIWorkstation(){
 const [tab,setTab]=useState("live");
 const [focusMode,setFocusMode]=useState(false);
 const [selected,setSelected]=useState("FX:EURUSD");
 const [openCloud,setOpenCloud]=useState(false);
 const [showBanner,setShowBanner]=useState(true),[showTabs,setShowTabs]=useState(true);
 const [shellLoaded,setShellLoaded]=useState(false);
 const [density,setDensity]=useState(DEFAULT_SHELL_UI.density),[shortcuts,setShortcuts]=useState(false);
 const [notice,setNotice]=useState("");
 const viewMenu=useRef(null);
 const [collapsed,setCollapsed]=useState({...DEFAULT_SHELL_UI.collapsed});
 const [maximized,setMaximized]=useState({...DEFAULT_SHELL_UI.maximized});
 const [strategyId,setStrategyId]=useState("day"),[workspaceDraft,setWorkspaceDraft]=useState("");
 const [restoreWorkspace,setRestoreWorkspace]=useState(null),[remotePatterns,setRemotePatterns]=useState(null),[remoteChartUI,setRemoteChartUI]=useState(null),[engineView,setEngineView]=useState(null);
 const [strategyEdits,setStrategyEdits]=useState({}),[editsLoaded,setEditsLoaded]=useState(false);
 const onRestore=useCallback(prefs=>{
  if(typeof prefs.workspace==="string")setRestoreWorkspace(prefs.workspace);
  if(prefs.chartUI&&typeof prefs.chartUI==="object")setRemoteChartUI(prefs.chartUI);
  if(prefs.strategyEdits&&typeof prefs.strategyEdits==="object")setStrategyEdits(sanitizeStrategyEdits(prefs.strategyEdits));
  if(STRATEGIES.some(s=>s.id===prefs.strategyId))setStrategyId(prefs.strategyId);
  if(prefs.layout&&typeof prefs.layout==="object"){
   if(typeof prefs.layout.showBanner==="boolean")setShowBanner(prefs.layout.showBanner);
   if(typeof prefs.layout.showTabs==="boolean")setShowTabs(prefs.layout.showTabs);
  }
  if(prefs.workspaceUI&&typeof prefs.workspaceUI==="object"){
   const ui=normalizeShellUI(prefs.workspaceUI);
   setTab(ui.tab);setCollapsed(ui.collapsed);setMaximized(ui.maximized);
   setShowBanner(ui.showBanner);setShowTabs(ui.showTabs);
   setDensity(ui.density);setShortcuts(ui.shortcuts);
  }
  if(prefs.pins&&typeof prefs.pins==="object")try{localStorage.setItem("xmi-news-pins-v1",JSON.stringify(prefs.pins));}catch{}
  if(prefs.patterns&&typeof prefs.patterns==="object"){setRemotePatterns(prefs.patterns);
   try{localStorage.setItem("xmi-pattern-types-v1",JSON.stringify(prefs.patterns));}catch{}}
  window.dispatchEvent(new Event("xmi:preferences-restored"));
 },[]);
 useEffect(()=>{try{setStrategyEdits(sanitizeStrategyEdits(JSON.parse(localStorage.getItem(EDITS_KEY)||"{}")));}catch{}
  setEditsLoaded(true);
 },[]);
 useEffect(()=>{if(editsLoaded)try{localStorage.setItem(EDITS_KEY,JSON.stringify(strategyEdits));}catch{}},[editsLoaded,strategyEdits]);
 useEffect(()=>{
  let legacy={};try{legacy=JSON.parse(localStorage.getItem("xmi-layout-ui-v2")||"{}");}catch{}
  let recent={};try{recent=JSON.parse(localStorage.getItem(SHELL_UI_KEY)||"{}");}catch{}
  const ui=normalizeShellUI(recent,legacy);
  setTab(ui.tab);setShowBanner(ui.showBanner);setShowTabs(ui.showTabs);
  setCollapsed(ui.collapsed);setMaximized(ui.maximized);
  setDensity(ui.density);setShortcuts(ui.shortcuts);
  if(STRATEGIES.some(x=>x.id===legacy.strategyId))setStrategyId(legacy.strategyId);
  setShellLoaded(true);
 },[]);
 useEffect(()=>{
  if(!shellLoaded)return;
  try{localStorage.setItem(SHELL_UI_KEY,JSON.stringify(normalizeShellUI({
   tab,showBanner,showTabs,collapsed,maximized,density,shortcuts
  })));}catch{}
 },[shellLoaded,tab,showBanner,showTabs,collapsed,maximized,density,shortcuts]);
 useEffect(()=>{
  if(!notice)return;
  const timer=setTimeout(()=>setNotice(""),6000);
  return ()=>clearTimeout(timer);
 },[notice]);
 useEffect(()=>{
  if(!shortcuts)return;
  const navigate=event=>{
   const next=workspaceShortcut(event);
   if(next){event.preventDefault();setTab(next);viewMenu.current?.removeAttribute("open");}
  };
  window.addEventListener("keydown",navigate);
  return ()=>window.removeEventListener("keydown",navigate);
 },[shortcuts]);
 useEffect(()=>{
  const dismiss=event=>{
   if(event.key!=="Escape"||event.defaultPrevented||event.isComposing)return;
   // Let focused forms, native select menus and account/feed controls keep Escape.
   if(event.target?.closest?.("input,textarea,select,[contenteditable='true']"))return;
   if(viewMenu.current?.open){viewMenu.current.open=false;viewMenu.current.querySelector("summary")?.focus();return;}
   if(maximized[tab]){setMaximized(old=>({...old,[tab]:false}));return;}
   if(focusMode)setFocusMode(false);
  };
  window.addEventListener("keydown",dismiss);
  return ()=>window.removeEventListener("keydown",dismiss);
 },[tab,maximized,focusMode]);
 useEffect(()=>{
  if(!shellLoaded)return;
  try{localStorage.setItem("xmi-layout-ui-v2",JSON.stringify({showBanner,showTabs,strategyId}));}catch{}
 },[shellLoaded,showBanner,showTabs,strategyId]);
 useEffect(()=>{
  const u=new URLSearchParams(window.location.search);
  if(u.has("code")||u.has("error")){setTab("journal");setOpenCloud(true);}
 },[]);
 const item=parseInstrument(selected);
 const selectedEdit=normalizeStrategyEdit(strategyId,strategyEdits[strategyId]);
 const detail=strategyExplanation(strategyId,selectedEdit);
 function editField(name,value){setStrategyEdits(old=>({...old,[strategyId]:normalizeStrategyEdit(strategyId,{...old[strategyId],[name]:value})}));}
 function toggleCollapsed(id){setCollapsed(old=>({...old,[id]:!old[id]}));}
 function toggleMaximized(id){
  if(!maximized[id])setCollapsed(old=>({...old,[id]:false}));
  setMaximized(old=>({...old,[id]:!old[id]}));
 }
 function resetView(){
  setCollapsed({...DEFAULT_SHELL_UI.collapsed});setMaximized({...DEFAULT_SHELL_UI.maximized});
  setShowBanner(true);setShowTabs(true);setFocusMode(false);
  setNotice("Workspace view restored. Chart settings, watchlists, research and journal records are retained.");
 }
 function workspaceControls(id){
  const title=TABS.find(t=>t.id===id)?.title||id;
  return <div className={styles.workspaceControls} role="toolbar" aria-label={title+" workspace controls"}>
   <strong>{title}</strong>
   <select aria-label="Workspace selector" className={!maximized[id]&&showTabs?styles.secondarySelector:""} value={tab} onChange={e=>setTab(e.target.value)}>
    {TABS.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}
   </select>
   <button type="button" onClick={()=>toggleCollapsed(id)}
    title="Hide this workspace's contents while retaining its state"
    aria-expanded={!collapsed[id]} aria-label={(collapsed[id]?"Expand ":"Collapse ")+title+" workspace"}>
    {collapsed[id]?"Expand":"Collapse"}
   </button>
   <button type="button" onClick={()=>toggleMaximized(id)}
    title={maximized[id]?"Restore workspace size · Escape":"Use the full viewport for this workspace"}
    aria-pressed={maximized[id]} aria-label={(maximized[id]?"Restore ":"Maximize ")+title+" workspace"}>
    {maximized[id]?"Restore":"Maximize"}
   </button>
  </div>;
 }
 const uiBackup=normalizeShellUI({tab,showBanner,showTabs,collapsed,maximized,density,shortcuts});
 return <main data-xmi-root="true" data-density={density} className={styles.shell+" "+(tab==="live"?styles.studioShell:"")+
   (tab==="live"&&focusMode?" "+styles.studioFocus:"")}>
  <div className={styles.layoutSwitch} role="toolbar" aria-label="XMI layout and account controls">
   <a href="/" aria-label="Gateway home" className={styles.terminalIdentity}><b>XMI <small>2.0</small></b><span>RESEARCH ONLY</span></a>
   <details ref={viewMenu} className={styles.viewMenu}>
    <summary>View & shortcuts</summary>
    <section aria-label="Workspace view options" className={styles.viewOptions}>
     <strong>Workspace view</strong>
     <fieldset><legend>Display density</legend>
      {["compact","comfortable"].map(value=><label key={value}><input type="radio" name="xmi-density"
       value={value} checked={density===value} onChange={()=>setDensity(value)}/>{value==="compact"?"Compact":"Comfortable"}</label>)}
     </fieldset>
     <div className={styles.viewActions}>
      <button type="button" aria-pressed={showBanner} onClick={()=>{setShowBanner(v=>!v);viewMenu.current.open=false;}}>{showBanner?"Hide top banner":"Show top banner"}</button>
      <button type="button" aria-pressed={showTabs} onClick={()=>{setShowTabs(v=>!v);viewMenu.current.open=false;}}>{showTabs?"Hide tabs":"Show tabs"}</button>
     </div>
     <label className={styles.shortcutToggle}><input type="checkbox" checked={shortcuts}
      onChange={e=>setShortcuts(e.target.checked)}/>Enable workspace keyboard shortcuts</label>
     <p><kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>1–5</kbd> switches workspaces in navigation order. Shortcuts pause while typing.</p>
     <p><kbd>Esc</kbd> restores a maximized workspace or exits chart focus. The workspace selector remains available when maximized.</p>
     <button type="button" onClick={resetView}>Reset workspace view</button>
     <small>Restores workspace visibility and size. Keeps chart configuration, watchlists, research and private journal records.</small>
    </section>
   </details>
   {!showTabs?<select aria-label="Switch XMI workspace" value={tab} onChange={e=>setTab(e.target.value)}>
    {TABS.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}
   </select>:null}
   <XMIReadOnlyFeedAccess/>
   <XMIAccountSettings workspace={workspaceDraft} strategyId={strategyId} strategyEdits={strategyEdits} workspaceUI={uiBackup} layout={{showBanner,showTabs}} onRestore={onRestore}/>
  </div>
  {showBanner?<header className={styles.header}>
   <div>
    <a className={styles.back} href="/">Gateway home</a>
    <div className={styles.brandRow}>
     <span className={styles.brandMark} aria-hidden="true">X</span>
     <div><p className={styles.eyebrow}>XMI TERMINAL 2.0 / RESEARCH ONLY</p>
      <h1>Market intelligence terminal</h1></div>
    </div>
    <p className={styles.subtitle}>Read-only FX candles (authorization required), five indicators, news and journal research.</p>
   </div>
   <span className={styles.pill}>RESEARCH ONLY · NO ORDERS</span>
  </header>:null}
  {showTabs?<nav className={styles.mainNavigation} aria-label="XMI workspaces">
   {TABS.map((t,index)=><button key={t.id} type="button" onClick={()=>setTab(t.id)}
     title={shortcuts?t.title+" · Alt + Shift + "+(index+1):t.title+" · "+t.sub}
     aria-current={tab===t.id?"page":undefined} className={tab===t.id?styles.mainNavActive:""}>
     <strong>{t.title}</strong><small>{t.sub}</small>
   </button>)}
  </nav>:null}
  <div hidden={tab!=="live"} className={styles.workspaceShell+(maximized.live?" "+styles.workspaceMaximized:"")}>
  {workspaceControls("live")}
  <div hidden={collapsed.live}><XMIEngineDesk selected={selected} onSelected={setSelected}
    onResearch={()=>setTab("research")} active={tab==="live"&&!collapsed.live}
    focusMode={focusMode} onFocusMode={()=>setFocusMode(v=>!v)}
    strategyId={strategyId} onStrategyChange={setStrategyId}
    onResearchModel={setEngineView} onWorkspaceChange={setWorkspaceDraft}
    remoteWorkspace={restoreWorkspace} remotePatterns={remotePatterns} remoteChartUI={remoteChartUI} strategyEdits={strategyEdits}/></div></div>
  <div hidden={tab!=="research"} className={styles.nonChartWorkspace+" "+styles.workspaceShell+(maximized.research?" "+styles.workspaceMaximized:"")}>
   {workspaceControls("research")}
   <div hidden={collapsed.research}>
   <div className={styles.workspaceHeading}><div><p className={styles.eyebrow}>NEWS & RESEARCH</p>
    <h2>Ticker news search</h2><p className={styles.muted}>Select a symbol for the latest available XMI headlines and cautious context flags.</p></div></div>
   <XMITickerNews ticker={selected} active={tab==="research"&&!collapsed.research}/>
   </div>
  </div>
  <div hidden={tab!=="strategy"} className={styles.nonChartWorkspace+" "+styles.workspaceShell+(maximized.strategy?" "+styles.workspaceMaximized:"")}>
   {workspaceControls("strategy")}
   <div hidden={collapsed.strategy}>
   <div className={styles.workspaceHeading}><div><p className={styles.eyebrow}>STRATEGY LAB · RESEARCH ONLY</p>
    <h2>Strategy presets & 9-cell engine</h2>
    <p className={styles.muted}>Choose a research strategy, inspect its chart alignment, and edit local indicator thresholds and preset timeframe.</p></div></div>
   <div className={styles.strategyLabLayout}>
    <section className={styles.strategyLabOverview}>
     <p className={styles.eyebrow}>ACTIVE STRATEGY</p><h3>{detail.preset.name}</h3>
     <p>{detail.summary}</p>
     <p className={styles.muted}>{detail.preset.description}</p>
     <p><a href="/xmi2/chart-studio.html" className={styles.historyStudioLink}>Historical Chart Studio · Import Only</a></p>
    </section>
    <aside className={styles.strategyLabRail} aria-label="Strategy lab engine and preset selector">
     <XMIStrategyEngine strategyId={strategyId} report={engineView?.model}
      symbol={engineView?.symbol||item.symbol} resolution={engineView?.resolution||selectedEdit.timeframe}
      compact showSnapshot={false}/>
     <div className={styles.strategyScroll} role="group" aria-label="Choose a strategy preset">
      {STRATEGIES.map(preset=><button type="button" key={preset.id}
       aria-pressed={strategyId===preset.id} onClick={()=>setStrategyId(preset.id)}>
       <strong>{preset.name}</strong><small>{preset.type} · {normalizeStrategyEdit(preset.id,strategyEdits[preset.id]).timeframe}</small>
      </button>)}
     </div>
    </aside>
    <section className={styles.strategyLabEditor} aria-label="Strategy explanation and editor">
     <h3>Strategy explanation & editable research settings</h3>
     <p>{detail.summary}</p><p><strong>Indicators:</strong> {detail.preset.indicators.join(", ")}</p>
     <p><strong>Inputs:</strong> {detail.data}</p><p><strong>Research conditions:</strong> {detail.conditions}</p>
     <p><strong>Limitations:</strong> {detail.risk}</p>
     <div className={styles.strategyEditFields}>
      <label>Suggested chart timeframe
       <select aria-label="Edit strategy timeframe" value={selectedEdit.timeframe} onChange={e=>editField("timeframe",e.target.value)}>
        {["1m","5m","15m","30m","1H","4H","1D"].map(v=><option key={v} value={v}>{v}</option>)}
       </select></label>
      <label>RSI positive threshold
       <input aria-label="RSI positive threshold" type="number" min="50" max="75" value={selectedEdit.rsiBull}
        disabled={detail.preset.unscored} onChange={e=>editField("rsiBull",Number(e.target.value))}/></label>
      <label>RSI negative threshold
       <input aria-label="RSI negative threshold" type="number" min="25" max="50" value={selectedEdit.rsiBear}
        disabled={detail.preset.unscored} onChange={e=>editField("rsiBear",Number(e.target.value))}/></label>
      <label className={styles.strategyEditCheck}><input type="checkbox" checked={selectedEdit.requireMacd}
       disabled={detail.preset.unscored} onChange={e=>editField("requireMacd",e.target.checked)}/>Require MACD availability</label>
      <label className={styles.strategyEditCheck}><input type="checkbox" checked={selectedEdit.requireVwap}
       disabled={detail.preset.unscored} onChange={e=>editField("requireVwap",e.target.checked)}/>Require VWAP availability & alignment</label>
      <label className={styles.strategyEditNotes}>Research notes (local only)
       <textarea aria-label="Strategy research notes" maxLength={600} rows={3} value={selectedEdit.notes}
        onChange={e=>editField("notes",e.target.value)} placeholder="Add your observations and review notes…"/></label>
     </div>
     <div className={styles.strategyEditActions}>
      <button type="button" onClick={()=>setStrategyEdits(old=>{const next={...old};delete next[strategyId];return next;})}>Reset selected preset edits</button>
      <small>Edits save locally in this browser and can be included with encrypted local account settings. They change descriptive research only; not orders or validated trade signals.</small>
     </div>
    </section>
   </div>
   <XMIHistoricalReplay symbol={item.symbol} resolution={selectedEdit.timeframe}
    strategyId={strategyId} edit={selectedEdit}/>
   </div>
  </div>
  <div hidden={tab!=="journal"} className={styles.nonChartWorkspace+" "+styles.workspaceShell+(maximized.journal?" "+styles.workspaceMaximized:"")}>
   {workspaceControls("journal")}
   <div hidden={collapsed.journal}>
    <div className={styles.workspaceHeading}><div><p className={styles.eyebrow}>PERSONAL RECORDS</p>
     <h2>Trading Journal</h2>
     <p className={styles.muted}>Existing manual records, imports, exports, metrics, and optional private cloud actions are preserved.</p>
    </div></div>
    <XMICoachPanel ticker={item.key} openCloud={openCloud}/>
   </div>
  </div>
  <div hidden={tab!=="admin"} className={styles.nonChartWorkspace+" "+styles.workspaceShell+(maximized.admin?" "+styles.workspaceMaximized:"")}>
   {workspaceControls("admin")}
   <div hidden={collapsed.admin}>
   <div className={styles.workspaceHeading}><div><p className={styles.eyebrow}>ADMINISTRATION</p>
    <h2>System & access overview</h2>
    <p className={styles.muted}>Read-only configuration guidance. Account controls remain in the top toolbar.</p></div></div>
   <div className={styles.adminGrid}><section className={styles.infoCard}><h3>Workspace storage</h3>
    <p>Chart preferences and workspace layouts are saved in this browser. Encrypted device-local backups require explicit Save settings in the account control. Trading Journal data remains separate.</p>
   </section>
   <section className={styles.infoCard}><h3>Strategy administration</h3>
    <p>Research preset edits, saved versions, historical replay, comparisons and report verification are available in Strategy Lab. These remain descriptive research; the original XMI rules remain unscored.</p>
   </section>
   <section className={styles.infoCard}><h3>Market-data configuration</h3>
    <p>Read-only broker candle polling requires an explicitly enabled feed and a valid feed-session authorization. The market-data
      adapter uses only TradeLocker's historical bar INFO route. Stock/ETF live streaming and background monitoring
      require separately reviewed data-source configuration.</p>
   </section></div>
   </div>
  </div>
  {notice?<div className={styles.viewNotice} role="status"><span>{notice}</span><button type="button" aria-label="Dismiss layout notification" onClick={()=>setNotice("")}>×</button></div>:null}
  <footer className={styles.footer}>
   The main chart uses TradingView Lightweight Charts with TradingView attribution. TradeLocker forex candles
   are queried through a separately authorized read-only adapter; missing data is never replaced with synthetic prices.
   Indicator values are informational, strategy confirmation is disabled until a strategy is validated, and
   no XMI screen calls broker order execution.
   <p><a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">Charting by TradingView</a></p>
  </footer>
 </main>;
}
