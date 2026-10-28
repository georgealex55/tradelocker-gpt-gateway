"use client";
import {useState} from "react";
import styles from "./xmi.module.css";
import XMILiveChart from "./XMILiveChart";
import {parseInstrument,validateWatchlist} from "../../lib/xmiLiveMath.mjs";
import {STRUCTURE_CONCEPTS,defaultStructureSettings,setStructureOption} from "../../lib/xmiStructure.mjs";
const START=["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","NASDAQ:AAPL","AMEX:SPY"];
const DEFAULT=START.map(parseInstrument);
const TIMEFRAMES=["1m","5m","15m","30m","1H","4H","1D"];
export default function XMIEngineDesk({selected,onSelected,active=true}){
 const [watchlist,setWatchlist]=useState(DEFAULT);
 const [watchInput,setWatchInput]=useState("");
 const [error,setError]=useState("");
 const [layout,setLayout]=useState(1);
 const [focus,setFocus]=useState(0);
 const [watchOpen,setWatchOpen]=useState(true);
 const [structureOpen,setStructureOpen]=useState(true);
 const [structureSettings,setStructureSettings]=useState(defaultStructureSettings);
 const [observations,setObservations]=useState({});
 const [chartKeys,setChartKeys]=useState(()=>[DEFAULT[0].key,DEFAULT[1].key,DEFAULT[2].key,DEFAULT[3].key]);
 const [resolutions,setResolutions]=useState(["5m","15m","1H","1D"]);
 function choose(key){
  onSelected(key);
  setChartKeys(old=>old.map((x,i)=>i===focus?key:x));
 }
 function add(event){
  event.preventDefault();
  try{
   const item=parseInstrument(watchInput);
   if(watchlist.some(x=>x.key===item.key))throw Error("Already in the watchlist");
   const next=validateWatchlist([...watchlist.map(x=>x.key),item.key]);
   setWatchlist(next);setWatchInput("");setError("");choose(item.key);
  }catch(e){setError(e.message);}
 }
 function remove(key){
  const next=watchlist.filter(x=>x.key!==key);
  if(!next.length){setError("Keep at least one instrument in the watchlist.");return;}
  setWatchlist(next);
  setChartKeys(old=>old.map(x=>x===key?next[0].key:x));
  if(selected===key)onSelected(next[0].key);
 }
 function changeLayout(num){setLayout(num);if(focus>=num){setFocus(0);onSelected(chartKeys[0]);}}
 const current=parseInstrument(chartKeys[focus]);
 const report=observations[focus+"|"+current.key+"|"+resolutions[focus]];
 const activeConceptCount=STRUCTURE_CONCEPTS.filter(x=>structureSettings[x.id].enabled).length;
 return <div className={styles.liveDesk}>
  <aside className={styles.liveWatch} aria-label="Market watchlist and market structure">
   <section className={styles.sideSection}>
    <div className={styles.liveSideTitle}>
     <strong>Market watchlist</strong>
     <div className={styles.sideTitleActions}>
      <span>{watchlist.length}/10</span>
      <button type="button" onClick={()=>setWatchOpen(x=>!x)} aria-expanded={watchOpen}
       aria-controls="xmi-watch-body">{watchOpen?"Collapse":"Expand"}</button>
     </div>
    </div>
    <div id="xmi-watch-body" hidden={!watchOpen}>
     <p className={styles.sideHint}>Five visible rows · scroll to browse</p>
     <div className={styles.watchRows} role="list" aria-label="Up to ten instruments">
      {watchlist.map(item=><div key={item.key} role="listitem" className={styles.watchRow+(item.key===current.key?" "+styles.watchActive:"")}>
       <button type="button" onClick={()=>choose(item.key)} className={styles.watchSelect}
        aria-pressed={item.key===current.key}>
        <strong>{item.label}</strong><small>{item.asset==="forex"?"FX · TradeLocker":"STOCK / ETF · feed pending"}</small>
       </button>
       <button type="button" className={styles.watchRemove} onClick={()=>remove(item.key)}
         aria-label={"Remove "+item.label+" from watchlist"}>×</button>
      </div>)}
     </div>
     <form className={styles.watchAdd} onSubmit={add}>
      <label htmlFor="watch-add">Add instrument</label>
      <div><input id="watch-add" value={watchInput} onChange={e=>setWatchInput(e.target.value)}
       maxLength={20} placeholder="EURJPY or NASDAQ:AAPL"/>
       <button type="submit" disabled={watchlist.length>=10}>Add</button></div>
     </form>
     {error?<p role="alert" className={styles.error}>{error}</p>:null}
    </div>
   </section>
   <section className={styles.sideSection} aria-label="Smart money concept visibility">
    <div className={styles.liveSideTitle}>
     <strong>Market structure</strong>
     <div className={styles.sideTitleActions}>
      <span>{activeConceptCount}/11</span>
      <button type="button" onClick={()=>setStructureOpen(x=>!x)} aria-expanded={structureOpen}
       aria-controls="xmi-structure-body">{structureOpen?"Hide":"Show"}</button>
     </div>
    </div>
    <div id="xmi-structure-body" hidden={!structureOpen}>
     <p className={styles.sideHint}>Chart overlays · each concept has its own timeframe</p>
     <div className={styles.structureList}>
      {STRUCTURE_CONCEPTS.map(item=><div className={styles.structureRow} key={item.id} title={item.description}>
       <label className={styles.structureLabel}>
        <input type="checkbox" checked={structureSettings[item.id].enabled}
         onChange={e=>setStructureSettings(prev=>setStructureOption(prev,item.id,{enabled:e.target.checked}))}/>
        <span>{item.label}</span>
       </label>
       <label className={styles.structureTimeLabel}>
        <span className={styles.srOnly}>{item.label} analysis timeframe</span>
        <select value={structureSettings[item.id].resolution} aria-label={item.label+" timeframe"}
         onChange={e=>setStructureSettings(prev=>setStructureOption(prev,item.id,{resolution:e.target.value}))}>
         {TIMEFRAMES.map(tf=><option value={tf} key={tf}>{tf}</option>)}
        </select>
       </label>
      </div>)}
     </div>
     <p className={styles.watchFoot}>Five most recent closed-candle observations per concept. Shared across all open charts. These checkboxes do not change strategy rules.</p>
    </div>
   </section>
   <p className={styles.watchFoot}>Watchlist and overlay settings are browser-tab only. No background 10-symbol scanner or order execution.</p>
  </aside>
  <section className={styles.liveCharts} aria-label="Live chart grid">
   <header className={styles.liveChartHeading}>
    <div><p className={styles.eyebrow}>CANDLE ENGINE / STRUCTURE PREVIEW</p>
     <h2>Live market charts</h2></div>
    <div className={styles.layoutPicker} role="group" aria-label="Chart layout">
     {[1,2,4].map(n=><button type="button" key={n} aria-pressed={layout===n}
       className={layout===n?styles.selected:""} onClick={()=>changeLayout(n)}>{n}</button>)}
    </div>
   </header>
   <div className={layout===1?styles.single:layout===2?styles.double:styles.quad}>
    {chartKeys.slice(0,layout).map((key,index)=>{
     const item=parseInstrument(key);
     return <div key={index} className={styles.liveChartItem}>
      {item.asset==="forex"
       ?<XMILiveChart symbol={item.symbol} resolution={resolutions[index]}
          onResolution={v=>setResolutions(r=>r.map((x,i)=>i===index?v:x))}
          selected={index===focus} onFocus={()=>{setFocus(index);onSelected(key);}}
          structureSettings={structureSettings}
          onStructure={result=>setObservations(old=>({...old,[index+"|"+key+"|"+resolutions[index]]:result}))}
          compact={layout>1} active={active}/>
       :<div className={styles.feedMissing}>
         <h3>{item.label}</h3><p>Stock/ETF chart not yet connected.</p>
         <p>Alpaca data requires a separate approved market-data adapter and feed entitlement. No synthetic candles are displayed.</p>
         <button type="button" onClick={()=>{setFocus(index);onSelected(key);}}>Use for research</button>
        </div>}
     </div>;
    })}
   </div>
  </section>
  <aside className={styles.liveIntelligence} aria-label="Strategy intelligence and market structure">
   <div className={styles.liveSideTitle}><strong>Strategy intelligence</strong><span>READ ONLY</span></div>
   <p className={styles.eyebrow}>FOCUSED INSTRUMENT</p>
   <h3>{current.label}</h3>
   <div className={styles.liveState}><span>Signal status</span><strong>NO ACTIVE STRATEGY</strong></div>
   <div className={styles.liveState}><span>Entry / TP / SL</span><strong>Not generated</strong></div>
   <div className={styles.liveState}><span>Confirmation</span><strong>Candle-close observations only</strong></div>
   <section className={styles.structureResults} aria-label="Market structure explanations" aria-live="polite">
    <h4>Market structure · {activeConceptCount} enabled</h4>
    {itemOrNull(current.asset,report)}
   </section>
   <div className={styles.liveState}><span>Economic fundamentals</span><strong>See News & Research</strong></div>
   <p className={styles.liveCoach}><strong>XMI observation</strong>
    Market structure overlays are algorithmic price-action observations, not confirmed trade entries.
    Strategy filters, actual trades, TP and SL remain separate and disabled until explicitly configured.
   </p>
   <p className={styles.watchFoot}>Heuristic SMC definitions use verified historical OHLC and confirmed candles; broker tick volume is not consolidated global volume. Session boundaries are fixed UTC reference windows, not DST-adjusted market hours.</p>
  </aside>
 </div>;
}
function itemOrNull(asset,report){
 if(asset!=="forex")return <p className={styles.watchFoot}>An equity live-price adapter is not configured. No market structure inferred.</p>;
 if(!report)return <p className={styles.watchFoot}>Awaiting verified broker candles and structure analysis.</p>;
 const {summaries=[],unavailable=[]}=report;
 return <>
  {summaries.length?<div className={styles.structureFindings}>
   {summaries.slice(0,6).map(({concept,resolution,event})=><div key={concept+"|"+resolution} className={styles.structureFinding}>
    <strong>{concept} <span>{resolution}</span></strong>
    <p>{event.summary}</p>
    <small>Confirmed {new Date(event.confirmedAt*1000).toLocaleString()}</small>
   </div>)}
  </div>:<p className={styles.watchFoot}>No confirmed matching structure in the returned history.</p>}
  {unavailable.length?<p className={styles.structureWarning}>{unavailable.length} concept/timeframe source{unavailable.length===1?"":"s"} unavailable. Missing data is never treated as a confirmed observation.</p>:null}
 </>;
}
