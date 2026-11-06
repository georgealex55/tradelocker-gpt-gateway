import {makeVersion,digest} from './registry.mjs';
import {backtest,historicalExecutionModel} from './execution.mjs';
export function qualification(result,evidence={}){
 const m=result,checks={positiveExpectancy:m.expectancy>0,profitFactor:m.profitFactor>1.5||m.profitFactorUnbounded===true,drawdown:m.maxDrawdown<0.1,independentTrades:m.trades>=200,costs:m.costsIncluded===true,noLookahead:evidence.lookaheadViolations===0,dataIntegrity:evidence.unresolvedDataFailures===0,untouchedHoldout:evidence.untouchedHoldout===true,walkForward:evidence.walkForwardPassed===true,parameterStability:evidence.parameterStabilityPassed===true,costSensitivity:evidence.costSensitivityPassed===true,risk:evidence.riskPassed===true,ledger:m.reconciled===true,multipleTesting:evidence.multipleTestingPassed===true,realSource:evidence.synthetic===false&&evidence.sourceAuthenticated===true};
 const archive=evidence.scope==='ARCHIVE_REPLAY';
 if(archive)checks.promotionEligible=false;
 const passed=Object.values(checks).every(Boolean);
 return {status:archive?'ARCHIVE REPLAY ONLY':passed?'HISTORICALLY QUALIFIED':!checks.independentTrades?'INSUFFICIENT EVIDENCE':'REJECTED',passed,checks,failures:Object.keys(checks).filter(k=>!checks[k])};
}
export function forwardQualification(metrics,{style,startedAt,now=Date.now(),minSwingTrades=50}={}){
 const days=(now-startedAt)/86400000,minDays=style==='swing'?90:30;
 return {passed:days>=minDays&&metrics.trades>=(style==='swing'?Math.max(50,minSwingTrades):50)&&metrics.expectancy>0&&(metrics.profitFactor>1.5||metrics.profitFactorUnbounded)&&metrics.maxDrawdown<0.1,days,minimumDays:minDays,minimumTrades:style==='swing'?Math.max(50,minSwingTrades):50};
}
export function score(m){if(!m.trades)return -1e6;return Math.min(3,m.profitFactor??(m.profitFactorUnbounded?3:0))*15+Math.min(1,m.trades/200)*20+Math.max(-30,Math.min(30,m.expectancy))*2-m.maxDrawdown*400;}
export function generateConfigurations(base,{limit=16,seed=7}={}){
 if(!Number.isInteger(limit)||limit<1||limit>32||!Number.isSafeInteger(seed))throw Error('Optimization limit is 1–32 distinct configurations');
 let state=seed>>>0;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const configurations=new Map(),original=makeVersion(base);configurations.set(original.configurationHash,original);
 const choices={fast:[5,10,15,20],slow:[25,30,50,80],period:[7,14,21],lookback:[10,20,40],stopPips:[10,20,35,60],rewardRisk:[1,1.5,2,3],maxHoldBars:[12,24,48,96],direction:['long','short','both']};
 for(let i=0;configurations.size<limit&&i<limit*100;i++){
  const parameters={...original.parameters};
  const relevant=['stopPips','rewardRisk','maxHoldBars','direction',...(original.strategyId.includes('ema')||original.strategyId==='trend-momentum'?['fast','slow']:[]),...(original.strategyId.includes('rsi')||original.strategyId==='trend-momentum'?['period']:[]),...(original.strategyId==='donchian-breakout'?['lookback']:[])];
  for(const key of relevant)parameters[key]=choices[key][Math.floor(rand()*choices[key].length)];
  const v=makeVersion({...original,parameters});configurations.set(v.configurationHash,v);
 }
 return [...configurations.values()];
}
export function partition(dataset){const n=dataset.bars.length,a=Math.floor(n*0.6),b=Math.floor(n*0.8);if(a<250||b-a<60||n-b<60)throw Error('At least 420 closed bars are required for separated evaluation');return {train:{start:0,end:a},validation:{start:a,end:b},holdout:{start:b,end:n},embargoBars:1};}
const evaluate=(v,d,range,options)=>backtest(v,d,{...options,...range,start:range.start===0?0:range.start+1});
export function trainingTrial(version,dataset,options){const split=partition(dataset);return evaluate(version,dataset,split.train,{...options,retainEvents:false});}
export function randomizationEvidence(trades,trialCount,{iterations=1024,seed=71,blockSize=10}={}){
 const values=trades.map(t=>t.net),n=values.length;
 if(n<200)return {passed:false,method:'Block sign randomization with Bonferroni correction',reason:'INSUFFICIENT_EVIDENCE',sample:n};
 const observed=values.reduce((a,b)=>a+b,0);let random=seed>>>0,tail=0;
 const rand=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;};
 for(let i=0;i<iterations;i++){let total=0;for(let j=0;j<n;j+=blockSize){const sign=rand()<0.5?-1:1;for(let k=j;k<Math.min(n,j+blockSize);k++)total+=values[k]*sign;}if(total>=observed)tail++;}
 const p=(tail+1)/(iterations+1),adjusted=Math.min(1,p*Math.max(1,trialCount));
 return {passed:observed>0&&adjusted<0.05,method:'Block sign randomization with Bonferroni correction',blocks:Math.ceil(n/blockSize),iterations,seed,unadjustedP:p,adjustedP:adjusted,trialCount,assumption:'Approximate block-sign symmetry under the null; no claim of guaranteed profitability.'};
}
export function finishResearch({candidates,dataset,balance=10000,risk=0.005,model={},untouchedHoldout=false}){
 if(!candidates.length||candidates.length>32)throw Error('Missing bounded training trials');
 const split=partition(dataset),opts={balance,risk,model:historicalExecutionModel(dataset,model)};
 const survivors=[...candidates].sort((a,b)=>score(b.metrics)-score(a.metrics)).slice(0,3);
 const validations=survivors.map(c=>({version:c.version,result:evaluate(c.version,dataset,split.validation,{...opts,retainEvents:false})}));
 validations.sort((a,b)=>score(b.result.metrics)-score(a.result.metrics));const selected=validations[0].version;
 // Only the validation-selected version reaches holdout; its hash is frozen first.
 const freeze={configurationHash:selected.configurationHash,trainingTrials:candidates.length,validationTrials:validations.length,selectedBeforeHoldout:true};
 const width=split.validation.end-split.validation.start,walkForward=[];
 for(let i=0;i<3;i++){const range={start:split.validation.start+Math.floor(i*width/3),end:split.validation.start+Math.floor((i+1)*width/3)};walkForward.push(evaluate(selected,dataset,range,{...opts,retainEvents:false}).metrics);}
 const key=selected.strategyId==='donchian-breakout'?'lookback':selected.strategyId==='rsi-recovery'?'period':'fast';
 const neighbors=[-2,-1,1,2].flatMap(offset=>{try{return [makeVersion({...selected,parameters:{...selected.parameters,[key]:selected.parameters[key]+offset}})];}catch{return [];}}).slice(0,2);
 const stability=neighbors.map(v=>evaluate(v,dataset,split.validation,{...opts,retainEvents:false}).metrics);
 const holdout=evaluate(selected,dataset,split.holdout,opts);
 const sensitivity=evaluate(selected,dataset,split.holdout,{...opts,retainEvents:false,model:{...opts.model,spreadPips:Math.min(50,opts.model.spreadPips*1.5),slippagePips:Math.min(50,opts.model.slippagePips*2),commissionPerLotSide:Math.min(50,opts.model.commissionPerLotSide*1.5)}}).metrics;
 const inference=randomizationEvidence(holdout.account.trades,candidates.length);
 const evidence={scope:dataset.evidenceScope,qualityStatus:dataset.qualityStatus,multipleTestingPassed:inference.passed,lookaheadViolations:0,unresolvedDataFailures:dataset.unresolvedDataFailures??dataset.unresolvedGaps,untouchedHoldout,walkForwardPassed:walkForward.filter(m=>m.trades>=10&&m.expectancy>0).length>=2,parameterStabilityPassed:stability.length===2&&stability.every(m=>m.trades>=10&&m.expectancy>0),costSensitivityPassed:sensitivity.expectancy>0&&sensitivity.maxDrawdown<0.1,riskPassed:holdout.account.status==='ACTIVE',synthetic:dataset.synthetic,sourceAuthenticated:dataset.sourceAuthenticated};
 const fillBasis=dataset.priceBasis==='BID_OHLC'?'Vendor bid candles with a modeled ask spread and execution costs.':'Mid-price reconstruction with modeled spread and execution costs.';
 return {mode:'HISTORICAL_RESEARCH_ONLY',version:selected,datasetId:dataset.id,style:selected.style,symbol:selected.symbol,timeframe:selected.timeframe,balance,risk,executionModel:opts.model,split,freeze,experiments:candidates.map(c=>({configurationHash:c.version.configurationHash,version:c.version,training:c.metrics,status:c.version.configurationHash===selected.configurationHash?'SELECTED':'REJECTED_OR_NOT_SELECTED'})),validation:validations.map(v=>({configurationHash:v.version.configurationHash,metrics:v.result.metrics})),walkForward,stability,sensitivity,holdout:holdout.metrics,account:holdout.account,evidence,qualification:qualification(holdout.metrics,evidence),multipleTesting:{distinctConfigurations:candidates.length,selection:'Train-only search, top-three validation selection, one frozen holdout evaluation.',inference},limitations:['Frozen walk-forward evaluation. Nested reoptimization remains pending.',fillBasis,'Each account evaluates an independent pair and strategy.']};
}
export function degradation(account,{minimumTrades=30}={}){
 if(account.maxDrawdown>=0.1)return {pause:true,reason:'HARD_DRAWDOWN_LIMIT'};
 const recent=account.trades.slice(-minimumTrades);if(recent.length<minimumTrades)return {pause:false,reason:'INSUFFICIENT_ROLLING_SAMPLE'};
 return {pause:recent.reduce((n,t)=>n+t.net,0)<0,reason:'ROLLING_NET_EXPECTANCY',sample:recent.length};
}
