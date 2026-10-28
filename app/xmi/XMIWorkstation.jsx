"use client";
import {useEffect,useRef,useState} from "react";
import styles from "./xmi.module.css";
import XMIContext from "./XMIContext";
import XMICoachPanel from "./XMICoachPanel";
import {DEFAULT_CHARTS,INTERVALS,normalizeTicker,widgetSettings} from "../../lib/xmiWorkspace.mjs";
import {focusedChart,focusAfterLayout,updateSymbols,updateTimeframe,resolveTicker,splitTicker} from "../../lib/xmiDeskState.mjs";

const WATCHLIST=[
 {symbol:"AMEX:SPY",label:"SPY"},
 {symbol:"NASDAQ:QQQ",label:"QQQ"},
 {symbol:"NASDAQ:AAPL",label:"AAPL"},
 {symbol:"NASDAQ:NVDA",label:"NVDA"}
];
const INTERVAL_LABEL=Object.fromEntries(INTERVALS.map(([value,label])=>[value,label]));

function TradingViewPanel({spec,index,selected,onFocus,onInterval}){
 const host=useRef(null);
 const [status,setStatus]=useState("Loading chart");
 useEffect(()=>{
  const target=host.current;
  if(!target)return;
  let active=true;
  setStatus("Requesting TradingView chart…");
  target.replaceChildren();
  const widget=document.createElement("div");
  widget.className="tradingview-widget-container__widget";
  widget.style.width="100%";
  widget.style.height="100%";
  target.append(widget);
  const script=document.createElement("script");
  script.type="text/javascript";
  script.src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
  script.async=true;
  script.textContent=JSON.stringify(widgetSettings(spec));
  script.onload=()=>{if(active)setStatus("Widget script loaded · chart rendering depends on TradingView");};
  script.onerror=()=>{if(active)setStatus("TradingView script unavailable. Check network or content blockers.");};
  target.append(script);
  return ()=>{active=false;target.replaceChildren();};
 },[spec.symbol,spec.interval]);
 return <section className={styles.chartPanel+(selected?" "+styles.chartActive:"")}
    aria-label={"Chart "+(index+1)+": "+spec.symbol}>
   <div className={styles.panelTop}>
    <span className={styles.panelNumber}>0{index+1}</span>
    <div className={styles.chartTitle}><strong>{spec.symbol}</strong><small>{INTERVAL_LABEL[spec.interval]||"5m"} · TradingView</small></div>
    <button className={selected?styles.activeFocus:styles.focusButton}
     type="button" onClick={()=>onFocus(index)}
     aria-pressed={selected} aria-label={"Use chart "+(index+1)+" for news research and trade journal"}>
      {selected?"<escape>✓</escape> Research chart":"Use for research"}
    </button>
    <label className={styles.timeframeControl}>
      <span className={styles.srOnly}>Chart {index+1} timeframe</span>
      <select value={spec.interval} onChange={e=>onInterval(index,e.target.value)}>
       {INTERVALS.map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select>
    </label>
   </div>
   <div ref={host} className={styles.widgetHost+" tradingview-widget-container"}
     aria-label={"TradingView chart for "+spec.symbol}/>
   <p className={styles.subline} role="status">{status}</p>
 </section>;
}
export default function XMIWorkstation(){
 const [charts,setCharts]=useState(()=>DEFAULT_CHARTS.map(x=>({...x})));
 const [count,setCount]=useState(1);
 const [focused,setFocused]=useState(0);
 const [linked,setLinked]=useState(false);
 const [input,setInput]=useState("SPY");
 const [exchange,setExchange]=useState("AMEX");
 const [error,setError]=useState("");
 const [tab,setTab]=useState("evidence");
 const [openCloud,setOpenCloud]=useState(false);
 const active=focusedChart(charts,focused);
 const activeSymbol=active.symbol;
 useEffect(()=>{
  const hasCallback=new URLSearchParams(window.location.search).has("code")||
    new URLSearchParams(window.location.search).has("error");
  if(hasCallback){setTab("coach");setOpenCloud(true);}
 },[]);
 function chooseChart(index){
  setFocused(index);
  const parts=splitTicker(charts[index].symbol);
  setInput(parts.ticker);setExchange(parts.exchange);
  setError("");
 }
 function applySymbol(symbol){
  setCharts(prev=>updateSymbols(prev,focused,symbol,linked));
  const parts=splitTicker(symbol);
  setInput(parts.ticker);setExchange(parts.exchange);setError("");
 }
 function submitSymbol(event){
  event.preventDefault();
  try{applySymbol(resolveTicker(input,exchange));}
  catch(e){setError(e.message);}
 }
 function chooseLayout(num){
  setCount(num);
  const next=focusAfterLayout(focused,num);
  if(next!==focused){
   setFocused(next);
   const parts=splitTicker(charts[next].symbol);
   setInput(parts.ticker);setExchange(parts.exchange);
  }
  setError("");
 }
 function updateInterval(index,interval){
  if(!INTERVALS.some(([value])=>value===interval))return;
  setCharts(prev=>updateTimeframe(prev,index,interval));
 }
 const tabs=[{id:"evidence",text:"News & evidence",hint:"Read-only XMI context"},
             {id:"coach",text:"Trade journal",hint:"Private, optional sync"}];
 return <main className={styles.shell}>
  <header className={styles.header}>
   <div>
    <a className={styles.back} href="/">Gateway home</a>
    <div className={styles.brandRow}>
     <span className={styles.brandMark} aria-hidden="true">X</span>
     <div>
      <p className={styles.eyebrow}>XMI 2.0 / RESEARCH DESK</p>
      <h1>Chart workstation</h1>
     </div>
    </div>
    <p className={styles.subtitle}>TradingView charts, XMI evidence and your trading journal. One focused workflow.</p>
   </div>
   <span className={styles.pill}>DEVELOPMENT PREVIEW · READ ONLY</span>
  </header>
  <section className={styles.commandBar} aria-label="Chart controls">
   <form className={styles.topForm} onSubmit={submitSymbol}>
    <label htmlFor="xmi-symbol">Symbol</label>
    <div className={styles.searchInput}>
     <label className={styles.srOnly} htmlFor="xmi-exchange">Stock exchange</label>
     <select id="xmi-exchange" aria-label="Stock exchange" value={exchange}
       onChange={e=>setExchange(e.target.value)}>
       {["NASDAQ","NYSE","AMEX","ARCA"].map(venue=><option key={venue} value={venue}>{venue}</option>)}
     </select>
     <input id="xmi-symbol" autoComplete="off" spellCheck={false} value={input}
      maxLength={20} onChange={e=>setInput(e.target.value)} placeholder="AAPL"/>
     <button type="submit">Load</button>
    </div>
    <span className={styles.controlHint}>Search a ticker, then Load. Updates {linked?"all visible charts":"the selected chart"}.</span>
   </form>
   <div className={styles.controlsRight}>
    <fieldset className={styles.layoutPicker}>
     <legend>Layout</legend>
     {[1,2,4].map(n=><button key={n} type="button" className={count===n?styles.selected:""}
      aria-pressed={count===n} onClick={()=>chooseLayout(n)}>{n}</button>)}
    </fieldset>
    <label className={styles.linked}><input type="checkbox" checked={linked}
       onChange={e=>setLinked(e.target.checked)}/> Link symbols</label>
   </div>
   <div className={styles.quickPicks}>
    <span>Quick picks</span>
    {WATCHLIST.map(t=><button type="button" key={t.symbol}
      className={activeSymbol===t.symbol?styles.quickActive:""}
      onClick={()=>applySymbol(t.symbol)} aria-pressed={activeSymbol===t.symbol}>{t.label}</button>)}
    <span className={styles.selectedChartHint}>Researching chart {focused+1} of {count}</span>
   </div>
   {error?<p role="alert" className={styles.error}>{error}</p>:null}
  </section>
  <div className={count===1?styles.single:count===2?styles.double:styles.quad}>
   {charts.slice(0,count).map((spec,index)=>
    <TradingViewPanel key={index} index={index} spec={spec}
      selected={focused===index} onFocus={chooseChart} onInterval={updateInterval}/>)}
  </div>
  <section className={styles.workspace} aria-label="Research workspace">
   <div className={styles.workspaceHeading}>
    <div><p className={styles.eyebrow}>WORKSPACE</p><h2>{activeSymbol.split(":")[1]} research</h2>
      <p className={styles.muted}>News and journal follow your selected research chart, not every open chart.</p></div>
    <span className={styles.previewTag}>No order execution</span>
   </div>
   <div className={styles.tabs} role="tablist" aria-label="Research tools">
    {tabs.map(item=><button type="button" key={item.id} id={"xmi-tab-"+item.id}
      role="tab" aria-selected={tab===item.id} aria-controls={"xmi-panel-"+item.id}
      className={tab===item.id?styles.currentTab:""}
      onClick={()=>setTab(item.id)}>
      <strong>{item.text}</strong><small>{item.hint}</small>
    </button>)}
   </div>
   <div id="xmi-panel-evidence" role="tabpanel" aria-labelledby="xmi-tab-evidence" hidden={tab!=="evidence"}>
    <XMIContext ticker={activeSymbol}/>
   </div>
   <div id="xmi-panel-coach" role="tabpanel" aria-labelledby="xmi-tab-coach" hidden={tab!=="coach"}>
    <XMICoachPanel ticker={activeSymbol} openCloud={openCloud}/>
   </div>
  </section>
  <footer className={styles.footer}>
   TradingView supplies the embedded chart and its market data, not Alpaca IEX.
   The hosted widget cannot send drawing or candle selections to XMI. Choose dates
   in News & evidence. Personal journal records stay in tab memory unless you explicitly
   export or, after separate secure configuration, request a cloud upload.
  </footer>
 </main>;
}
