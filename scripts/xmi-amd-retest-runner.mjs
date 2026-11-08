#!/usr/bin/env node
/**
 * Offline XMI AMD research matrix. No API, credentials, 2025 holdout, or trading orders.
 * Run only against private normalized 5-minute historical bid OHLC CSV.
 *
 * node scripts/xmi-amd-retest-runner.mjs \
 *   --input /private/eurusd-2022-2024-5m.csv --symbol EURUSD \
 *   --fold training_2022 --output /private/results/eurusd-2022.json
 */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {resolve,dirname} from "node:path";
import {createHash} from "node:crypto";
import {checkBars,detectAMDRetest,SYMBOLS} from "./xmi-amd-retest-core.mjs";
import {replayAMDRetest} from "./xmi-amd-retest-execution.mjs";
const ROOT=new URL("../",import.meta.url);
const FOLDS={
  training_2022:["2022-01-01","2023-01-01"],
  training_2023:["2023-01-01","2024-01-01"],
  reused_dev_2024_h1:["2024-01-01","2024-07-01"],
  reused_dev_2024_h2:["2024-07-01","2025-01-01"]
};
const sha=text=>createHash("sha256").update(text).digest("hex");
function argsOf(argv){
  const a={};for(let i=0;i<argv.length;i++){
    const key=argv[i];if(!key.startsWith("--")||!argv[i+1])throw Error("Expected --name value options");
    a[key.slice(2)]=argv[++i];
  }
  return a;
}
function parseBidCSV(text){
  const lines=text.trim().split(/\r?\n/);
  if(lines.length<2)throw Error("No bid-price rows");
  const cols=lines[0].trim().split(",").map(v=>v.trim());
  if(JSON.stringify(cols)!==JSON.stringify(["t","o","h","l","c"]))
    throw Error("CSV must contain precisely t,o,h,l,c with ISO UTC times");
  return lines.slice(1).map((line,n)=>{
    const x=line.split(",");if(x.length!==5)throw Error("Malformed CSV "+(n+2));
    return {t:x[0],o:Number(x[1]),h:Number(x[2]),l:Number(x[3]),c:Number(x[4])};
  });
}
async function run(){
  const a=argsOf(process.argv.slice(2));
  if(!a.input||!a.symbol||!a.fold||!a.output)throw Error("Required: --input --symbol --fold --output");
  if(!SYMBOLS.includes(a.symbol))throw Error("Unregistered symbol");
  if(!FOLDS[a.fold])throw Error("Unregistered fold; 2025 is sealed");
  const catalogRaw=await readFile(new URL("../docs/xmi-amd-retest-stp-20261107.catalog.json",import.meta.url),"utf8");
  const catalog=JSON.parse(catalogRaw),inputRaw=await readFile(resolve(a.input),"utf8");
  // Validate entire input *before* slicing, so 2025 archives can never be loaded silently.
  const all=checkBars(parseBidCSV(inputRaw));
  const [start,end]=FOLDS[a.fold].map(Date.parse);
  const bars=all.filter(b=>b.t>=start&&b.t<end);
  if(bars.length<80)throw Error("Insufficient 5m bars for an AMD fold");
  const spec={...catalog.instruments[a.symbol]};
  if(a["symbol-spec"]){
    const extra=JSON.parse(await readFile(resolve(a["symbol-spec"]),"utf8"));
    const allowed=["lotSize","minLot","lotStep","maxLot","symbolLeverage",
      "spreadPrice","slippagePriceEachSide","swapLongUsdPerLotPerNight",
      "swapShortUsdPerLotPerNight","specStatus","costStatus","leverageStatus"];
    for(const key of Object.keys(extra))if(!allowed.includes(key))throw Error("Unexpected spec field "+key);
    Object.assign(spec,extra);
  }
  const models=catalog.rangeModels,entries=catalog.entryModels,
    exits=catalog.exitModels,carries=catalog.carryModels,
    sizings=catalog.sizingModels,lanes=catalog.noSkipLanes;
  const profiles=[{id:"modeled_base_stp",...spec}];
  if(a.symbol==="XAUUSD"&&a["gold-wide"]==="true")
    profiles.push({id:"modeled_wide_gold_sensitivity",...spec,
      spreadPrice:catalog.alternativeGoldSpread.wideScenario});
  const rows=[],sourceHash=sha(inputRaw);
  for(const profile of profiles){
    for(const rangeModel of models)for(const entryModel of entries){
      const signalStudy=detectAMDRetest(bars,{rangeModel,entryModel});
      for(const exitModel of exits)for(const carry of carries)
      for(const sizing of sizings)for(const lane of lanes){
        const plan={symbol:a.symbol,profile:profile.id,fold:a.fold,rangeModel,entryModel,
          exitModel,carry,sizing,lane};
        const out=replayAMDRetest(bars,signalStudy.signals,profile,plan);
        rows.push({...plan,configId:sha(JSON.stringify(plan)),...out.summary,
          grossFundedUSD:out.summary.grossFundedUSD,
          netFundedUSD:out.summary.netFundedUSD,
          endingEquityUSD:out.endingEquityUSD,
          signalDiagnostics:signalStudy.stats});
        if(a["ledgers-dir"]){
          const path=resolve(a["ledgers-dir"],sha(JSON.stringify(plan))+".json");
          await mkdir(dirname(path),{recursive:true});
          await writeFile(path,JSON.stringify({plan,decisions:out.decisions},null,2));
        }
      }
    }
  }
  const output={name:"XMI AMD no-skip STP research",scope:"isolated_offline_no_orders",
    asOfDate:"2026-11-07",startingUSD:1000,fold:a.fold,symbol:a.symbol,
    inputSHA256:sourceHash,catalogSHA256:sha(catalogRaw),dataRows:bars.length,
    source:"PRIVATE_EXTERNAL_FIVE_MINUTE_BID_OHLC",historicalSTPBidAskVerified:false,
    actualGoldContractVerified:profileSpecVerified(spec),
    brokerCommissionUSD:0,noTimeLimit:true,holdoutRead:false,productionChanged:false,
    variants:rows.length,qualifiers:0,qualifierEvaluation:"NOT_ELIGIBLE_WITHOUT_VERIFIED_ACCOUNT_COSTS_AND_UNTOUCHED_OOS",
    comparability:"Separate standalone $1,000 runs. Shadow-only outcomes are not funded P/L.",
    rows};
  await mkdir(dirname(resolve(a.output)),{recursive:true});
  await writeFile(resolve(a.output),JSON.stringify(output,null,2)+"\n",{flag:"wx"});
  process.stdout.write(JSON.stringify({output:a.output,fold:a.fold,symbol:a.symbol,variants:rows.length,
    zeroCommission:true,holdoutRead:false,sourceHash,contractVerified:output.actualGoldContractVerified})+"\n");
}
function profileSpecVerified(spec){return spec.specStatus==="VERIFIED_ACCOUNT_SPEC";}
run().catch(e=>{process.stderr.write(e.message+"\n");process.exitCode=1;});
