"use client";
import {useCallback,useEffect,useState} from "react";
import styles from "./xmi.module.css";
import XMIEngineDesk from "./XMIEngineDesk";
import XMITickerNews from "./XMITickerNews";
import XMIStrategyEngine from "./XMIStrategyEngine";
import XMIAccountSettings from "./XMIAccountSettings";
import XMIReadOnlyFeedAccess from "./XMIReadOnlyFeedAccess";
import {STRATEGIES} from "../../lib/xmiStrategyPresets.mjs";
import {EDITS_KEY,normalizeStrategyEdit,sanitizeStrategyEdits,strategyExplanation} from "../../lib/xmiStrategyEdits.mjs";
import XMICoachPanel from "./XMICoachPanel";
import {parseInstrument} from "../../lib/xmiLiveMath.mjs";
const TABS=[
 {id:"live",title:"Live Chart",sub:"Candles & indicators"},
 {id:"research",title:"News & Research",sub:"Timestamped evidence"},
 {id:"strategy",title:"Strategy Lab",sub:"Rules & versions"},
 {id:"admin",title:"Admin",sub:"Journal & account"}
];
export default function XMIWorkstation(){
 const [tab,setTab]=useState("live");
 const [focusMode,setFocusMode]=useState(false);
 const [selected,setSelected]=useState("FX:EURUSD");
 const [openCloud,setOpenCloud]=useState(false);
 const [showBanner,setShowBanner]=useState(true),[showTabs,setShowTabs]=useState(true);
 const [strategyId,setStrategyId]=useState("day"),[workspaceDraft,setWorkspaceDraft]=useState("");
 const [restoreWorkspace,setRestoreWorkspace]=useState(null),[remotePatterns,setRemotePatterns]=useState(null),[engineView,setEngineView]=useState(null);
 const [strategyEdits,setStrategyEdits]=useState({}),[editsLoaded,setEditsLoaded]=useState(false);
 const onRestore=useCallback(prefs=>{
  if(typeof prefs.workspace==="string")setRestoreWorkspace(prefs.workspace);
  if(prefs.strategyEdits&&typeof prefs.strategyEdits==="object")setStrategyEdits(sanitizeStrategyEdits(prefs.strategyEdits));
  if(STRATEGIES.some(s=>s.id===prefs.strategyId))setStrategyId(prefs.strategyId);
  if(prefs.layout&&typeof prefs.layout==="object"){
   if(typeof prefs.layout.showBanner==="boolean")setShowBanner(prefs.layout.showBanner);
   if(typeof prefs.layout.showTabs==="boolean")setShowTabs(prefs.layout.showTabs);
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
 useEffect(()=>{try{const old=JSON.parse(localStorage.getItem("xmi-layout-ui-v2")||"{}");
  if(typeof old.showBanner==="boolean")setShowBanner(old.showBanner);
  if(typeof old.showTabs==="boolean")setShowTabs(old.showTabs);
  if(STRATEGIES.some(x=>x.id===old.strategyId))setStrategyId(old.strategyId);
 }catch{}},[]);
 useEffect(()=>{try{localStorage.setItem("xmi-layout-ui-v2",JSON.stringify({showBanner,showTabs,strategyId}));}catch{}},[showBanner,showTabs,strategyId]);
 useEffect(()=>{
  const u=new URLSearchParams(window.location.search);
  if(u.has("code")||u.has("error")){setTab("admin");setOpenCloud(true);}
 },[]);
 const item=parseInstrument(selected);
 const selectedEdit=normalizeStrategyEdit(strategyId,strategyEdits[strategyId]);
 const detail=strategyExplanation(strategyId,selectedEdit);
 function editField(name,value){setStrategyEdits(old=>({...old,[strategyId]:normalizeStrategyEdit(strategyId,{...old[strategyId],[name]:value})}));}
 return <main data-xmi-root="true" className={styles.shell+" "+(tab==="live"?styles.studioShell:"")+
   (tab==="live"&&focusMode?" "+styles.studioFocus:"")}>
  <div className={styles.layoutSwitch} role="toolbar" aria-label="XMI layout and account controls">
   <button type="button" aria-pressed={showBanner} onClick={()=>setShowBanner(v=>!v)}>{showBanner?"Hide top banner":"Show top banner"}</button>
   <button type="button" aria-pressed={showTabs} onClick={()=>setShowTabs(v=>!v)}>{showTabs?"Hide tabs":"Show tabs"}</button>
   {!showTabs?<select aria-label="Switch XMI workspace" value={tab} onChange={e=>setTab(e.target.value)}>
    {TABS.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}
   </select>:null}
   <XMIReadOnlyFeedAccess/>
   <XMIAccountSettings workspace={workspaceDraft} strategyId={strategyId} strategyEdits={strategyEdits} layout={{showBanner,showTabs}} onRestore={onRestore}/>
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
   {TABS.map(t=><button key={t.id} type="button" onClick={()=>setTab(t.id)}
     aria-current={tab===t.id?"page":undefined} className={tab===t.id?styles.mainNavActive:""}>
     <strong>{t.title}</strong><small>{t.sub}</small>
   </button>)}
  </nav>:null}
  <div hidden={tab!=="live"}><XMIEngineDesk selected={selected} onSelected={setSelected}
    onResearch={()=>setTab("research")} active={tab==="live"}
    focusMode={focusMode} onFocusMode={()=>setFocusMode(v=>!v)}
    strategyId={strategyId} onStrategyChange={setStrategyId}
    onResearchModel={setEngineView} onWorkspaceChange={setWorkspaceDraft}
    remoteWorkspace={restoreWorkspace} remotePatterns={remotePatterns} strategyEdits={strategyEdits}/></div>
  <div hidden={tab!=="research"} className={styles.nonChartWorkspace}>
   <div className={styles.workspaceHeading}><div><p className={styles.eyebrow}>NEWS & RESEARCH</p>
    <h2>Ticker news search</h2><p className={styles.muted}>Select a symbol for the latest available XMI headlines and cautious context flags.</p></div></div>
   <XMITickerNews ticker={selected} active={tab==="research"}/>
  </div>
  <div hidden={tab!=="strategy"} className={styles.nonChartWorkspace}>
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
  </div>
  <div hidden={tab!=="admin"} className={styles.nonChartWorkspace}>
   <div className={styles.workspaceHeading}><div><p className={styles.eyebrow}>ADMIN & JOURNAL</p>
    <h2>Private trading records</h2><p className={styles.muted}>Manual and CSV imports stay in this browser tab unless you explicitly choose otherwise.</p></div></div>
   <XMICoachPanel ticker={item.key} openCloud={openCloud}/>
   <section className={styles.infoCard}><h3>Market-data configuration</h3>
    <p>Read-only broker candle polling requires an explicitly enabled feed and a valid feed-session authorization. The market-data
      adapter uses only TradeLocker's historical bar INFO route. Stock/ETF live streaming and background monitoring
      require separately reviewed data-source configuration.</p>
   </section>
  </div>
  <footer className={styles.footer}>
   The main chart uses TradingView Lightweight Charts with TradingView attribution. TradeLocker forex candles
   are queried through a separately authorized read-only adapter; missing data is never replaced with synthetic prices.
   Indicator values are informational, strategy confirmation is disabled until a strategy is validated, and
   no XMI screen calls broker order execution.
   <p><a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">Charting by TradingView</a></p>
  </footer>
 </main>;
}
