#!/usr/bin/env node
"use strict";
const runner=require("./xmi2-local-benchmark.cjs"),lab=require("./xmi2-strategy-lab.cjs");
function main(args){
 if(args.length!==11)throw Error("Usage: node xmi2-strategy-lab-cli.cjs <ten benchmark evidence files> <strategy.json>");
 const inputs=args.slice(0,10).map(runner.readFile),spec=JSON.parse(runner.readFile(args[10]).toString("utf8"));
 process.stdout.write(JSON.stringify(lab.replay(inputs,spec),null,2)+"\n");
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){process.stderr.write("Offline lab refused: "+e.message+"\n");process.exitCode=1;}}
module.exports={main};
