import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {MAJORS} from './registry.mjs';
import {FXCM_ARCHIVE_KIND,verifyDataset} from './data.mjs';

const ARCHIVE_ORIGIN='https://candledata.fxcorporate.com';
const ARCHIVE_YEAR=2026;
const FIRST_WEEK=36;
const WEEK_COUNT=8;
const HOURS_PER_WEEK=120;
const WINDOW_START=Date.UTC(ARCHIVE_YEAR,8,6,21)/1000;
const MAX_COMPRESSED_BYTES=32*1024;
const CSV_HEADER='DateTime,BidOpen,BidHigh,BidLow,BidClose,AskOpen,AskHigh,AskLow,AskClose';

function parseHour(value){
 const parts=/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):00:00\.000$/.exec(value);
 if(!parts)throw Error('ARCHIVE_INVALID_TIMESTAMP');
 const [,month,day,year,hour]=parts;
 const iso=`${year}-${month}-${day}T${hour}:00:00.000Z`;
 const ms=Date.parse(iso);
 if(!Number.isFinite(ms)||new Date(ms).toISOString()!==iso)throw Error('ARCHIVE_INVALID_TIMESTAMP');
 return ms/1000;
}

function parseWeek(compressed,week){
 let csv;
 try{csv=gunzipSync(compressed,{maxOutputLength:64*1024}).toString('utf8');}
 catch{throw Error('ARCHIVE_INVALID_GZIP');}
 const [header,...rows]=csv.replace(/^\uFEFF/,'').trimEnd().split(/\r?\n/);
 if(header!==CSV_HEADER||!rows.length||rows.length>168)throw Error('ARCHIVE_INVALID_CSV');
 // All eight weeks precede the November New York clock change.
 const earliest=WINDOW_START+(week-FIRST_WEEK)*7*86400;
 const latest=earliest+HOURS_PER_WEEK*3600;
 const bars=[];
 let crossedRows=0;
 for(const row of rows){
  const fields=row.split(',');
  if(fields.length!==9||fields.slice(1).some(field=>!/^\d+(?:\.\d+)?$/.test(field)))throw Error('ARCHIVE_INVALID_CSV');
  const time=parseHour(fields[0]);
  if(time<earliest||time>=latest)throw Error('ARCHIVE_WEEK_MISMATCH');
  const [open,high,low,close,askOpen,askHigh,askLow,askClose]=fields.slice(1).map(Number);
  if(![askOpen,askHigh,askLow,askClose].every(p=>Number.isFinite(p)&&p>0)||askHigh<Math.max(askOpen,askClose)||askLow>Math.min(askOpen,askClose))throw Error('ARCHIVE_INVALID_ASK');
  if(open>askOpen||high>askHigh||low>askLow||close>askClose)crossedRows++;
  bars.push({time,open,high,low,close,closed:true});
 }
 return {bars,crossedRows};
}

async function readWeek(symbol,week,fetchImpl){
 const url=new URL(`/H1/${symbol}/${ARCHIVE_YEAR}/${week}.csv.gz`,ARCHIVE_ORIGIN);
 let response;
 try{response=await fetchImpl(url,{method:'GET',headers:{accept:'application/gzip, */*'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(9000)});}
 catch{throw Error('ARCHIVE_UNAVAILABLE');}
 if(!response.ok){await response.body?.cancel();throw Error(response.status===429?'ARCHIVE_QUOTA':'ARCHIVE_UNAVAILABLE');}
 if(!response.body)throw Error('ARCHIVE_UNAVAILABLE');
 const chunks=[];
 let size=0;
 for await(const chunk of response.body){
  size+=chunk.byteLength;
  if(size>MAX_COMPRESSED_BYTES)throw Error('ARCHIVE_FILE_TOO_LARGE');
  chunks.push(chunk);
 }
 const compressed=Buffer.concat(chunks);
 return {...parseWeek(compressed,week),file:{week,url:url.href,sha256:createHash('sha256').update(compressed).digest('hex')}};
}

export async function fetchFxcmArchive(symbol,{fetchImpl=fetch,now=Date.now()}={}){
 if(!MAJORS.includes(symbol))throw Error('ARCHIVE_INVALID_PAIR');
 const files=[];
 for(let offset=0;offset<WEEK_COUNT;offset+=4){
  const batch=Array.from({length:4},(_,i)=>readWeek(symbol,FIRST_WEEK+offset+i,fetchImpl));
  files.push(...await Promise.all(batch));
 }
 const source={kind:FXCM_ARCHIVE_KIND,files:files.map(file=>file.file),crossedRows:files.reduce((count,file)=>count+file.crossedRows,0)};
 const dataset=verifyDataset(files.flatMap(file=>file.bars),{symbol,timeframe:'1H',provider:'FXCM archive',acquiredAt:now,source});
 if(dataset.depth!==WEEK_COUNT*HOURS_PER_WEEK)throw Error('ARCHIVE_INCOMPLETE_WINDOW');
 return dataset;
}
