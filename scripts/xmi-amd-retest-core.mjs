/**
 * Causal accumulation -> liquidity sweep -> displacement -> retest detector.
 * Research-only. Bid OHLC five-minute bars, closed-candle signals, next-bar entry.
 * No 2025 holdout access and no future-bar feature inputs.
 */
export const SYMBOLS=["EURUSD","GBPUSD","USDJPY","USDCHF","AUDUSD","USDCAD","NZDUSD","XAUUSD"];
export const STEP_MS=300000;
export function localTime(t,zone="Europe/London"){
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(t);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return {day:p.year+"-"+p.month+"-"+p.day,hour:Number(p.hour),minute:Number(p.minute)};
}
export function checkBars(input){
  if(!Array.isArray(input)||!input.length)throw Error("Five-minute bid OHLC bars required");
  let last=-1;
  return input.map((v,i)=>{
    const t=typeof v.t==="number"?v.t:Date.parse(v.t);
    if(!Number.isFinite(t)||t%STEP_MS!==0||t<=last)throw Error("Invalid time ordering at row "+i);
    if(new Date(t).getUTCFullYear()<2022||new Date(t).getUTCFullYear()>=2025)
      throw Error("2025 sealed holdout (or unregistered year) prohibited");
    const [o,h,l,c]=["o","h","l","c"].map(k=>Number(v[k]));
    if(![o,h,l,c].every(x=>Number.isFinite(x)&&x>0)||h<Math.max(o,c)||l>Math.min(o,c))
      throw Error("Invalid bid OHLC at "+i);
    last=t;return {t,o,h,l,c};
  });
}
export function consecutive(bars,start,end){
  if(start<0||end>bars.length)return false;
  for(let i=start+1;i<end;i++)if(bars[i].t-bars[i-1].t!==STEP_MS)return false;
  return true;
}
function range(bars,a,b) {
  let hi=-Infinity,lo=Infinity;
  for(let i=a;i<b;i++){hi=Math.max(hi,bars[i].h);lo=Math.min(lo,bars[i].l);}
  return {high:hi,low:lo,mid:(hi+lo)/2};
}
function priorATR(bars,i,n=14){
  if(i<n||!consecutive(bars,i-n,i+1))return null;
  let x=0;
  for(let j=i-n;j<i;j++){
    const p=j?bars[j-1].c:bars[j].o,b=bars[j];
    x+=Math.max(b.h-b.l,Math.abs(b.h-p),Math.abs(b.l-p));
  }
  return x/n;
}
export function detectAMDRetest(raw,settings={}){
  const bars=checkBars(raw);
  const rangeModel=settings.rangeModel||"rolling";
  const entryModel=settings.entryModel||"range_reclaim_retest";
  if(!["rolling","session_asia_london"].includes(rangeModel)||!["range_reclaim_retest","mss_fvg_retest"].includes(entryModel))
    throw Error("Unregistered AMD configuration");
  const signals=[],stats={rangeOpportunities:0,sweeps:0,displacements:0,retests:0,expired:0,gaps:0};
  let session={day:"",high:-Infinity,low:Infinity,n:0,valid:true,first:null,last:null},p=null;
  for(let i=0;i<bars.length;i++){
    const b=bars[i],clock=localTime(b.t);
    if(clock.day!==session.day){
      session={day:clock.day,high:-Infinity,low:Infinity,n:0,valid:true,first:null,last:null};p=null;
    }
    if(i&&b.t-bars[i-1].t!==STEP_MS&&clock.hour<6&&session.n>0)session.valid=false;
    if(clock.hour<6){
      if(session.n===0)session.first=clock.hour*60+clock.minute;
      session.last=clock.hour*60+clock.minute;
      session.high=Math.max(session.high,b.h);session.low=Math.min(session.low,b.l);session.n++;
    }
    if(i&&b.t-bars[i-1].t!==STEP_MS){stats.gaps++;p=null;}
    const atr=priorATR(bars,i);
    if(!atr||!Number.isFinite(atr))continue;
    if(p){
      const age=i-p.sweepIndex;
      if(age>20){p=null;stats.expired++;continue;}
      if(p.confirmIndex==null&&age>=1&&age<=8){
        const body=p.direction*(b.c-b.o);
        if(body>=.35*atr){
          if(entryModel==="range_reclaim_retest"&&p.direction*(b.c-p.region.mid)>0){
            p.confirmIndex=i;p.level=p.region.mid;stats.displacements++;
          }else if(entryModel==="mss_fvg_retest"&&i>=3){
            const old=range(bars,i-3,i),d=p.direction;
            const broke=d===1?b.c>old.high:b.c<old.low;
            const hasGap=d===1?b.l>bars[i-2].h:b.h<bars[i-2].l;
            if(broke&&hasGap){
              p.confirmIndex=i;p.level=d===1?(bars[i-2].h+b.l)/2:(bars[i-2].l+b.h)/2;
              stats.displacements++;
            }
          }
        }
      }else if(p.confirmIndex!=null&&i>p.confirmIndex&&i-p.confirmIndex<=12){
        const d=p.direction,tol=.1*atr;
        const touched=d===1?b.l<=p.level+tol:b.h>=p.level-tol;
        if(touched&&d*(b.c-p.level)>0&&i+1<bars.length&&bars[i+1].t-b.t===STEP_MS){
          signals.push({entryIndex:i+1,signalIndex:i,sweepIndex:p.sweepIndex,
            confirmIndex:p.confirmIndex,direction:d,rangeModel,entryModel,
            rangeHigh:p.region.high,rangeLow:p.region.low,
            retestLevel:p.level,sweepExtreme:p.extreme,atrAtRetest:atr});
          stats.retests++;p=null;
        }
      }
      continue;
    }
    if(clock.hour<6)continue;
    let region=null;
    if(rangeModel==="session_asia_london"){
      if(!session.valid||session.n!==72||session.first!==0||session.last!==355||clock.hour<7||clock.hour>=16)continue;
      region={high:session.high,low:session.low,mid:(session.high+session.low)/2};
      if(region.high-region.low>10*atr)continue;
    }else{
      if(i<12||!consecutive(bars,i-12,i+1))continue;
      region=range(bars,i-12,i);
      if(region.high-region.low>5*atr)continue;
    }
    stats.rangeOpportunities++;
    const down=b.l<region.low-.1*atr&&b.c>region.low&&b.c<region.high;
    const up=b.h>region.high+.1*atr&&b.c<region.high&&b.c>region.low;
    if(down===up)continue;
    p={sweepIndex:i,direction:down?1:-1,extreme:down?b.l:b.h,region,confirmIndex:null,level:null};
    stats.sweeps++;
  }
  return {signals,stats,sourceBarCount:bars.length,phaseSequence:["accumulation","sweep","displacement","retest"],hasLookahead:false};
}
