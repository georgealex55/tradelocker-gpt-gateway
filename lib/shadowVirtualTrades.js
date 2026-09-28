import { dbQuery, tradeStateDbEnabled } from "./db";
import { fetchTradeLockerHistory } from "./marketData";

const M15 = 15 * 60 * 1000;
const ACTIVE = new Set(["PENDING_ENTRY","OPEN"]);

function finite(value){
  const n=Number(value);
  return Number.isFinite(n)?n:null;
}
function pnlUsd({side,entry,exit,units,accountCurrency,baseCurrency,quotingCurrency}){
  const move=side==="LONG"?exit-entry:entry-exit;
  const quotePnl=move*units;
  if(accountCurrency===quotingCurrency) return quotePnl;
  if(accountCurrency===baseCurrency && exit>0) return quotePnl/exit;
  return null;
}

export function evaluateVirtualTradeCandles({
  trade,
  candles,
  pipSize,
  accountCurrency="USD",
  baseCurrency="USD",
  quotingCurrency="CHF"
}){
  const out={...trade};
  let state=String(out.state||"PENDING_ENTRY");
  const side=String(out.side||"").toUpperCase();
  const stop=finite(out.stop_loss ?? out.stopLoss);
  const targetR=finite(out.target_r ?? out.targetR) ?? 1.8;
  const units=finite(out.units) ?? 1000;
  const signalTime=Number(out.signal_time ?? out.signalTime);
  let entry=finite(out.entry_price ?? out.entryPrice);
  let entryTime=out.entry_time==null?null:Number(out.entry_time);
  let takeProfit=finite(out.take_profit ?? out.takeProfit);
  let last=out.last_candle_time==null?null:Number(out.last_candle_time);
  let mfe=finite(out.mfe_pips) ?? 0;
  let mae=finite(out.mae_pips) ?? 0;

  const rows=[...(candles||[])].sort((a,b)=>Number(a.time)-Number(b.time));
  const expectedEntry=signalTime+M15;

  for(const candle of rows){
    const t=Number(candle.time);
    if(last!=null && t<=last) continue;

    if(state==="PENDING_ENTRY"){
      if(t<expectedEntry) continue;
      if(t>expectedEntry){
        return {...out,state:"SKIPPED",outcome:"MISSING_ENTRY_BAR",closed_at:new Date().toISOString(),last_candle_time:last};
      }
      entry=Number(candle.open);
      if(!(entry>0) || !(stop>0) || (side==="LONG" ? stop>=entry : stop<=entry)){
        return {...out,state:"SKIPPED",outcome:"ENTRY_GAP_INVALIDATED",entry_time:t,entry_price:entry,closed_at:new Date().toISOString(),last_candle_time:t};
      }
      entryTime=t;
      const distance=Math.abs(entry-stop);
      takeProfit=side==="LONG"?entry+targetR*distance:entry-targetR*distance;
      state="OPEN";
    }

    if(state!=="OPEN" || entry==null || takeProfit==null) continue;

    const high=Number(candle.high),low=Number(candle.low);
    const favPips=side==="LONG"?(high-entry)/pipSize:(entry-low)/pipSize;
    const advPips=side==="LONG"?(entry-low)/pipSize:(high-entry)/pipSize;
    mfe=Math.max(mfe,Number.isFinite(favPips)?favPips:0);
    mae=Math.max(mae,Number.isFinite(advPips)?advPips:0);

    const stopHit=side==="LONG"?low<=stop:high>=stop;
    const targetHit=side==="LONG"?high>=takeProfit:low<=takeProfit;
    last=t;

    if(stopHit || targetHit){
      const outcome=stopHit?"STOP":"TARGET";
      const exit=stopHit?stop:takeProfit;
      const riskDistance=Math.abs(entry-stop);
      const rMultiple=stopHit?-1:targetR;
      const riskAmount=accountCurrency===quotingCurrency
        ? riskDistance*units
        : accountCurrency===baseCurrency && entry>0
          ? riskDistance*units/entry
          : null;
      return {
        ...out,state:"CLOSED",outcome,
        entry_time:entryTime,entry_price:entry,stop_loss:stop,take_profit:takeProfit,
        exit_time:t,exit_price:exit,r_multiple:rMultiple,
        pnl_usd:pnlUsd({side,entry,exit,units,accountCurrency,baseCurrency,quotingCurrency}),
        risk_amount_usd:riskAmount,mfe_pips:mfe,mae_pips:mae,last_candle_time:last,
        closed_at:new Date().toISOString()
      };
    }
  }

  return {
    ...out,state,entry_time:entryTime,entry_price:entry,stop_loss:stop,take_profit:takeProfit,
    mfe_pips:mfe,mae_pips:mae,last_candle_time:last
  };
}

