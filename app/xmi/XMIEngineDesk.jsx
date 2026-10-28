"use client";
import {useState} from "react";
import styles from "./xmi.module.css";
import XMILiveChart from "./XMILiveChart";
import {parseInstrument,validateWatchlist,FX_RESOLUTIONS} from "../../lib/xmiLiveMath.mjs";
const START=["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","NASDAQ:AAPL","AMEX:SPY"];
const DEFAULT=START.map(parseInstrument);
export default function XMIEngineDesk({selected,onSelected,active=true}){
 const [watchlist,setWatchlist]=useState(DEFAULT);
 const [watchInput,setWatchInput]=useState("");
 const [error,setError]=useState("");
 const [layout,setLayout]=useState(1);
 const [focus,setFocus]=useState(0);
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
 function changeLayout(num){setLayout(num);if(focus>=num)setFocus(0);}
 const current=parseInstrument(chartKeys[focus]);
 return <div className={styles.liveDesk}>
  <aside className={styles.liveWatch} aria-label="Monitored instruments">
   <div className={styles.liveSideTitle}><strong>Market watchlist</strong><span>{watchlist.length}/10</span></div>
   <p>Forex-first · select a pair to focus its chart</p>
   <div className={styles.watchRows}>
    {watchlist.map(item=><div key={item.key} className={styles.watchRow+(item.key===current.key?" "+styles.watchActive:"")}>
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
   <p className={styles.watchFoot}>The watchlist is local to this browser tab. Full 10-symbol background monitoring comes after the live source and strategy service are verified.</p>
  </aside>
  <section className={styles.liveCharts} aria-label="Live chart grid">
   <header className={styles.liveChartHeading}>
    <div><p className={styles.eyebrow}>CANDLE ENGINE / PREVIEW</p>
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
          selected={index===focus} onFocus={()=>{setFocus(index);onSelected(key);}} compact={layout>1} active={active}/>
       :<div className={styles.feedMissing}>
         <h3>{item.label}</h3><p>Stock/ETF chart not yet connected.</p>
         <p>Alpaca data requires a separate approved market-data adapter and feed entitlement. No synthetic candles are displayed.</p>
         <button type="button" onClick={()=>{setFocus(index);onSelected(key);}}>Use for research</button>
        </div>}
     </div>;
    })}
   </div>
  </section>
  <aside className={styles.liveIntelligence} aria-label="Strategy intelligence">
   <div className={styles.liveSideTitle}><strong>Strategy intelligence</strong><span>READ ONLY</span></div>
   <p className={styles.eyebrow}>FOCUSED INSTRUMENT</p>
   <h3>{current.label}</h3>
   <div className={styles.liveState}><span>Signal status</span><strong>NO ACTIVE STRATEGY</strong></div>
   <div className={styles.liveState}><span>Entry / TP / SL</span><strong>Not generated</strong></div>
   <div className={styles.liveState}><span>Confirmation</span><strong>Close-of-candle required</strong></div>
   <div className={styles.liveState}><span>Market fundamentals</span><strong>See News & Research</strong></div>
   <p className={styles.liveCoach}>
    <strong>XMI observation</strong>
    The chart displays the five selected indicator families where valid broker data exists.
    Confirmed signals and planned trade levels remain disabled until a validated user strategy is active.
   </p>
   <p className={styles.watchFoot}>Broker order paths are not connected. FX volume is broker tick volume, not global exchange volume. No trade advice is inferred from missing data.</p>
  </aside>
 </div>;
}
