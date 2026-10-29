#!/usr/bin/env node
/* Read-only local report. Never renders an unverified research bundle. */
"use strict";
const runner=require("./xmi2-local-benchmark.cjs");
const viewer=require("./xmi2-research-viewer.cjs");
const bytes=path=>runner.readFile(path);
const text=path=>bytes(path).toString("utf8");
const json=path=>JSON.parse(text(path));
const trimmed=path=>text(path).trim();
function count(path){
 const value=trimmed(path);
 if(!/^(0|[1-9][0-9]{0,6})$/.test(value))throw Error("Invalid pinned anchor sequence");
 return Number(value);
}
function main(args){
 if(args.length!==19)throw Error("Usage: node xmi2-research-viewer-cli.cjs <10 evidence files> <research-bundle.json> <trusted-bundle.pem> <trusted-prereg.pem> <prereg-checkpoint.txt> <signed-chain.json> <trusted-witness.pem> <anchor-head.txt> <anchor-sequence.txt> <terminal-head.txt>");
 const inputs=args.slice(0,10).map(bytes);
 const [bundle,trustBundle,trustPrereg,preregCheckpoint,links,trustWitness,anchorHead,anchorSequence,terminalHead]=args.slice(10);
 const html=viewer.view(inputs,json(bundle),text(trustBundle),text(trustPrereg),
  trimmed(preregCheckpoint),json(links),text(trustWitness),trimmed(anchorHead),
  count(anchorSequence),trimmed(terminalHead));
 process.stdout.write(html+"\n");
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){
 process.stderr.write("Verified research viewer refused: "+e.message+"\n");process.exitCode=1;
}}
module.exports={main};
