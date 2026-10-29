"use client";
import {useState} from "react";
import styles from "./xmi.module.css";
import {STRATEGIES,snapshotSummary} from "../../lib/xmiStrategyPresets.mjs";
export default function XMIStrategyEngine({strategyId,report,symbol,resolution,compact=false}){
 const [busy,setBusy]=useState(false),[summary,setSummary]=useState(""),[message,setMessage]=useState("");
 const name=STRATEGIES.find(s=>s.id===strategyId)?.name||"No preset selected";
 const rows=["Bullish trend","Mixed trend","Bearish trend"];
 const cols=["Bearish momentum","Neutral momentum","Bullish momentum"];
 const active=report?.ready?report.zone:null;
 async function snapshot(){
  if(busy)return;
  const text=snapshotSummary(strategyId,report,symbol,resolution);
  setSummary(text);setMessage("Snapshot summary generated from available closed-candle values.");
  if(!navigator.mediaDevices?.getDisplayMedia){
   setMessage("Text summary available. Screen capture requires a browser with screen-share permission.");
   return;
  }
  setBusy(true);let stream;
  try{
   // Screen sharing requires a direct user gesture and an explicit browser permission.
   stream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:"browser"},audio:false});
   const video=document.createElement("video");video.srcObject=stream;video.muted=true;
   await video.play();
   if(!video.videoWidth||!video.videoHeight)throw Error("No video frame available");
   const canvas=document.createElement("canvas");
   canvas.width=Math.min(video.videoWidth,1920);
   canvas.height=Math.round(video.videoHeight*canvas.width/video.videoWidth);
   canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);
   const data=canvas.toDataURL("image/png");
   const link=document.createElement("a");link.href=data;link.download="xmi-screen-snapshot.png";link.click();
   setMessage("Captured the screen you explicitly selected; image stayed in your browser. Summary is below.");
  }catch{
   setMessage("Screen capture canceled or unsupported; the verified-data text summary is still available.");
  }finally{stream?.getTracks().forEach(t=>t.stop());setBusy(false);}
 }
 return <section className={styles.strategyEngine} aria-label="Research strategy engine">
  <div className={styles.strategyEngineHead}>
   <div><strong>{name}</strong><small>Closed-candle indicator alignment · visualization only</small></div>
   <span className={styles.engineReadiness}>{report?.state||"UNAVAILABLE"}</span>
  </div>
  <div className={styles.strategyMatrix}>
   {Array.from({length:9},(_,i)=><div key={i}
    className={styles.strategyCell+(active===i?" "+styles.strategyCellActive:"")}
    aria-label={rows[Math.floor(i/3)]+"; "+cols[i%3]+(active===i?"; current research state":"")}
    aria-current={active===i?"true":undefined}>
    <span>{i===4?"●":i%3===1?"·":i<3?"↗":i>5?"↘":"↔"}</span>
   </div>)}
  </div>
  <p className={styles.strategyStatus}>{report?.summary||"Waiting for verified candle evidence."}</p>
  <p className={styles.strategyNote}>Top = bullish trend, bottom = bearish trend; left = bearish momentum, right = bullish momentum. Position is descriptive, not a buy/sell timing signal.</p>
  {!compact&&report?.inputs?.length?<div className={styles.strategyInputs}>
   {report.inputs.map(x=><span key={x.name}>{x.name}: {x.value===null?"N/A":x.value>0?"positive":x.value<0?"negative":"neutral"}</span>)}
  </div>:null}
  <div className={styles.strategySnap}>
   <button type="button" disabled={busy} onClick={snapshot}>{busy?"Capturing…":"Snapshot screen & summarize"}</button>
   {message?<small role="status">{message}</small>:null}
  </div>
  {summary?<pre className={styles.strategySummary}>{summary}</pre>:null}
  <small className={styles.strategyNote}>No orders, entries, targets, stops, fill simulations or predictive win rates are generated.</small>
 </section>;
}
