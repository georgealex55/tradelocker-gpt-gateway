/* Offline MT5 capability audit. Reads only the public capability ledger; never market/trade data. */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const EXPECTED=Object.freeze(["terminal_status","account_snapshot","symbol_catalog","quotes","ticks","candles","market_depth","market_sessions","order_book_read","positions_read","deals_history","profit_margin_calcs","volume_margin_rules","trade_action_schema","execution_preflight","risk_engine","reconciliation","indicators_builtin","indicators_custom","charting","drawing_objects","signals_alerts","expert_advisors","strategy_tester","optimization","custom_symbols","economic_calendar","trade_journal","multi_account","multi_broker","local_bridge","quality_security","holdout_guard","broker_gate"]);
const STATUSES=new Set(['verified','implemented_unverified','blocked_external','deferred','not_implemented']);
export function auditMt5Capabilities(matrix){
 if(!matrix||!Array.isArray(matrix.capabilities))throw Error('MT5_MATRIX_REQUIRED');
 const seen=new Set(),counts=Object.fromEntries([...STATUSES].map(s=>[s,0]));
 for(const c of matrix.capabilities){
  if(!EXPECTED.includes(c.id)||seen.has(c.id))throw Error('MT5_MATRIX_UNKNOWN_OR_DUPLICATE:'+c.id);
  seen.add(c.id);
  if(!STATUSES.has(c.status))throw Error('MT5_MATRIX_INVALID_STATUS:'+c.id);
  if(c.status==='verified'&&(!Array.isArray(c.acceptance_evidence)||c.acceptance_evidence.length===0))throw Error('MT5_MATRIX_UNSUPPORTED_VERIFICATION:'+c.id);
  counts[c.status]++;
 }
 if(seen.size!==EXPECTED.length)throw Error('MT5_MATRIX_INCOMPLETE:'+EXPECTED.filter(id=>!seen.has(id)).join(','));
 return Object.freeze({schema_version:1,feature_count:EXPECTED.length,counts,features:matrix.capabilities.map(c=>({id:c.id,status:c.status,priority:c.priority,evidence_count:c.acceptance_evidence?.length??0,limitations:c.limitations??[]})),execution_enabled:false,broker_connected:false,holdout_2025_read:false});
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const path=process.argv[2]??'docs/research/MT5_FULL_PLATFORM_CAPABILITY_MATRIX_2026-11-12.json';
 process.stdout.write(JSON.stringify(auditMt5Capabilities(JSON.parse(readFileSync(path,'utf8'))),null,2)+'\n');
}
