/* Browser-only XMI coaching journal: one trade per row, never broker fills.
 * This module neither imports TradeLocker code nor sends data to any server.
 */
const MAX_BYTES=2_000_000,MAX_ROWS=5000;
export function parseCSV(value){
 if(typeof value!=="string"||value.length>MAX_BYTES)throw Error("CSV must be 2 MB or less");
 const source=value.replace(/^\uFEFF/,"");let field="",row=[],rows=[],quoted=false;
 for(let i=0;i<source.length;i++){
  const c=source[i];
  if(quoted){
   if(c==='"'&&source[i+1]==='"'){field+='"';i++;}
   else if(c==='"')quoted=false;else field+=c;
  }else if(c==='"'){if(field)throw Error("Malformed quoted field");quoted=true;}
  else if(c===","){row.push(field);field="";}
  else if(c==="\r"||c==="\n"){
   if(c==="\r"&&source[i+1]==="\n")i++;
   row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field="";
   if(rows.length>MAX_ROWS+1)throw Error("Too many CSV rows");
  }else field+=c;
 }
 if(quoted)throw Error("Unclosed CSV quote");
 row.push(field);if(row.some(v=>v.trim()))rows.push(row);
 if(rows.length>MAX_ROWS+1)throw Error("Too many CSV rows");
 return rows;
}
function iso(value,required=false){
 if(!String(value||"").trim()){if(required)throw Error("Entry time is required");return null;}
 if(!/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d(?::\d\d(?:\.\d+)?)?(Z|[+-]\d\d:\d\d)$/.test(String(value)))
  throw Error("Times must have an ISO timezone, e.g. 2026-10-28T14:30:00Z");
 const time=Date.parse(value);if(!Number.isFinite(time))throw Error("Invalid trade time");
 return new Date(time).toISOString();
}
function positive(v,label,required=false){
 if(v===null||v===undefined||String(v).trim()===""){if(required)throw Error(label+" is required");return null;}
 const n=Number(v);if(!Number.isFinite(n)||n<=0)throw Error(label+" must be positive");return n;
}
function flag(v){
 if(v===null||v===undefined||String(v).trim()==="")return null;
 if(/^(yes|true|1|y)$/i.test(String(v).trim()))return true;
 if(/^(no|false|0|n)$/i.test(String(v).trim()))return false;
 throw Error("Rule annotations must be yes/no or blank");
}
export function normalizeTrade(raw){
 const symbol=String(raw?.symbol||"").trim().toUpperCase();
 const side=String(raw?.side||"").trim().toUpperCase();
 if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol))throw Error("Invalid stock/ETF ticker");
 if(!["LONG","SHORT"].includes(side))throw Error("Use LONG or SHORT, not raw BUY/SELL fills");
 const entry_time=iso(raw.entry_time,true),exit_time=iso(raw.exit_time);
 const entry_price=positive(raw.entry_price,"Entry price",true);
 const exit_price=positive(raw.exit_price,"Exit price");
 const quantity=positive(raw.quantity,"Shares",true);
 if(Boolean(exit_time)!==Boolean(exit_price))throw Error("Completed trades require exit time AND price");
 if(exit_time&&Date.parse(exit_time)<Date.parse(entry_time))throw Error("Exit before entry");
 const setup=String(raw.setup||"").trim().slice(0,80);
 const notes=String(raw.notes||"").trim().slice(0,2000);
 const confirmed=flag(raw.confirmed),followed_plan=flag(raw.followed_plan);
 const chased=flag(raw.chased),moved_stop=flag(raw.moved_stop);
 const pnl=exit_price===null?null:Math.round((exit_price-entry_price)*quantity*(side==="LONG"?1:-1)*100)/100;
 return {symbol,side,entry_time,entry_price,exit_time,exit_price,quantity,setup,notes,
  confirmed,followed_plan,chased,moved_stop,pnl};
}
const columns=["symbol","side","entry_time","entry_price","quantity"];
const names={ticker:"symbol",direction:"side",entry_date:"entry_time",exit_date:"exit_time",qty:"quantity",shares:"quantity",strategy:"setup"};
export function importTrades(csv){
 const rows=parseCSV(csv);if(!rows.length)throw Error("Empty CSV");
 const keys=rows[0].map(x=>String(x).trim().toLowerCase().replace(/[\s-]+/g,"_")).map(x=>names[x]||x);
 for(const field of columns)if(!keys.includes(field))throw Error("Missing CSV column "+field);
 const trades=[],errors=[];
 for(let i=1;i<rows.length;i++){
  try{
   const obj={};
   keys.forEach((key,j)=>{if(obj[key]===undefined)obj[key]=rows[i][j]??"";});
   trades.push(normalizeTrade(obj));
  }catch(e){errors.push({row:i+1,reason:e.message});}
 }
 return {trades,errors,total:rows.length-1};
}
export function fingerprint(t){return [t.symbol,t.side,t.entry_time,t.entry_price,t.quantity,t.exit_time||""].join("|");}
export function coachSummary(rows){
 const trades=Array.isArray(rows)?rows:[];
 const completed=trades.filter(x=>Number.isFinite(x.pnl));
 const alerts=[],assessed=[];
 for(const t of trades){
  if(t.followed_plan===false)alerts.push({symbol:t.symbol,at:t.entry_time,note:"Marked off-plan"});
  if(t.chased===true)alerts.push({symbol:t.symbol,at:t.entry_time,note:"Marked chasing entry"});
  if(t.moved_stop===true)alerts.push({symbol:t.symbol,at:t.entry_time,note:"Marked moving stop"});
  if(t.confirmed===false)alerts.push({symbol:t.symbol,at:t.entry_time,note:"Marked unconfirmed entry"});
  for(const key of ["followed_plan","confirmed"])
   if(typeof t[key]==="boolean")assessed.push(t[key]);
  for(const key of ["chased","moved_stop"])
   if(typeof t[key]==="boolean")assessed.push(!t[key]);
 }
 const totalPnl=completed.reduce((s,t)=>s+t.pnl,0);
 return {trades:trades.length,completed:completed.length,
  winRate:completed.length?Math.round(completed.filter(t=>t.pnl>0).length/completed.length*1000)/10:null,
  pnl:Math.round(totalPnl*100)/100,
  observedChecks:assessed.length,
  consistency:assessed.length?Math.round(assessed.filter(Boolean).length/assessed.length*100):null,
  alerts:alerts.slice(-20).reverse()};
}
