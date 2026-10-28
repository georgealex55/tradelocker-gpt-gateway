"use client";
import {useEffect,useRef,useState} from "react";
import styles from "./xmi.module.css";
function localTime(d){return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
const RANGES=[{id:1,label:"24 hours"},{id:7,label:"7 days"},{id:30,label:"30 days"}];
export default function XMIContext({ticker}){
 const [start,setStart]=useState("");
 const [end,setEnd]=useState("");
 const [preset,setPreset]=useState(7);
 const [state,setState]=useState({phase:"idle",data:null,message:"Select a range, then review XMI's recent public evidence."});
 const pending=useRef(0);
 function resetEvidence(message){
  pending.current++;
  setState({phase:"idle",data:null,message});
 }
 function chooseRange(days){
  const now=new Date();
  setStart(localTime(new Date(now.getTime()-days*86400000)));
  setEnd(localTime(now));setPreset(days);
  resetEvidence("Range selected. Choose Review evidence to check XMI's recent news.");
 }
 useEffect(()=>{
  const now=new Date();
  setStart(localTime(new Date(now.getTime()-7*86400000)));
  setEnd(localTime(now));
 },[]);
 useEffect(()=>{resetEvidence("Ticker changed. Review evidence for this stock or ETF.");},[ticker]);
 async function load(e){
  e.preventDefault();
  const from=Date.parse(start),to=Date.parse(end);
  if(!Number.isFinite(from)||!Number.isFinite(to)||from>=to||
    to-from>31*86400000||to>Date.now()+120000){
   resetEvidence("Choose a valid period of at most 31 days, ending no later than now.");
   return;
  }
  const id=++pending.current;
  setState({phase:"loading",data:null,message:"Checking timestamped XMI records…"});
  try{
   const query=new URLSearchParams({symbol:ticker,
     start:String(Math.floor(from/1000)),end:String(Math.floor(to/1000))});
   const response=await fetch("/api/xmi/context?"+query,{cache:"no-store"});
   const data=await response.json();
   if(!response.ok||!data.ok)throw Error(data.error||"XMI evidence is unavailable");
   if(id===pending.current)setState({phase:"ready",data,message:
    data.stories.length+" relevant stories found in the returned public news snapshot."});
  }catch(e){if(id===pending.current)setState({phase:"error",data:null,message:e.message});}
 }
 function updateStart(v){setStart(v);setPreset(null);resetEvidence("Dates updated. Review evidence to refresh the result.");}
 function updateEnd(v){setEnd(v);setPreset(null);resetEvidence("Dates updated. Review evidence to refresh the result.");}
 const data=state.data;
 return <section className={styles.infoCard+" "+styles.toolCard} aria-label="XMI market evidence">
   <div className={styles.toolIntro}>
    <div><h3>Market evidence</h3><p>Find articles that were published and observed by XMI before the selected end time.</p></div>
    <span className={styles.dataSource}>PUBLIC XMI FEED</span>
   </div>
   <div className={styles.rangeBar} role="group" aria-label="Quick date ranges">
    <span>Time range</span>
    {RANGES.map(item=><button type="button" key={item.id}
      className={preset===item.id?styles.rangeActive:""} aria-pressed={preset===item.id}
      onClick={()=>chooseRange(item.id)}>{item.label}</button>)}
   </div>
   <form className={styles.contextForm} onSubmit={load}>
    <label>From · local time<input required value={start} type="datetime-local"
      onChange={e=>updateStart(e.target.value)}/></label>
    <label>To · local time<input required value={end} type="datetime-local"
      onChange={e=>updateEnd(e.target.value)}/></label>
    <button type="submit" disabled={state.phase==="loading"||!start||!end}>
      {state.phase==="loading"?"Checking…":"Review evidence"}</button>
   </form>
   <div className={styles.resultStrip} role="status" aria-live="polite">
    <span className={state.phase==="error"?styles.statusError:state.phase==="ready"?styles.statusGood:styles.statusDot} aria-hidden="true"/>
    {state.message}
   </div>
   {data?.coverage?<div className={styles.coverageStrip}>
      <strong>Limited coverage</strong>
      This checks only the 80 newest records in the public XMI feed, not the complete historical archive.
      <span>Feed window: {data.coverage.oldestObserved?new Date(data.coverage.oldestObserved).toLocaleString():"unknown"}
        {" – "}{data.coverage.newestObserved?new Date(data.coverage.newestObserved).toLocaleString():"unknown"}</span>
    </div>:null}
   {data?.stories?.length?<ul className={styles.storyList}>
     {data.stories.map((story,i)=><li key={story.url+"-"+i}>
       <a href={story.url} target="_blank" rel="noopener noreferrer">{story.title}</a>
       <div className={styles.storyMeta}>
        {story.scope==="ticker-related"?"TICKER MENTIONED":"BROADER MARKET"} · {story.source}
       </div>
       <div className={styles.storyMeta}>Published {new Date(story.publishedAt).toLocaleString()}
         {" · "}XMI collected {new Date(story.observedAt).toLocaleString()}</div>
     </li>)}
   </ul>:null}
   {data&&data.stories.length===0?<div className={styles.emptyResult}>
      No matching stories in this limited public snapshot. The full historical archive may contain more.</div>:null}
   <p className={styles.disclaimer}>These are timestamped references, not proven causes of price moves.
     TradingView's hosted chart does not share candle selections with XMI; use the date controls above.</p>
  </section>;
}
