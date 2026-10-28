"use client";
import {useEffect,useRef,useState} from "react";
import styles from "./xmi.module.css";
import XMIContext from "./XMIContext";
import XMICoachPanel from "./XMICoachPanel";
import {DEFAULT_CHARTS,INTERVALS,normalizeTicker,widgetSettings} from "../../lib/xmiWorkspace.mjs";

function TradingViewPanel({spec,index,onSymbol,onInterval}){
  const host=useRef(null);
  const [value,setValue]=useState(spec.symbol);
  const [error,setError]=useState("");
  const [status,setStatus]=useState("Loading chart widget");
  useEffect(()=>setValue(spec.symbol),[spec.symbol]);
  useEffect(()=>{
    const target=host.current;
    if(!target)return;
    let active=true;
    setStatus("Loading TradingView widget");
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
    script.onload=()=>{if(active)setStatus("TradingView widget script loaded");};
    script.onerror=()=>{if(active)setStatus("Chart script unavailable; check access or content blockers");};
    target.append(script);
    return ()=>{active=false;target.replaceChildren();};
  },[spec.symbol,spec.interval]);

  function apply(event){
    event.preventDefault();
    try{const symbol=normalizeTicker(value);onSymbol(index,symbol);setError("");}
    catch(e){setError(e.message);}
  }

  return <section className={styles.chartPanel} aria-label={"Chart "+(index+1)}>
    <div className={styles.panelTop}>
      <span className={styles.panelNumber}>0{index+1}</span>
      <form onSubmit={apply} className={styles.tickerForm}>
        <label className={styles.srOnly} htmlFor={"ticker-"+index}>Ticker and exchange</label>
        <input id={"ticker-"+index} value={value} maxLength={20}
          onChange={e=>setValue(e.target.value)} spellCheck={false}
          aria-label={"Chart "+(index+1)+" stock or ETF symbol"}/>
        <button type="submit" aria-label={"Load ticker in chart "+(index+1)}>Load</button>
      </form>
      <label className={styles.srOnly} htmlFor={"tf-"+index}>Timeframe</label>
      <select aria-label={"Chart "+(index+1)+" timeframe"} id={"tf-"+index}
        value={spec.interval} onChange={e=>onInterval(index,e.target.value)}>
        {INTERVALS.map(([v,label])=><option key={v} value={v}>{label}</option>)}
      </select>
    </div>
    {error?<p role="alert" className={styles.error}>{error}</p>:null}
    <div ref={host} className={styles.widgetHost+" tradingview-widget-container"} aria-label={"TradingView chart for "+spec.symbol}/>
    <p className={styles.subline}>{status} · Chart data and drawing tools supplied by TradingView</p>
  </section>;
}

export default function XMIWorkstation(){
  const [charts,setCharts]=useState(()=>DEFAULT_CHARTS.map(x=>({...x})));
  const [count,setCount]=useState(2);
  const [linkSymbols,setLinkSymbols]=useState(false);
  const [activeSymbol,setActiveSymbol]=useState(DEFAULT_CHARTS[0].symbol);
  const [input,setInput]=useState(DEFAULT_CHARTS[0].symbol);
  const [error,setError]=useState("");
  function updateSymbol(index,symbol){
    setCharts(prev=>prev.map((chart,i)=>
      linkSymbols||i===index?{...chart,symbol}:chart));
    setActiveSymbol(symbol);setInput(symbol);
  }
  function updateInterval(index,interval){
    if(!INTERVALS.some(([x])=>x===interval))return;
    setCharts(prev=>prev.map((c,i)=>i===index?{...c,interval}:c));
  }
  function applyAll(event){
    event.preventDefault();
    try {
      const symbol=normalizeTicker(input);
      setCharts(prev=>prev.map(c=>({...c,symbol})));
      setActiveSymbol(symbol);setError("");
    }catch(e){setError(e.message);}
  }
  return <main className={styles.shell}>
    <div className={styles.header}>
      <div>
        <a className={styles.back} href="/">← Gateway</a>
        <p className={styles.eyebrow}>XMI 2.0 / DEVELOPMENT WORKSTATION</p>
        <h1>TradingView Chart Desk</h1>
        <p className={styles.subtitle}>Stocks and ETFs · read-only research · separate from TradeLocker execution</p>
      </div>
      <span className={styles.pill}>PREVIEW · NO ORDERS</span>
    </div>
    <div className={styles.toolbar}>
      <form onSubmit={applyAll} className={styles.topForm}>
        <label htmlFor="all-tickers">Load ticker across charts</label>
        <input id="all-tickers" spellCheck={false} value={input} maxLength={20}
          onChange={e=>setInput(e.target.value)} placeholder="NASDAQ:AAPL"/>
        <button type="submit">Load all</button>
      </form>
      <fieldset className={styles.layoutPicker}>
        <legend>Layout</legend>
        {[1,2,4].map(num=><button key={num} type="button"
          className={count===num?styles.selected:""} aria-pressed={count===num}
          onClick={()=>setCount(num)}>{num} chart{num>1?"s":""}</button>)}
      </fieldset>
      <label className={styles.linked}>
        <input type="checkbox" checked={linkSymbols}
          onChange={e=>setLinkSymbols(e.target.checked)}/>
        Link ticker changes
      </label>
      {error?<p role="alert" className={styles.error}>{error}</p>:null}
    </div>
    <div className={count===1?styles.single:count===2?styles.double:styles.quad}>
      {charts.slice(0,count).map((spec,index)=>
        <TradingViewPanel key={index} spec={spec} index={index}
          onSymbol={updateSymbol} onInterval={updateInterval}/>)}
    </div>
    <div className={styles.integratedDesk}>
      <XMIContext ticker={activeSymbol}/>
      <XMICoachPanel ticker={activeSymbol}/>
    </div>
    <footer className={styles.footer}>
      <strong>Market-data boundary:</strong> The embedded charts use TradingView-hosted data,
      not Alpaca IEX. XMI public news comes through a separate read-only adapter. The
      hosted widget does not expose crosshair, candle ranges, or private drawings to XMI;
      select dates manually for news review. Personal journal data remains in this tab
      unless you explicitly export a local file. No broker execution is connected.
    </footer>
  </main>;
}
