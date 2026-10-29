"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import styles from "./xmi.module.css";
function localTime(d){return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
const RANGES=[{id:1,label:"24 hours"},{id:7,label:"7 days"},{id:30,label:"30 days"}];
export default function XMIContext({ticker}){
 const [start,setStart]=useState("");
 const [end,setEnd]=useState("");
 const [preset,setPreset]=useState(7);
 const [query,setQuery]=useState(""),[onlyPins,setOnlyPins]=useState(false);
 const [pins,setPins]=useState({});
 const [state,setState]=useState({phase:"idle",data:null,message:"Select a range, then review XMI's recent public evidence."});
 const pending=useRef(0);
 useEffect(()=>{
  const reload=()=>{try{const old=JSON.parse(localStorage.getItem("xmi-news-pins-v1")||"{}");if(old&&typeof old==="object"&&!Array.isArray(old))setPins(old);}catch{}};
  reload();window.addEventListener("xmi:preferences-restored",reload);
  return ()=>window.removeEventListener("xmi:preferences-restored",reload);
 },[]);
 function togglePin(url){setPins(previous=>{const group=Array.isArray(previous[ticker])?previous[ticker]:[];
  const list=group.includes(url)?group.filter(x=>x!==url):[...group,url].slice(-40);
  const next={...previous,[ticker]:list};try{localStorage.setItem("xmi-news-pins-v1",JSON.stringify(next));}catch{}return next;});}
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
 useEffect(()=>{resetEvidence("Instrument changed. Review the latest available public evidence.");},[ticker]);
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
 const pinnedUrls=Array.isArray(pins[ticker])?pins[ticker]:[];
 const stories=useMemo(()=>{
  return (data?.stories||[]).filter(story=>(!onlyPins||pinnedUrls.includes(story.url))&&
   (!query||(story.title+" "+story.source+" "+story.scope).toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>Number(pinnedUrls.includes(b.url))-Number(pinnedUrls.includes(a.url)));
 },[data,onlyPins,query,pins,ticker]);
 const totals=RANGES.map(range=>({label:range.label,count:(data?.stories||[]).filter(story=>Date.parse(story.publishedAt)>=Date.now()-range.id*86400000).length}));
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
      This checks only the 80 newest records in the public XMI feed, not a complete archive or economic calendar.
      <span>Feed window: {data.coverage.oldestObserved?new Date(data.coverage.oldestObserved).toLocaleString():"unknown"}
        {" – "}{data.coverage.newestObserved?new Date(data.coverage.newestObserved).toLocaleString():"unknown"}</span>
    </div>:null}
   <details className={styles.intelDetails} open><summary>Searchable ticker feed · {ticker}</summary>
   <div className={styles.researchSearch}><input aria-label="Search ticker news" placeholder="Search headlines, sources or topics…" value={query} onChange={e=>setQuery(e.target.value)}/>
    <label><input type="checkbox" checked={onlyPins} onChange={e=>setOnlyPins(e.target.checked)}/> Pinned only ({pinnedUrls.length})</label></div>
   {data?<div className={styles.researchTimeline} aria-label="Available publication counts by time window">
    {totals.map(t=><div key={t.label}><strong>{t.label}</strong><span>{t.count} articles</span></div>)}
    <small>Approximate snapshot coverage only; not a price forecast. Feed may contain fewer than 80 records.</small>
   </div>:null}
   {stories.length?<ul className={styles.storyList}>
     {stories.map((story,i)=><li key={story.url+"-"+i}>
       <button type="button" aria-label={(pinnedUrls.includes(story.url)?"Unpin":"Pin")+" article"}
        aria-pressed={pinnedUrls.includes(story.url)} onClick={()=>togglePin(story.url)}>
        {pinnedUrls.includes(story.url)?"★ Pinned":"☆ Pin"}</button>
       <a href={story.url} target="_blank" rel="noopener noreferrer">{story.title}</a>
       <div className={styles.storyMeta}>
        {story.scope==="ticker-related"?"TICKER MENTIONED":
          story.scope==="pair-related"?"FX PAIR MENTIONED":
          story.scope==="currency-related"?"CURRENCY CONTEXT":"BROADER MARKET"} · {story.source}
       </div>
       <div className={styles.storyMeta}>Published {new Date(story.publishedAt).toLocaleString()}
         {" · "}XMI collected {new Date(story.observedAt).toLocaleString()}</div>
     </li>)}
   </ul>:null}
   {data&&stories.length===0?<div className={styles.emptyResult}>
      No matching stories in this limited public snapshot. The full historical archive may contain more.</div>:null}
   </details>
   <p className={styles.disclaimer}>These are timestamped references, not proven causes of price moves.
     News context is not proof of price causation. Use the date controls above to limit the snapshot.</p>
  </section>;
}
