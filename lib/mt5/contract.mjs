/* XMI MT5 v1 offline boundary. Pure validation; never opens terminal/network or executes trades. */
export const MT5_CONTRACT_VERSION=1;
export const MT5_SOURCE="MT5_LOCAL_EXPORT";
export const MT5_EXECUTION_ENABLED=false;
export const MT5_SEALED_YEAR=2025;
export const MT5_RESEARCH_YEARS=Object.freeze([2022,2023,2024,2026]);
export const MT5_SEVEN_FX=Object.freeze(["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD"]);
const HEX64=/^[0-9a-f]{64}$/i;
const SYMBOL=/^[A-Za-z0-9_.#-]{1,32}$/;
const ALLOWED=Object.freeze(new Set(["bars","ticks","symbol_info","account_snapshot","orders","positions","deals"]));
function fail(code){const e=new Error(code);e.code=code;throw e;}
export function assertMt5ResearchWindow({from,to}={}){
  if(typeof from!=="string"||typeof to!=="string"||!/Z$/.test(from)||!/Z$/.test(to))fail("MT5_EXPLICIT_UTC_REQUIRED");
  const start=Date.parse(from),end=Date.parse(to);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end)fail("MT5_INVALID_WINDOW");
  const firstYear=new Date(start).getUTCFullYear(),lastYear=new Date(end-1).getUTCFullYear();
  // Reject any span crossing sealed year, even if the supplied data appears empty there.
  if(firstYear<=MT5_SEALED_YEAR&&lastYear>=MT5_SEALED_YEAR)fail("MT5_SEALED_2025_WINDOW");
  if(!MT5_RESEARCH_YEARS.includes(firstYear)||!MT5_RESEARCH_YEARS.includes(lastYear))fail("MT5_YEAR_NOT_APPROVED");
  return Object.freeze({from:new Date(start).toISOString(),to:new Date(end).toISOString()});
}
export function validateMt5Manifest(input){
  if(!input||typeof input!=="object"||Array.isArray(input))fail("MT5_INVALID_MANIFEST");
  if(input.contractVersion!==MT5_CONTRACT_VERSION||input.source!==MT5_SOURCE)fail("MT5_SOURCE_MISMATCH");
  if(input.readOnly!==true||input.executionEnabled!==false)fail("MT5_EXECUTION_FORBIDDEN");
  if(!ALLOWED.has(input.kind))fail("MT5_UNSUPPORTED_KIND");
  if(typeof input.symbol!=="string"||!SYMBOL.test(input.symbol))fail("MT5_INVALID_SYMBOL");
  if(typeof input.sha256!=="string"||!HEX64.test(input.sha256))fail("MT5_MISSING_SOURCE_HASH");
  if(typeof input.exportedAt!=="string"||!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(input.exportedAt)||!Number.isFinite(Date.parse(input.exportedAt)))fail("MT5_INVALID_EXPORT_TIME");
  const window=assertMt5ResearchWindow(input.window);
  if(!["UTC","Etc/UTC"].includes(input.timezone))fail("MT5_UTC_REQUIRED");
  if(input.rows!=null&&(!Number.isSafeInteger(input.rows)||input.rows<0||input.rows>1000000))fail("MT5_INVALID_ROW_COUNT");
  return Object.freeze({contractVersion:1,source:MT5_SOURCE,readOnly:true,executionEnabled:false,
    kind:input.kind,symbol:input.symbol,sha256:input.sha256.toLowerCase(),
    exportedAt:input.exportedAt,timezone:"UTC",window,rows:input.rows??null});
}
export function mt5Unavailable(reason="MT5_LOCAL_EXPORT_NOT_CONFIGURED"){
  return Object.freeze({ok:false,readOnly:true,provider:"MetaTrader 5",source:MT5_SOURCE,
    executionEnabled:false,status:"UNAVAILABLE",reason});
}
export function assertMt5OfflineOnly({provider,source,mode}={}){
  if(provider!=="MetaTrader 5"||source!==MT5_SOURCE||mode!=="OFFLINE_HISTORICAL_RESEARCH")
    fail("MT5_UNSAFE_PROVIDER_MODE");
  return true;
}
