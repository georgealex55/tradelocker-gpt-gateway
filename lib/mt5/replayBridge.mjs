/* Offline MT5 export -> existing XMI descriptive replay. No terminal, network, or orders. */
import {createHash} from "node:crypto";
import {validateMt5Manifest,MT5_SOURCE} from "./contract.mjs";
import {importMt5OfflineBars} from "./offlineBars.mjs";
import {replayHistoricalResearch} from "../xmiHistoricalReplay.mjs";
import {FX_RESOLUTIONS} from "../xmiLiveMath.mjs";

const TF=Object.freeze({M1:"1m",M5:"5m",M15:"15m",M30:"30m",H1:"1H",H4:"4H",D1:"1D"});
function fail(code){const e=new Error(code);e.code=code;throw e;}
function timestamp(seconds){
 if(!Number.isSafeInteger(seconds)||seconds<0)fail("MT5_EXPORT_INVALID_SECONDS");
 return new Date(seconds*1000).toISOString().replace(".000Z","Z");
}
/** Python exporter serializes an array of MT5 named dictionaries with integer UTC seconds.
 * A maximum of 400 bars is accepted by existing XMI replay. Larger exports must be
 * explicitly split into independently attested, nonoverlapping windows upstream.
 */
export function adaptMt5ExportBars({manifest,rawPayload}={}){
 const m=validateMt5Manifest(manifest); // window and sealed-year preflight before touching payload
 if(m.kind!=="bars")fail("MT5_EXPORT_BARS_REQUIRED");
 const resolution=TF[manifest.timeframe];
 if(!resolution||!FX_RESOLUTIONS[resolution])fail("MT5_EXPORT_TIMEFRAME_REQUIRED");
 if(typeof rawPayload!=="string"||Buffer.byteLength(rawPayload,"utf8")>32*1024*1024)fail("MT5_EXPORT_TOO_LARGE");
 if(createHash("sha256").update(rawPayload).digest("hex")!==m.sha256)fail("MT5_SOURCE_HASH_MISMATCH");
 let rows;try{rows=JSON.parse(rawPayload);}catch{fail("MT5_EXPORT_INVALID_JSON");}
 if(!Array.isArray(rows)||rows.length<2||rows.length>400||rows.length!==m.rows)fail("MT5_REPLAY_ROW_LIMIT");
 const step=FX_RESOLUTIONS[resolution],start=Date.parse(m.window.from)/1000,end=Date.parse(m.window.to)/1000;
 let last=-1;
 const converted=rows.map(row=>{
  if(!row||typeof row!=="object"||Array.isArray(row))fail("MT5_EXPORT_INVALID_ROW");
  const t=row.time;
  if(!Number.isSafeInteger(t)||t<start||t>=end||t%step!==0||t<=last)fail("MT5_EXPORT_UNORDERED_OR_OUT_OF_WINDOW");
  last=t;
  return {time:timestamp(t),open:row.open,high:row.high,low:row.low,close:row.close,tick_volume:row.tick_volume};
 });
 // Bridge conversion is deterministic, but the source SHA remains the ORIGINAL
 // Python payload hash. The derived hash is solely for the existing bar validator.
 const derived=JSON.stringify(converted);
 const derivedManifest={...manifest,sha256:createHash("sha256").update(derived).digest("hex"),rows:converted.length};
 const imported=importMt5OfflineBars({manifest:derivedManifest,rawRows:derived,resolution,asOf:Date.parse(m.window.to)});
 return Object.freeze({...imported,source:MT5_SOURCE,sourceSha256:m.sha256,
  derivedSha256:derivedManifest.sha256,exportTimeframe:manifest.timeframe,
  provenance:"MT5_LOCAL_EXPORT original payload verified before conversion; offline descriptive replay only"});
}
export function replayMt5Export({manifest,rawPayload,strategyId="day",edit={},indicatorSettings={}}={}){
 const imported=adaptMt5ExportBars({manifest,rawPayload});
 // No P&L or fill simulation: this engine only describes closed-candle states.
 const result=replayHistoricalResearch({bars:imported.bars,resolution:imported.resolution,
  strategyId,edit,indicatorSettings,symbol:imported.symbol,asset:"forex",volumeBasis:"broker-tick"});
 return Object.freeze({...result,provider:"MetaTrader 5",source:MT5_SOURCE,
  sourceSha256:imported.sourceSha256,derivedSha256:imported.derivedSha256,
  readOnly:true,executionEnabled:false,capitalModel:"NOT_APPLICABLE_NO_TRADES",
  validation:"PROVISIONAL_UNRANKED",historicalFillsVerified:false});
}
