#!/usr/bin/env node
/** Read-only side-by-side summary of 2022-24 frozen leaders versus offline AMD.
 *  Not matched-fill A/B evidence; market history, cost models, and entry rules differ.
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {dirname,resolve} from "node:path";
const FOLDS={training_2022:0,training_2023:1,reused_dev_2024_h1:2,reused_dev_2024_h2:3};
function cli(v){const a={};for(let i=0;i<v.length;i+=2){if(!v[i]?.startsWith("--")||!v[i+1])throw Error("Use --amd path --output path");a[v[i].slice(2)]=v[i+1]}return a;}
async function main(){
  const a=cli(process.argv.slice(2));
  if(!a.amd||!a.output)throw Error("Require --amd and --output");
  const amd=JSON.parse(await readFile(resolve(a.amd),"utf8"));
  if(amd.holdoutRead!==false||amd.startingUSD!==1000||!Object.hasOwn(FOLDS,amd.fold))
    throw Error("AMD result is not from an authorized $1,000 development fold");
  const old=JSON.parse(await readFile(new URL("../docs/xmi-session-calendar-rerun-2022-2024.json",import.meta.url),"utf8"));
  if(old.holdout_archives_read!==false)throw Error("Baseline does not attest sealed holdout");
  const baseline=[];
  for(const [lane,row] of Object.entries(old.symbols[amd.symbol].leaders)){
    const x=row.folds[FOLDS[amd.fold]];
    if(!x)throw Error("Missing saved baseline fold");
    baseline.push({symbol:amd.symbol,lane,rule:row.variant.rule,fold:amd.fold,
      trades:x.n,grossUSD:x.net_usd+x.cost_usd,
      modeledFrictionUSD:x.cost_usd,netUSD:x.net_usd,
      profitFactor:x.profit_factor,drawdown:x.max_drawdown});
  }
  const configs=amd.rows.map(r=>({
    id:r.configId,rangeModel:r.rangeModel,entryModel:r.entryModel,
    exitModel:r.exitModel,carry:r.carry,sizing:r.sizing,noSkipLane:r.lane,
    fundedTrades:r.settledFunded,signalCount:r.signals,
    grossUSD:r.grossFundedUSD,netUSD:r.netFundedUSD,
    unfundable:r.unfundable,occupied:r.occupied,shadowOnly:r.shadowOnly,
    notBrokerVerified:!r.instrumentSpecVerified||!r.historicalBidAskVerified
  }));
  const output={
    purpose:"Parallel research baseline reference — NOT matched fill causal comparison",
    market:amd.symbol,fold:amd.fold,baselineModels:"Old execution includes earlier costs and commissions",
    amdModels:"Zero commission STP modeled spread/slippage and conditional symbol specs",
    noSelectionFrom2024:true,holdoutRead:false,realOrdersSent:0,
    baseline,amdConfigurations:configs,
    warnings:["Do not sum the independent strategy accounts as one portfolio.",
      "Never claim a winning or execution-qualified strategy from reused 2024 development rows.",
      "Any AMD shadow-only P/L is excluded from funded account P/L.",
      "Comparable broker specific bid/ask, swap and symbol leverage remain unverified."]
  };
  await mkdir(dirname(resolve(a.output)),{recursive:true});
  await writeFile(resolve(a.output),JSON.stringify(output,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({output:a.output,baselineRows:baseline.length,amdRows:configs.length,holdoutRead:false}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
