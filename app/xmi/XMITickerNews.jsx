"use client";
import {useEffect,useRef,useState} from "react";
import styles from "./xmi.module.css";
import {parseInstrument} from "../../lib/xmiLiveMath.mjs";
import {newsContextFlag} from "../../lib/xmiNewsContext.mjs";
import {filterHeadlines} from "../../lib/xmiWorkspaceUX.mjs";
const CHECK_MS=5*60*1000;
export default function XMITickerNews({ticker="FX:EURUSD",watchlist=[],active=true,compact=false}){
 const [input,setInput]=useState(ticker),[chosen,setChosen]=useState(ticker);
 const [result,setResult]=useState({state:"idle",data:null,message:"Select a ticker to load recent headlines."});
 const [updated,setUpdated]=useState(0);
 const [query,setQuery]=useState(""),[source,setSource]=useState(""),[flag,setFlag]=useState("");
 const abortRef=useRef(null);
 useEffect(()=>{setInput(ticker);setChosen(ticker);setQuery("");setSource("");setFlag("");},[ticker]);
 useEffect(()=>{
  if(!active||!chosen)return;
  const controller=new AbortController();abortRef.current?.abort();abortRef.current=controller;
  const reload=async()=>{
   const now=Math.floor(Date.now()/1000);
   setResult(old=>({...old,state:"loading",message:"Loading latest available XMI news snapshot…"}));
   try{
    const params=new URLSearchParams({symbol:chosen,start:String(now-7*86400),end:String(now)});
    const response=await fetch("/api/xmi/context?"+params,{signal:controller.signal,cache:"no-store"});
    const payload=await response.json();
    if(!response.ok||payload.ok!==true)throw Error(payload.error||"News service unavailable");
    if(!controller.signal.aborted)setResult({state:"ready",data:payload,
     message:payload.stories.length+" relevant headlines in the latest available XMI snapshot."});
   }catch(error){if(!controller.signal.aborted)setResult({state:"error",data:null,message:String(error.message).slice(0,180)});}
  };
  reload();
  // Periodically re-check available XMI snapshots, but never imply exchange-grade streaming.
  const timer=setInterval(()=>{if(document.visibilityState==="visible"){controller.abort();setUpdated(n=>n+1);}},CHECK_MS);
  return ()=>{controller.abort();clearInterval(timer);};
 },[chosen,active,updated]);
 function choose(e){
  e.preventDefault();
  try{const item=parseInstrument(input);setChosen(item.key);setInput(item.key);setQuery("");setSource("");setFlag("");}
  catch{setResult({state:"error",data:null,message:"Enter a supported FX pair or qualified stock/ETF ticker."});}
 }
 const stories=[...(result.data?.stories||[])].sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
 const sources=[...new Set(stories.map(story=>story.source).filter(Boolean))].sort();
 const visible=filterHeadlines(stories,query,source,flag,newsContextFlag);
 function clearFilters(){setQuery("");setSource("");setFlag("");}
 return <section className={styles.tickerNews} aria-label="Ticker news and research" aria-busy={result.state==="loading"}>
  <form onSubmit={choose} className={styles.tickerSearchForm} role="search">
   <label htmlFor={compact?"news-search-sidebar":"news-search-main"} className={styles.srOnly}>Search news ticker</label>
   <input id={compact?"news-search-sidebar":"news-search-main"} aria-label="Search news ticker" type="search" value={input}
    onChange={e=>setInput(e.target.value)} placeholder="Search EURUSD, NASDAQ:AAPL…" list={compact?"ticker-news-sidebar-list":"ticker-news-main-list"} maxLength={24}/>
   <datalist id={compact?"ticker-news-sidebar-list":"ticker-news-main-list"}>
    {watchlist.map(x=><option key={x.key||x} value={x.key||x}/>)}
   </datalist>
   <button type="submit">Search</button>
  </form>
  <div className={styles.tickerNewsStatus} role="status"><strong>{chosen}</strong>
   <small>{result.message}</small>
   <button type="button" disabled={result.state==="loading"} onClick={()=>setUpdated(n=>n+1)} aria-label="Refresh ticker news" title="Check for a newer source snapshot">↻</button>
  </div>
  {result.data?.coverage?<small className={styles.tickerNewsCoverage}>
   Source: latest XMI public snapshot · up to 80 source records. Updated when source data changes; not a real-time exchange feed.
  </small>:null}
  {!compact&&stories.length?<div className={styles.localFilters} role="group" aria-label="Filter loaded headlines">
   <input type="search" aria-label="Filter headline text" placeholder="Filter loaded headlines…" value={query} maxLength={120} onChange={e=>setQuery(e.target.value)}/>
   <select aria-label="Filter news source" value={source} onChange={e=>setSource(e.target.value)}>
    <option value="">All sources</option>{sources.map(name=><option key={name}>{name}</option>)}
   </select>
   <select aria-label="Filter headline language" value={flag} onChange={e=>setFlag(e.target.value)}>
    <option value="">All language flags</option><option value="positive">Positive language</option>
    <option value="negative">Negative language</option><option value="unclear">Impact unclear</option>
   </select>
   <span role="status">{visible.length} / {stories.length} headlines</span>
   {query||source||flag?<button type="button" onClick={clearFilters}>Clear filters</button>:null}
  </div>:null}
  {visible.length?<ul className={styles.tickerNewsStories}>
   {visible.map(story=>{const flag=newsContextFlag(story);return <li key={story.url}>
    <div className={styles.tickerNewsStoryHead}>
     <span className={styles.tickerNewsFlag+" "+styles["tickerFlag"+flag.type]} title={flag.notice}>{flag.label}</span>
     <small>{flag.scope}</small>
    </div>
    <a href={story.url} target="_blank" rel="noopener noreferrer">{story.title}</a>
    <small>{story.source} · {new Date(story.publishedAt).toLocaleString()}</small>
   </li>;})}
  </ul>:result.state==="ready"?<div className={styles.emptyResult}>
   <strong>{stories.length?"No headlines match these filters":"No headlines in this snapshot"}</strong>
   <p>{stories.length?"Try a shorter search or clear the local filters.":"Try another supported ticker or refresh later. Coverage is limited to the latest available source snapshot."}</p>
   {stories.length?<button type="button" onClick={clearFilters}>Clear filters</button>:null}
  </div>:result.state==="error"?<div className={styles.emptyResult}>
   <strong>News snapshot unavailable</strong><p>Try refreshing or searching another supported ticker. Headlines will appear with their source and publication time when available.</p>
  </div>:null}
  <small className={styles.tickerNewsDisclaimer}>Flags describe headline wording, not expected ticker direction, verified impact, or trade advice.</small>
 </section>;
}
