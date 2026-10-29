"use client";
import {useEffect,useState} from "react";
import {replayHistoricalJson} from "../../lib/xmiHistoricalReplay.mjs";
import styles from "./xmi.module.css";

/* Device-memory-only research replay. File bytes never leave this browser. */
export default function XMIHistoricalReplay({symbol,resolution,strategyId,edit}){
 const [source,setSource]=useState("");
 const [filename,setFilename]=useState("");
 const [result,setResult]=useState(null);
 const [error,setError]=useState("");
 useEffect(()=>{setResult(null);setError("");},[symbol,resolution,strategyId,
  edit?.rsiBull,edit?.rsiBear,edit?.requireMacd,edit?.requireVwap]);
 async function receive(event){
  const file=event.target.files?.[0];
  event.target.value="";
  setResult(null);
  if(!file)return;
  if(file.size>900000){setError("Historical JSON exceeds 900 KB");setSource("");setFilename("");return;}
  try{
   const value=await file.text();
   setSource(value);setFilename(file.name.slice(0,100));setError("");
  }catch{setError("Cannot read the selected local file");setSource("");setFilename("");}
 }
 function replay(){
  setResult(null);
  try{
   if(!source)throw Error("Choose a local historical OHLC JSON file first");
   const record=replayHistoricalJson(source,{symbol,resolution,strategyId,edit});
   setResult(record);setError("");
  }catch(e){setError(String(e?.message||"Historical replay failed").slice(0,220));}
 }
 function clear(){setSource("");setFilename("");setResult(null);setError("");}
 return <section className={styles.replayLab} aria-label="Offline historical replay">
  <div className={styles.replayLabHeading}>
   <div><p className={styles.eyebrow}>MILESTONE 2D · DEVICE ONLY</p>
    <h3>Closed-candle historical replay</h3>
    <p>Load 2–400 genuine OHLC candles for {symbol} · {resolution}. Recompute each bar using only candles closed by that moment. No market connection or order execution.</p>
   </div>
   <span>RESEARCH ONLY</span>
  </div>
  <div className={styles.replayLabControls}>
   <label>Local OHLC JSON <input aria-label="Historical replay OHLC JSON" type="file"
    accept=".json,application/json" onChange={receive}/></label>
   <button type="button" onClick={replay} disabled={!source}>Replay closed candles</button>
   <button type="button" onClick={clear} disabled={!source&&!result}>Clear file</button>
  </div>
  <p className={styles.muted}>{filename?"Loaded locally: "+filename:
   "No historical file loaded. This tool does not fetch prices."}</p>
  {error?<p className={styles.replayError} role="alert">{error}</p>:null}
  {result?<div role="status" className={styles.replayResults}>
   <strong>OFFLINE REPLAY · {result.totalBars} closed bars · {result.scored} scored</strong>
   <div className={styles.replayCounts}>
    {Object.entries(result.counts).map(([name,value])=>
     <div key={name}><b>{value}</b><span>{name==="notReady"?"Not ready":name}</span></div>)}
   </div>
   <p>Continuity: {result.gaps.missing} unobserved intervals · {result.gaps.weekendUtcEstimate} estimated UTC-weekend intervals · {result.gaps.unclassified} unclassified. Calendar is heuristic, not an exchange schedule.</p>
   <p>{result.interpretation}</p>
   <div className={styles.replayHistory} role="group" aria-label="Latest historical replay observations">
    {result.observations.slice(-12).map(row=><div key={row.time}>
     <time>{new Date(row.time*1000).toISOString().slice(0,16).replace("T"," ")+" UTC"}</time>
     <span>{row.state}</span>
    </div>)}
   </div>
  </div>:null}
 </section>;
}
