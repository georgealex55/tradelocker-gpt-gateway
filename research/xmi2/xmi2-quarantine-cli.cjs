#!/usr/bin/env node
/* Explicit diagnostic mode: no writes, no benchmark authorization, no network. */
"use strict";
const runner=require("./xmi2-local-benchmark.cjs");
const quarantine=require("./xmi2-quarantine.cjs");
function main(args){
 if(args.length!==10)throw Error("Usage: node xmi2-quarantine-cli.cjs <ten local benchmark input files>");
 const result=quarantine.inspect(args.map(runner.readFile),runner.evaluate);
 process.stdout.write(JSON.stringify(result,null,2)+"\n");
 if(result.status==="quarantined")process.exitCode=2;
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){process.stderr.write("Quarantine refused: "+e.message+"\n");process.exitCode=1;}}
module.exports={main};
