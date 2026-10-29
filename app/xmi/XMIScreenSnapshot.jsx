"use client";
import {useState} from "react";
import styles from "./xmi.module.css";
import {snapshotSummary} from "../../lib/xmiStrategyPresets.mjs";
export default function XMIScreenSnapshot({strategyId,report,symbol,resolution,patternCount=0,structureCount=0}){
 const [status,setStatus]=useState(""),[summary,setSummary]=useState(""),[busy,setBusy]=useState(false);
 async function snapshot(){
  if(busy)return;
  const lines=[snapshotSummary(strategyId,report,symbol,resolution),
   "Confirmed chart pattern observations: "+patternCount,
   "Enabled market-structure concepts: "+structureCount,
   "Snapshot analysis uses chart data, not image interpretation. Display content outside these tracked inputs is not analyzed."];
  setSummary(lines.join("\n"));
  if(!navigator.mediaDevices?.getDisplayMedia){
   setStatus("Research summary ready. This browser cannot capture the screen.");
   return;
  }
  setBusy(true);let stream;
  try{
   stream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:"browser"},audio:false});
   const track=stream.getVideoTracks()[0];
   const video=document.createElement("video");video.muted=true;video.srcObject=stream;
   await video.play();
   if(!video.videoWidth||!video.videoHeight)throw Error("No video frame returned");
   const canvas=document.createElement("canvas");
   const ratio=Math.min(1,1920/video.videoWidth);
   canvas.width=Math.round(video.videoWidth*ratio);
   canvas.height=Math.round(video.videoHeight*ratio);
   canvas.getContext("2d").drawImage(video,0,0,canvas.width,canvas.height);
   const link=document.createElement("a");link.download="xmi-chart-snapshot.png";
   link.href=canvas.toDataURL("image/png");link.click();
   setStatus("Selected screen captured locally. Chart-data summary shown below.");
  }catch{setStatus("Capture canceled or unavailable; chart-data summary remains below.");}
  finally{stream?.getTracks().forEach(track=>track.stop());setBusy(false);}
 }
 return <section className={styles.xmiSideSnapshot} aria-label="Screen snapshot research">
  <h3>Snapshot & analysis</h3>
  <p>Summarize the current ticker, closed-candle strategy state, patterns, and structure. Optionally capture your selected screen as an image.</p>
  <button type="button" disabled={busy} onClick={snapshot}>{busy?"Capturing…":"Snapshot screen & summarize"}</button>
  {status?<small role="status">{status}</small>:null}
  {summary?<pre className={styles.xmiSnapshotText}>{summary}</pre>:null}
  <small>No screenshot is uploaded or machine-analyzed. The analysis uses current chart data only.</small>
 </section>;
}
