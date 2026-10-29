"use client";
import {useCallback,useEffect,useState} from "react";
import styles from "./xmi.module.css";
import XMIEngineDesk from "./XMIEngineDesk";
import XMIContext from "./XMIContext";
import XMIStrategyEngine from "./XMIStrategyEngine";
import XMIAccountSettings from "./XMIAccountSettings";
import {STRATEGIES} from "../../lib/xmiStrategyPresets.mjs";
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
 const [restoreWorkspace,setRestoreWorkspace]=useState(null),[engineView,setEngineView]=useState(null);
 const onRestore=useCallback(prefs=>{
  if(typeof prefs.workspace==="string")setRestoreWorkspace(prefs.workspace);
  if(STRATEGIES.some(s=>s.id===prefs.strategyId))setStrategyId(prefs.strategyId);
  if(prefs.pins&&typeof prefs.pins==="object")try{localStorage.setItem("xmi-news-pins-v1",JSON.stringify(prefs.pins));}catch{}
  if(prefs.patterns&&typeof prefs.patterns==="object")try{localStorage.setItem("xmi-pattern-types-v1",JSON.stringify(prefs.patterns));}catch{}
 },[]);
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
 return <main data-xmi-root="true" className={styles.shell+" "+(tab==="live"?styles.studioShell:"")+
   (tab==="live"&&focusMode?" "+styles.studioFocus:"")}>
  <div className={styles.layoutSwitch} role="toolbar" aria-label="XMI layout and account controls">
   <button type="button" aria-pressed={showBanner} onClick={()=>setShowBanner(v=>!v)}>{showBanner?"Hide top banner":"Show top banner"}</button>
   <button type="button" aria-pressed={showTabs} onClick={()=>setShowTabs(v=>!v)}>{showTabs?"Hide tabs":"Show tabs"}</button>
   {!showTabs?<select aria-label="Switch XMI workspace" value={tab} onChange={e=>setTab(e.target.value)}>
    {TABS.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}
   </select>:null}
   <XMIAccountSettings workspace={workspaceDraft} strategyId={strategyId} onRestore={onRestore}/>
  </div>
  {showBanner?<header className={styles.header}>
   <div>
    <a className={styles.back} href="/">Gateway home</a>
    <div className={styles.brandRow}>
     <span className={styles.brandMark} aria-hidden="true">X</span>
     <div><p className={styles.eyebrow}>XMI TERMINAL 2.0 / RESEARCH ONLY</p>
      <h1>Market intelligence terminal</h1></div>
    </div>
    <p className={styles.subtitle}>Forex-first live candles, five indicators, news and private journal research.</p>
   </div>
   <span className={styles.pill}>DEVELOPMENT PREVIEW · NO ORDERS</span>
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
    remoteWorkspace={restoreWorkspace}/></div>
  <div hidden={tab!=="research"} className={styles.nonChartWorkspace}>
   <div className={styles.workspaceHeading}><div><p className={styles.eyebrow}>RESEARCH</p>
    <h2>{item.label} · market evidence</h2><p className={styles.muted}>Source-verified market context, not a promise of causation.</p></div></div>
   {item.asset==="forex"?<p className={styles.muted}>Forex evidence is filtered by pair, currencies and broad macro topics from XMI's latest public news snapshot. This is not a full economic calendar or a verified cause of price movements.</p>:null}
   <XMIContext ticker={item.key}/>
  </div>
  <div hidden={tab!=="strategy"} className={styles.nonChartWorkspace}>
   <div className={styles.workspaceHeading}><div><p className={styles.eyebrow}>STRATEGY LAB · RESEARCH ONLY</p>
    <h2>Strategy presets & 9-cell engine</h2>
    <p className={styles.muted}>Choose one of three educational indicator configurations. The active live chart's timeframe and indicator overlays update automatically.</p></div></div>
   <p><a href="/xmi2/chart-studio.html" className={styles.historyStudioLink}>Historical Chart Studio · Import Only</a></p>
   <section className={styles.strategyCards}>
    {STRATEGIES.map(preset=><button type="button" key={preset.id} aria-pressed={strategyId===preset.id}
     className={styles.strategyCard} onClick={()=>{setStrategyId(preset.id);setTab("live");}}>
     <strong>{preset.name}</strong><small>{preset.type} · {preset.timeframe}</small>
     <span>{preset.rule}</span><small>{preset.description}</small>
    </button>)}
   </section>
   <section className={styles.infoCard}><h3>Selected strategy · research engine</h3>
    <XMIStrategyEngine strategyId={strategyId} report={engineView?.model}
     symbol={engineView?.symbol||selected} resolution={engineView?.resolution||"5m"} />
    <p className={styles.disclaimer}>Preset alignment is descriptive only. There is no backtested probability, order entry, or broker execution. Original XMI hard-confirm rules are reserved pending verified integration.</p>
   </section>
  </div>
  <div hidden={tab!=="admin"} className={styles.nonChartWorkspace}>
   <div className={styles.workspaceHeading}><div><p className={styles.eyebrow}>ADMIN & JOURNAL</p>
    <h2>Private trading records</h2><p className={styles.muted}>Manual and CSV imports stay in this browser tab unless you explicitly choose otherwise.</p></div></div>
   <XMICoachPanel ticker={item.key} openCloud={openCloud}/>
   <section className={styles.infoCard}><h3>Market-data configuration</h3>
    <p>Broker candle polling requires an explicitly enabled, access-protected Vercel preview. The new market-data
      adapter uses only TradeLocker's historical bar INFO route. Stock/ETF live streaming and background monitoring
      require separately reviewed data-source configuration.</p>
   </section>
  </div>
  <footer className={styles.footer}>
   The main chart uses TradingView Lightweight Charts with TradingView attribution. TradeLocker forex candles
   are queried through an isolated preview-only read adapter; missing data is never replaced with synthetic prices.
   Indicator values are informational, strategy confirmation is disabled until a strategy is validated, and
   no XMI screen calls broker order execution.
   <p><a href="https://www.tradingview.com/" target="_blank" rel="noopener noreferrer">Charting by TradingView</a></p>
  </footer>
 </main>;
}
