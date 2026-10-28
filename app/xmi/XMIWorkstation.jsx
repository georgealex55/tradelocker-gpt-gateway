"use client";
import {useEffect,useState} from "react";
import styles from "./xmi.module.css";
import XMIEngineDesk from "./XMIEngineDesk";
import XMIContext from "./XMIContext";
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
 useEffect(()=>{
  const u=new URLSearchParams(window.location.search);
  if(u.has("code")||u.has("error")){setTab("admin");setOpenCloud(true);}
 },[]);
 const item=parseInstrument(selected);
 return <main className={styles.shell+" "+(tab==="live"?styles.studioShell:"")+
   (tab==="live"&&focusMode?" "+styles.studioFocus:"")}>
  <header className={styles.header}>
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
  </header>
  <nav className={styles.mainNavigation} aria-label="XMI workspaces">
   {TABS.map(t=><button key={t.id} type="button" onClick={()=>setTab(t.id)}
     aria-current={tab===t.id?"page":undefined} className={tab===t.id?styles.mainNavActive:""}>
     <strong>{t.title}</strong><small>{t.sub}</small>
   </button>)}
  </nav>
  <div hidden={tab!=="live"}><XMIEngineDesk selected={selected} onSelected={setSelected}
    onResearch={()=>setTab("research")} active={tab==="live"}
    focusMode={focusMode} onFocusMode={()=>setFocusMode(v=>!v)}/></div>
  <div hidden={tab!=="research"} className={styles.nonChartWorkspace}>
   <div className={styles.workspaceHeading}><div><p className={styles.eyebrow}>RESEARCH</p>
    <h2>{item.label} · market evidence</h2><p className={styles.muted}>Source-verified market context, not a promise of causation.</p></div></div>
   {item.asset==="forex"?<p className={styles.muted}>Forex evidence is filtered by pair, currencies and broad macro topics from XMI's latest public news snapshot. This is not a full economic calendar or a verified cause of price movements.</p>:null}
   <XMIContext ticker={item.key}/>
  </div>
  <div hidden={tab!=="strategy"} className={styles.nonChartWorkspace}>
   <div className={styles.workspaceHeading}><div><p className={styles.eyebrow}>STRATEGY LAB</p><h2>Custom strategy builder</h2></div>
     <span className={styles.previewTag}>Next milestone</span></div>
   <section className={styles.infoCard}><h3>Deterministic strategy confirmation</h3>
    <p>The new indicator engine is built. Strategy rules, activation, backtests and candle-close signal markers remain
    unconfigured. Until a validated user strategy is active, the live chart displays <strong>NO ACTIVE STRATEGY</strong>.</p>
    <p>No example indicator alignment will be misrepresented as a confirmed entry or placed broker order.</p>
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
