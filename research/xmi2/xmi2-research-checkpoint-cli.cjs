#!/usr/bin/env node
/* Explicit local inputs, stdout-only offline checkpoint sealing/verification. */
"use strict";
const crypto=require("node:crypto");
const runner=require("./xmi2-local-benchmark.cjs");
const chain=require("./xmi2-research-checkpoint.cjs");
const read=path=>runner.readFile(path);
const utf8=path=>read(path).toString("utf8");
const json=path=>JSON.parse(utf8(path));
const trim=path=>utf8(path).trim();
function count(path){const value=trim(path);if(!/^(0|[1-9][0-9]{0,6})$/.test(value))throw Error("Invalid local checkpoint sequence");return Number(value);}
function main(args){
 const action=args[0];
 if(action==="seal"&&args.length===19){
  const inputs=args.slice(1,11).map(read);
  const [bundle,trustBundle,trustPrereg,preregCheckpoint,witnessPrivate,previousHead,sequence,declaredAt]=args.slice(11);
  const result=chain.seal(inputs,json(bundle),utf8(trustBundle),utf8(trustPrereg),trim(preregCheckpoint),
   crypto.createPrivateKey(utf8(witnessPrivate)),trim(previousHead),count(sequence),trim(declaredAt));
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
 }else if(action==="verify"&&args.length===20){
  const inputs=args.slice(1,11).map(read);
  const [bundle,trustBundle,trustPrereg,preregCheckpoint,links,trustWitness,anchorHead,anchorSequence,terminalHead]=args.slice(11);
  const result=chain.verifyAnchoredBundle(inputs,json(bundle),utf8(trustBundle),utf8(trustPrereg),
   trim(preregCheckpoint),json(links),utf8(trustWitness),trim(anchorHead),count(anchorSequence),trim(terminalHead));
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
 }else{
  throw Error("Usage: node xmi2-research-checkpoint-cli.cjs seal <10 evidence files> <research-bundle.json> <trusted-bundle-public.pem> <trusted-prereg-public.pem> <prereg-checkpoint.txt> <witness-private.pem> <previous-head.txt> <next-sequence.txt> <declared-time.txt> | verify <10 evidence files> <research-bundle.json> <trusted-bundle-public.pem> <trusted-prereg-public.pem> <prereg-checkpoint.txt> <chain.json> <trusted-witness-public.pem> <anchor-head.txt> <anchor-sequence.txt> <independently-retained-terminal-head.txt>");
 }
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){
 process.stderr.write("Offline checkpoint refused: "+e.message+"\n");process.exitCode=1;
}}
module.exports={main};