export async function captureVirtualSignal({signal,riskEstimate,sizing}){
  if(!tradeStateDbEnabled() || !signal || signal.status!=="SIGNAL_READY") return {created:false,reason:"NOT_SIGNAL_READY"};
  if(!["BUY","SELL"].includes(signal.action)) return {created:false,reason:"NO_ACTION"};
  if(riskEstimate?.tradeableWithinBudget===false) return {created:false,reason:"RISK_BUDGET"};
  const active=await dbQuery(
    `select * from shadow_virtual_trades
     where strategy=$1 and strategy_version=$2 and symbol=$3
       and state in ('PENDING_ENTRY','OPEN')
     order by signal_time desc limit 1`,
    [signal.strategy,signal.version,signal.symbol]
  );
  if(active?.[0]) return {created:false,reason:"ACTIVE_VIRTUAL_TRADE",trade:active[0]};

  const lots=finite(sizing?.minLot);
  const units=lots!=null?lots*Number(sizing?.lotSize):null;
  const rows=await dbQuery(
    `insert into shadow_virtual_trades(
      strategy,strategy_version,symbol,signal_time,side,state,
      signal_reference_entry,stop_loss,target_r,lots,units,pip_size,risk_percent
    ) values($1,$2,$3,$4,$5,'PENDING_ENTRY',$6,$7,$8,$9,$10,$11,$12)
    on conflict(strategy,strategy_version,symbol,signal_time) do nothing
    returning *`,
    [
      signal.strategy,signal.version,signal.symbol,Number(signal.time),signal.side,
      signal.referenceEntry,signal.stopLoss,signal.targetR,lots,units,sizing?.pipSize,
      riskEstimate?.riskPercent ?? null
    ]
  );
  return {created:Boolean(rows?.[0]),reason:rows?.[0]?null:"DUPLICATE_SIGNAL",trade:rows?.[0]||null};
}

export async function reconcileVirtualTrades({instrument,sizing,throughTime}){
  if(!tradeStateDbEnabled()) return {updated:0,active:0};
  const active=await dbQuery(
    `select * from shadow_virtual_trades
     where strategy='forex-trend-pullback-v2-shadow'
       and strategy_version='2.0.0-shadow'
       and symbol='USDCHF'
       and state in ('PENDING_ENTRY','OPEN')
     order by signal_time asc`
  );
  if(!active.length) return {updated:0,active:0};

  const starts=active.map(t=>t.state==="PENDING_ENTRY"
    ? Number(t.signal_time)+M15
    : Number(t.last_candle_time ?? t.entry_time)+M15
  ).filter(Number.isFinite);
  const from=Math.min(...starts);
  const to=Number(throughTime);
  if(!(to>=from)) return {updated:0,active:active.length};

  const history=await fetchTradeLockerHistory({
    symbol:instrument.symbol,
    tradableInstrumentId:instrument.tradableInstrumentId,
    infoRouteId:instrument.infoRouteId,
    resolution:"15m",
    from,to,maxBars:5000
  });

  let updated=0;
  for(const trade of active){
    const next=evaluateVirtualTradeCandles({
      trade,candles:history.candles,pipSize:Number(sizing.pipSize),
      accountCurrency:String(sizing.accountCurrency||"USD"),
      baseCurrency:String(sizing.baseCurrency||"USD"),
      quotingCurrency:String(sizing.quotingCurrency||"CHF")
    });
    await dbQuery(
      `update shadow_virtual_trades set
        state=$2,entry_time=$3,entry_price=$4,take_profit=$5,
        risk_amount_usd=$6,outcome=$7,exit_time=$8,exit_price=$9,
        r_multiple=$10,pnl_usd=$11,mfe_pips=$12,mae_pips=$13,
        last_candle_time=$14,closed_at=case when $15::text is null then closed_at else $15::timestamptz end,
        updated_at=now()
       where id=$1`,
      [
        trade.id,next.state,next.entry_time??null,next.entry_price??null,next.take_profit??null,
        next.risk_amount_usd??null,next.outcome??null,next.exit_time??null,next.exit_price??null,
        next.r_multiple??null,next.pnl_usd??null,next.mfe_pips??0,next.mae_pips??0,
        next.last_candle_time??null,next.closed_at??null
      ]
    );
    updated+=1;
  }
  return {updated,active:active.length,bars:history.returnedBars};
}

export async function shadowOutcomeSummary(){
  const rows=await dbQuery(
    `select
      count(*)::int total,
      count(*) filter(where state='PENDING_ENTRY')::int pending,
      count(*) filter(where state='OPEN')::int open,
      count(*) filter(where state='CLOSED')::int closed,
      count(*) filter(where state='SKIPPED')::int skipped,
      count(*) filter(where outcome='TARGET')::int targets,
      count(*) filter(where outcome='STOP')::int stops,
      coalesce(sum(r_multiple),0)::numeric as total_r,
      coalesce(avg(r_multiple) filter(where state='CLOSED'),0)::numeric as expectancy_r,
      coalesce(sum(pnl_usd),0)::numeric as pnl_usd,
      coalesce(max(mae_pips),0)::numeric as max_mae_pips,
      coalesce(max(mfe_pips),0)::numeric as max_mfe_pips
     from shadow_virtual_trades
     where strategy='forex-trend-pullback-v2-shadow'
       and strategy_version='2.0.0-shadow'
       and symbol='USDCHF'`
  );
  const latest=await dbQuery(
    `select id,signal_time,side,state,entry_time,entry_price,stop_loss,take_profit,
            outcome,exit_time,exit_price,r_multiple,pnl_usd,mfe_pips,mae_pips,updated_at
     from shadow_virtual_trades
     where strategy='forex-trend-pullback-v2-shadow'
       and strategy_version='2.0.0-shadow'
       and symbol='USDCHF'
     order by signal_time desc limit 20`
  );
  return {summary:rows?.[0]||{},latest};
}
