"use client";
import {useEffect,useState} from "react";
import {inspectResearchHoldout} from "../../lib/xmiResearchHoldout.mjs";
import styles from "./xmi.module.css";

/* Nothing persisted or fetched. All provenance is explicitly user-declared. */
export default function XMIResearchHoldout({source,symbol,resolution,analytics,now}){
 const [trainPercent,setTrainPercent]=useState(70);
 const [claimedSource,setClaimedSource]=useState("");
 const [acquiredAt,setAcquiredAt]=useState("");
 const [expectedSHA256,setExpectedSHA256]=useState("");
 const [rights,setRights]=useState("UNSPECIFIED");
 const [result,setResult]=useState(null),[error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 useEffect(()=>{setResult(null);setError("");},[source,symbol,resolution,analytics]);
 async function run(){
  if(busy)return;
  setResult(null);setBusy(true);
  try{
   const data=await inspectResearchHoldout({source,symbol,resolution,analytics,now,
    trainPercent,claimedSource,acquiredAt,expectedSHA256:expectedSHA256.trim(),rights});
   setResult(data);setError("");
  }catch(e){setError(String(e?.message||"Offline review could not be completed").slice(0,220));}
  finally{setBusy(false);}
 }
 return <section className={styles.holdoutLab} role="region"
  aria-label="Offline provenance and chronological holdout">
  <h4>Data provenance & chronological research review</h4>
  <p>Select the chronological partition before running the review. Both research
   versions remain unchanged. This is a <strong>retrospective holdout</strong>,
   not a prospectively unseen or independently preregistered test.</p>
  <div className={styles.researchVersionControls}>
   <label>Earlier historical sample
    <select aria-label="Historical training partition" value={trainPercent}
     onChange={e=>{setTrainPercent(Number(e.target.value));setResult(null);}}>
     <option value={60}>60% earlier / 40% later</option>
     <option value={70}>70% earlier / 30% later</option>
     <option value={80}>80% earlier / 20% later</option>
    </select>
   </label>
   <label>Claimed data source (optional)
    <input aria-label="Claimed historical data source" maxLength={100}
     placeholder="Your declared source, not verified"
     value={claimedSource} onChange={e=>{setClaimedSource(e.target.value);setResult(null);}}/>
   </label>
   <label>Claimed acquisition date (optional)
    <input type="date" aria-label="Claimed data acquisition date" value={acquiredAt}
     onChange={e=>{setAcquiredAt(e.target.value);setResult(null);}}/>
   </label>
   <label>Source permission declaration
    <select aria-label="Historical data usage declaration" value={rights}
     onChange={e=>{setRights(e.target.value);setResult(null);}}>
     <option value="UNSPECIFIED">Not provided</option>
     <option value="USER_ASSERTED_RIGHTS">I assert I may use this file</option>
    </select>
   </label>
  </div>
  <label className={styles.holdoutHashLabel}>Independently retained SHA-256 (optional)
   <input aria-label="External expected dataset SHA-256" maxLength={64} value={expectedSHA256}
    placeholder="64 hexadecimal characters; optional"
    onChange={e=>{setExpectedSHA256(e.target.value);setResult(null);}}/>
  </label>
  <p className={styles.muted}>Provide an expected hash only if you have separately retained it.
   A matching user-entered hash cannot establish market-data provider authenticity.</p>
  <div className={styles.replayLabControls}>
   <button type="button" onClick={run} disabled={busy}>
    {busy?"Reviewing local research":"Review provenance and holdout"}
   </button>
  </div>
  {error?<p role="alert" className={styles.replayError}>{error}</p>:null}
  {result?<div className={styles.holdoutResults} role="group" aria-label="Chronological holdout results">
   <strong>RETROSPECTIVE REVIEW · {result.totalBars} verified-closed imported bars</strong>
   <p>Dataset SHA-256: <code>{result.datasetSHA256}</code></p>
   <p>Expected external hash: <strong>{result.expectedHashCheck}</strong>
    {" · "}Claimed source: {result.provenance.claimedSource}
    {" · "}Provider authenticated: <strong>NO</strong>.</p>
   <p>Earlier sample: {result.train.bars} bars · Later sample: {result.holdout.bars} bars
    {" · "}Cutover: {new Date(result.cutTime*1000).toISOString().slice(0,16).replace("T"," ")} UTC.</p>
   <div className={styles.holdoutPair}>
    {[["Earlier period",result.train],["Later period",result.holdout]].map(([title,part])=>
     <div key={title}>
      <h5>{title}</h5>
      <p>{part.changed} changed classifications ({part.changedPercent}% of observed bars)</p>
      <p>{part.jointlyScored} jointly scored ({part.jointlyScoredPercent}% of observed bars)</p>
      <p>Baseline not ready: {part.baseline.notReady}
       {" · "}Candidate not ready: {part.candidate.notReady}</p>
     </div>)}
   </div>
   <p>Calendar: <strong>UNVERIFIED</strong> · {result.coverage.gapSpans} gap spans,
    {" "+result.coverage.weekendUtcCandidates} UTC-weekend candidates,
    {" "+result.coverage.unexplainedIntervals} other unverified intervals.</p>
   <ul>{result.methodologicalLimits.map((limit,i)=><li key={i}>{limit}</li>)}</ul>
  </div>:null}
 </section>;
}
