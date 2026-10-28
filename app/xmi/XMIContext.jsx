"use client";
import {useEffect,useRef,useState} from "react";
import styles from "./xmi.module.css";
function localInput(d){
 return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
export default function XMIContext({ticker}){
 const [start,setStart]=useState(()=>localInput(new Date(Date.now()-7*86400000)));
 const [end,setEnd]=useState(()=>localInput(new Date()));
 const [state,setState]=useState({phase:"idle",data:null,message:"Choose a period to compare with XMI's recent public evidence."});
 const pending=useRef(0);
 useEffect(()=>{pending.current++;setState({phase:"idle",data:null,message:"Ticker changed. Request new evidence for this stock/ETF."});},[ticker]);
 async function load(event){
  event.preventDefault();const from=Date.parse(start),to=Date.parse(end);
  if(!Number.isFinite(from)||!Number.isFinite(to)||from>=to||to-from>31*86400000||to>Date.now()+120000){
   setState({phase:"error",data:null,message:"Choose a valid period of up to 31 days, ending no later than now."});return;
  }
  const id=++pending.current;
  setState({phase:"loading",data:null,message:"Reading public XMI evidence…"});
  try{
   const qs=new URLSearchParams({symbol:ticker,start:String(Math.floor(from/1000)),end:String(Math.floor(to/1000))});
   const r=await fetch("/api/xmi/context?"+qs,{cache:"no-store"});
   const payload=await r.json();
   if(!r.ok||!payload.ok)throw Error(payload.error||"XMI unavailable");
   if(id===pending.current)setState({phase:"ready",data:payload,message:payload.count+" timestamp-qualified articles returned from the recent XMI snapshot."});
  }catch(e){if(id===pending.current)setState({phase:"error",data:null,message:e.message});}
 }
 const {data}=state;
 return <section className={styles.infoCard} aria-label="Historical XMI news context">
  <h2>Historical XMI news context</h2>
  <p>Read-only XMI public feed, matched to <strong>{ticker}</strong>. Select dates yourself:
    TradingView's embedded chart does not expose its drawn selections to XMI.</p>
  <form onSubmit={load} className={styles.contextForm}>
   <label>From (your local time)<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)} required/></label>
   <label>To (your local time)<input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)} required/></label>
   <button type="submit" disabled={state.phase==="loading"}>{state.phase==="loading"?"Checking…":"Review XMI evidence"}</button>
  </form>
  <p role="status" className={styles.contextStatus}>{state.message}</p>
  {data?.coverage?<p className={styles.muted}>Source: {data.feed}. Only the 80 most recent public news entries
   are checked, not the full XMI historical archive. Oldest in snapshot: {data.coverage.oldestObserved
   ?new Date(data.coverage.oldestObserved).toLocaleString():"unknown"}; newest: {data.coverage.newestObserved
   ?new Date(data.coverage.newestObserved).toLocaleString():"unknown"}.</p>:null}
  {data?.stories?.length?<ul className={styles.storyList}>{data.stories.map((story,i)=>
   <li key={story.url+"-"+i}>
    <a href={story.url} target="_blank" rel="noopener noreferrer">{story.title}</a>
    <div className={styles.storyMeta}>{story.source} · {story.scope==="ticker-related"?"Ticker mentioned":"Broader-market context"}
      {" · published "+new Date(story.publishedAt).toLocaleString()}
      {" · first collected "+new Date(story.observedAt).toLocaleString()}
      {" · "+(story.timing==="prior"?"before selected start":"during selected window")}</div>
   </li>)}</ul>:null}
  {data&&data.stories.length===0?<p className={styles.muted}>No qualifying articles in the returned snapshot.
    This does not mean that no historical market news existed.</p>:null}
  <p className={styles.muted}>Timestamped proximity does not prove that a headline caused a price movement. 
    XMI's historical news API on Draft PR #2 is not deployed here; this is a recent public-snapshot connection.</p>
 </section>;
}
