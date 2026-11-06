/* Internal OHLC simulation only. This module performs no network operations. */
import {digest,MAJORS,SECONDS,BALANCES,RISKS,confirm,compileSignals} from './registry.mjs';
export const EXECUTION_MODEL=Object.freeze({name:'CONSERVATIVE_MID_OHLC_V1',spreadPips:2,slippagePips:0.3,commissionPerLotSide:3.5,annualFinancingRate:0.06,leverage:30,minUnits:1000,unitStep:1000,liquidationMarginRatio:0.5,maxDrawdown:0.1,accountCurrency:'USD',contractSize:100000});
const BID_EXECUTION_MODEL='CONSERVATIVE_BID_OHLC_V1';
export const pipSize=symbol=>{if(!MAJORS.includes(symbol))throw Error('Unsupported Forex pair');return symbol.endsWith('JPY')?0.01:0.0001;};
export function conversion(symbol,price){
 if(!MAJORS.includes(symbol)||!Number.isFinite(price)||price<=0)throw Error('Missing contemporaneous conversion');
 return symbol.endsWith('USD')?{quoteUSD:1,baseUSD:price}:{quoteUSD:1/price,baseUSD:1};
}
const money=n=>Math.round(n*1e8)/1e8;
export function brokerSpec(input={}){
 if(Object.keys(input).some(k=>!Object.hasOwn(EXECUTION_MODEL,k)))throw Error('Unknown execution model setting');
 const x={...EXECUTION_MODEL,...input};
 if(x.accountCurrency!=='USD'||![EXECUTION_MODEL.name,BID_EXECUTION_MODEL].includes(x.name)||x.contractSize!==100000)throw Error('Unsupported simulation execution model');
 for(const k of ['spreadPips','slippagePips','commissionPerLotSide','annualFinancingRate'])if(!Number.isFinite(x[k])||x[k]<0||x[k]>(k==='annualFinancingRate'?0.5:50))throw Error('Invalid execution cost');
 for(const k of ['minUnits','unitStep'])if(!Number.isInteger(x[k])||x[k]<1||x[k]>100000)throw Error('Invalid unit minimum');
 if(x.leverage<1||x.leverage>50||!Number.isFinite(x.leverage)||x.maxDrawdown<=0||x.maxDrawdown>0.1||!Number.isFinite(x.maxDrawdown)||x.liquidationMarginRatio<=0||x.liquidationMarginRatio>1||!Number.isFinite(x.liquidationMarginRatio))throw Error('Invalid risk or leverage limits');
 return x;
}
export function historicalExecutionModel(dataset,settings={}){
 const name=dataset.priceBasis==='BID_OHLC'?BID_EXECUTION_MODEL:EXECUTION_MODEL.name;
 if(settings.name!==undefined&&settings.name!==name)throw Error('Execution model does not match candle price basis');
 return brokerSpec({...settings,name});
}
function quoteOffset(model,side,pip){
 const spread=model.name===BID_EXECUTION_MODEL?(side>0?model.spreadPips:0):model.spreadPips/2;
 return side*spread*pip;
}
export function createAccount({id,balance=10000,risk=0.005,model={},mode='RECONSTRUCTED_HISTORICAL'}={}){
 if(!BALANCES.includes(balance)||!RISKS.includes(risk)||!['RECONSTRUCTED_HISTORICAL','INTERNAL_FORWARD_PAPER'].includes(mode)||typeof id!=='string'||!id||id.length>160)throw Error('Invalid independent demo account');
 return {id,mode,initialBalance:balance,balance,equity:balance,peakEquity:balance,maxDrawdown:0,risk,model:brokerSpec(model),position:null,pending:null,seen:[],events:[],trades:[],curve:[],status:'ACTIVE',lastBar:null};
}
function event(account,type,time,detail={}){account.events.push({id:digest({account:account.id,index:account.events.length,type,time,detail}),accountId:account.id,type,time,...detail});}
export function sizePosition(account,signal,mid){
 const m=account.model,fx=conversion(signal.instrument,mid),pip=pipSize(signal.instrument),distance=signal.instructions.stopPips*pip;
 const unitRisk=(distance+m.slippagePips*pip)*fx.quoteUSD+2*m.commissionPerLotSide/100000;
 const budget=Math.max(0,account.equity*account.risk),raw=Math.floor(budget/unitRisk/m.unitStep)*m.unitStep;
 const freeMargin=account.equity-(account.position?.margin||0),marginUnits=Math.floor(freeMargin*m.leverage/fx.baseUSD/m.unitStep)*m.unitStep;
 const units=Math.min(raw,marginUnits);
 return {accepted:units>=m.minUnits,units:Math.max(0,units),budget,plannedRisk:units*unitRisk,margin:units*fx.baseUSD/m.leverage,reason:units<m.minUnits?'BELOW_MINIMUM_OR_MARGIN':null};
}
export function acceptSignal(account,signal){
 if(account.status!=='ACTIVE'||!signal||signal.state!=='CONFIRMED_ENTRY')return false;
 if(account.mode==='INTERNAL_FORWARD_PAPER')throw Error('Forward execution requires a fresh observed quote; historical order entry is prohibited');
 const key=account.id+':'+signal.idempotencyKey;if(account.seen.includes(key))return false;
 if(account.position||account.pending)return false;
 account.seen.push(key);account.pending={signal,key};
 event(account,'ENTRY_CANDIDATE',signal.timestamp,{signalId:signal.signalId});
 event(account,'CONFIRMED_ENTRY',signal.timestamp,{signalId:signal.signalId,configurationHash:signal.configurationHash,confirmation:signal});
 event(account,'SIMULATED_ORDER',signal.timestamp,{signalId:signal.signalId,orderType:'MARKET_NEXT_BAR',idempotencyKey:key});return true;
}
function opened(account,signal,reference,time){
 const m=account.model,pip=pipSize(signal.instrument),sign=signal.direction==='LONG'?1:-1;
 const fill=reference+quoteOffset(m,sign,pip)+sign*m.slippagePips*pip,size=sizePosition(account,signal,fill);
 if(!size.accepted){event(account,'ORDER_REJECTED',time,{signalId:signal.signalId,reason:size.reason});return;}
 const fee=size.units/100000*m.commissionPerLotSide;
 account.balance=money(account.balance-fee);
 account.position={id:digest({account:account.id,signal:signal.signalId}),accountId:account.id,signalId:signal.signalId,configurationHash:signal.configurationHash,strategyId:signal.strategyId,symbol:signal.instrument,direction:signal.direction,sign,entry:fill,...(m.name===BID_EXECUTION_MODEL?{entryBid:reference}:{entryMid:reference}),entryTime:time,units:size.units,initialUnits:size.units,stop:fill-sign*signal.instructions.stopPips*pip,target:fill+sign*signal.instructions.stopPips*pip*signal.instructions.takeProfitR,margin:size.margin,entryFee:fee,costs:fee,realized:0,gross:0,heldBars:0,maxHoldBars:signal.instructions.maxHoldBars,parameters:signal.risk,partialDone:false,mode:account.mode,confirmation:signal};
 event(account,'SIMULATED_FILL',time,{positionId:account.position.id,signalId:signal.signalId,price:fill,units:size.units,commission:fee,model:m.name,mode:account.mode});
 event(account,'POSITION_OPEN',time,{positionId:account.position.id,signalId:signal.signalId,risk:size});
}
function closeUnits(account,price,time,reason,units=null){
 const p=account.position;if(!p)return;
 units=units??p.units;const cost=units/100000*account.model.commissionPerLotSide;
 const gross=(price-p.entry)*p.sign*units*conversion(p.symbol,price).quoteUSD,net=gross-cost;
 account.balance=money(account.balance+net);p.realized+=net;p.gross+=gross;p.costs+=cost;
 event(account,'SIMULATED_EXIT_FILL',time,{positionId:p.id,signalId:p.signalId,price,units,commission:cost,gross,net,reason,mode:account.mode});
 p.units-=units;p.margin*=p.units/(p.units+units);
 if(p.units>0){p.partialDone=true;return;}
 const trade={id:p.id,accountId:account.id,signalId:p.signalId,strategyId:p.strategyId,configurationHash:p.configurationHash,symbol:p.symbol,direction:p.direction,entryTime:p.entryTime,exitTime:time,entry:p.entry,exit:price,units:p.initialUnits,gross:money(p.gross),costs:money(p.costs),net:money(p.gross-p.costs),reason,mode:p.mode,confirmation:p.confirmation,independenceKey:digest({symbol:p.symbol,timeframe:p.confirmation.timeframe,entryTime:p.entryTime,direction:p.direction,exitTime:time})};
 account.trades.push(trade);event(account,'CLOSED',time,{tradeId:trade.id,signalId:p.signalId,net:trade.net,reason});account.position=null;
}
function financing(account,from,to,mid){
 const p=account.position;if(!p)return;
 // Explicit UTC daily financing approximation, Wednesday triple; not broker swaps.
 for(let day=Math.floor(from/86400)+1;day<=Math.floor(to/86400);day++){
  const d=new Date(day*86400*1000).getUTCDay();if(d===0||d===6)continue;
  const charge=p.units*conversion(p.symbol,mid).baseUSD*account.model.annualFinancingRate/365*(d===3?3:1);
  account.balance=money(account.balance-charge);p.costs+=charge;
  event(account,'MODELED_FINANCING',day*86400,{positionId:p.id,amount:charge,rolloverBasis:'UTC_APPROXIMATION'});
 }
}
function mark(account,reference,time,record=true){
 const p=account.position;
 const pip=p?pipSize(p.symbol):0;
 const executable=p?reference+quoteOffset(account.model,-p.sign,pip)-p.sign*account.model.slippagePips*pip:reference;
 const unrealized=p?(executable-p.entry)*p.sign*p.units*conversion(p.symbol,executable).quoteUSD-p.units/100000*account.model.commissionPerLotSide:0;
 account.equity=money(account.balance+unrealized);account.peakEquity=Math.max(account.peakEquity,account.equity);
 account.maxDrawdown=Math.max(account.maxDrawdown,(account.peakEquity-account.equity)/account.peakEquity);
 if(record)account.curve.push({time,balance:account.balance,equity:account.equity,drawdown:(account.peakEquity-account.equity)/account.peakEquity});
}
export function processBar(account,bar,{signal=null}={}){
 if(account.mode!=='RECONSTRUCTED_HISTORICAL')throw Error('OHLC replay cannot create forward fills');
 if(!bar||bar.closed!==true||!Number.isSafeInteger(bar.time)||account.lastBar!==null&&bar.time<=account.lastBar) return false;
 const step=SECONDS[account.timeframe||signal?.timeframe||account.pending?.signal.timeframe||account.position?.confirmation.timeframe||'15m'],closeTime=bar.time+step;
 if(['open','high','low','close'].some(k=>!Number.isFinite(bar[k])||bar[k]<=0)||bar.high<Math.max(bar.open,bar.close)||bar.low>Math.min(bar.open,bar.close))throw Error('Invalid execution candle');
 if(account.status!=='ACTIVE'){account.lastBar=bar.time;return false;}
 if(account.pending){const pending=account.pending;if(bar.time>=pending.signal.timestamp){account.pending=null;opened(account,pending.signal,bar.open,bar.time);}}
 const p=account.position;
 if(p){
  financing(account,account.lastBar??bar.time,bar.time,bar.open);p.heldBars++;
  const m=account.model,pip=pipSize(p.symbol),offset=quoteOffset(m,-p.sign,pip),slip=m.slippagePips*pip;
  const side=x=>x+offset,atOpen=side(bar.open),low=side(bar.low),high=side(bar.high);
  const stop=p.sign===1?low<=p.stop:high>=p.stop,target=p.sign===1?high>=p.target:low<=p.target;
  const adverse=stop?(p.sign===1?Math.min(p.stop,atOpen):Math.max(p.stop,atOpen)):(p.sign===1?low:high);
  mark(account,adverse-offset,closeTime,false);
  if(!stop&&(account.equity<=p.margin*m.liquidationMarginRatio||account.maxDrawdown>=m.maxDrawdown)){
   const reason=account.equity<=p.margin*m.liquidationMarginRatio?'MARGIN_LIQUIDATION':'HARD_DRAWDOWN_PAUSE';
   event(account,'EXIT_CANDIDATE',closeTime,{positionId:p.id,reason});event(account,'CONFIRMED_EXIT',closeTime,{positionId:p.id,reason});
   closeUnits(account,adverse-p.sign*slip,closeTime,reason);account.status='PAUSED';event(account,'RISK_PAUSE',closeTime,{reason});
  }else if(stop||target){
   const reason=stop&&target?'AMBIGUOUS_STOP_FIRST':stop?'STOP_LOSS':'TAKE_PROFIT';
   const price=stop?(p.sign===1?Math.min(p.stop,atOpen):Math.max(p.stop,atOpen))-p.sign*slip:p.target;
   event(account,'EXIT_CANDIDATE',closeTime,{positionId:p.id,reason});event(account,'CONFIRMED_EXIT',closeTime,{positionId:p.id,reason});closeUnits(account,price,closeTime,reason);
  }else{
   // Stop and risk checks above use a pessimistic intrabar adverse mark.
   if(account.equity<=p.margin*m.liquidationMarginRatio||account.maxDrawdown>=m.maxDrawdown){
    const reason=account.equity<=p.margin*m.liquidationMarginRatio?'MARGIN_LIQUIDATION':'HARD_DRAWDOWN_PAUSE';
    closeUnits(account,side(p.sign===1?bar.low:bar.high)-p.sign*slip,closeTime,reason);account.status='PAUSED';event(account,'RISK_PAUSE',closeTime,{reason});
   }else if(p.heldBars>=p.maxHoldBars||signal&&signal.direction!==p.direction){
    const reason=p.heldBars>=p.maxHoldBars?'TIME_EXIT':'STRATEGY_INVALIDATION';
    event(account,'EXIT_CANDIDATE',closeTime,{positionId:p.id,reason});event(account,'CONFIRMED_EXIT',closeTime,{positionId:p.id,reason});
    closeUnits(account,side(bar.close)-p.sign*slip,closeTime,reason);
   }else{
    const favorable=(side(bar.close)-p.entry)*p.sign,initial=p.parameters.stopPips*pip;
    if(p.parameters.partialAtR>0&&!p.partialDone&&favorable>=initial*p.parameters.partialAtR){const units=Math.floor(p.units/2/m.unitStep)*m.unitStep;if(units>=m.minUnits&&p.units-units>=m.minUnits)closeUnits(account,side(bar.close)-p.sign*slip,closeTime,'PARTIAL_CLOSE',units);}
    // Stop changes only apply to subsequent candles, never earlier extrema.
    let stop=p.stop;
    if(p.parameters.breakevenR>0&&favorable>=initial*p.parameters.breakevenR)stop=p.sign===1?Math.max(stop,p.entry):Math.min(stop,p.entry);
    if(p.parameters.trailingPips>0){const next=side(bar.close)-p.sign*p.parameters.trailingPips*pip;stop=p.sign===1?Math.max(stop,next):Math.min(stop,next);}
    if(stop!==p.stop){p.stop=stop;event(account,'STOP_AMENDED',closeTime,{positionId:p.id,stop,effective:'NEXT_CANDLE'});}
   }
  }
 }
 mark(account,bar.close,closeTime);account.lastBar=bar.time;
 if(account.maxDrawdown>=account.model.maxDrawdown){account.status='PAUSED';account.pending=null;event(account,'RISK_PAUSE',closeTime,{reason:'MAXIMUM_EQUITY_DRAWDOWN'});}
 if(signal&&!account.position)acceptSignal(account,signal);
 return true;
}
export function finishReplay(account,bar){
 if(account.position){const p=account.position,pip=pipSize(p.symbol);closeUnits(account,bar.close+quoteOffset(account.model,-p.sign,pip)-p.sign*account.model.slippagePips*pip,bar.time+SECONDS[p.confirmation.timeframe],'EVALUATION_BOUNDARY');}
 if(account.pending)event(account,'ORDER_CANCELLED',bar.time,{signalId:account.pending.signal.signalId,reason:'EVALUATION_BOUNDARY'});
 account.pending=null;mark(account,bar.close,bar.time+SECONDS[account.timeframe||'15m']);return account;
}
export function reconcile(account){
 const expected=account.initialBalance+account.trades.reduce((n,t)=>n+t.net,0);
 return {ok:!account.position&&Math.abs(expected-account.balance)<0.00001,expected,balance:account.balance,difference:money(account.balance-expected)};
}
export function metrics(account){
 const trades=[...new Map(account.trades.map(t=>[t.independenceKey,t])).values()],net=trades.map(t=>t.net),wins=net.filter(n=>n>0),losses=net.filter(n=>n<0),profit=wins.reduce((a,b)=>a+b,0),loss=-losses.reduce((a,b)=>a+b,0);
 return {trades:trades.length,net:money(net.reduce((a,b)=>a+b,0)),expectancy:net.length?net.reduce((a,b)=>a+b,0)/net.length:0,profitFactor:loss?profit/loss:profit>0?null:0,profitFactorUnbounded:loss===0&&profit>0,maxDrawdown:account.maxDrawdown,winRate:net.length?wins.length/net.length:0,averageWinner:wins.length?profit/wins.length:0,averageLoser:losses.length?-loss/losses.length:0,costsIncluded:true,reconciled:reconcile(account).ok,endingEquity:account.equity};
}
export function backtest(version,dataset,{balance=10000,risk=0.005,start=0,end=dataset.bars.length,model={},retainEvents=true,signals=null}={}){
 if(dataset.symbol!==version.symbol||dataset.timeframe!==version.timeframe||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>dataset.bars.length||end<=start)throw Error('Dataset/configuration mismatch');
 signals=signals??compileSignals(version,dataset);
 const id=digest({version:version.configurationHash,dataset:dataset.id,balance,risk,start,end,model}),account=createAccount({id,balance,risk,model:historicalExecutionModel(dataset,model)});account.timeframe=version.timeframe;
 for(let i=start;i<end;i++){
  const signal=signals?signals.get(i):confirm(version,dataset.bars.slice(0,i+1),{datasetId:dataset.id});
  processBar(account,dataset.bars[i],{signal});
 }
 finishReplay(account,dataset.bars[end-1]);const result={account,metrics:metrics(account)};
 if(!retainEvents){account.events=[];account.curve=[];for(const t of account.trades)delete t.confirmation;}
 return result;
}
