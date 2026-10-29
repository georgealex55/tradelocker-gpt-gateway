#!/usr/bin/env node
/* Explicit local-only create/verify. Output is stdout; source files are never modified. */
"use strict";
const crypto=require("node:crypto");
const runner=require("./xmi2-local-benchmark.cjs");
const bundle=require("./xmi2-research-bundle.cjs");
const read=p=>runner.readFile(p);
const json=p=>JSON.parse(read(p).toString("utf8"));
const pem=p=>read(p).toString("utf8");
const checkpoint=p=>read(p).toString("utf8").trim();
function main(args){
 const action=args[0];
 if(action==="create"&&args.length===17){
  const inputs=args.slice(1,11).map(read);
  const [plan,prereg,trustPem,pinned,walk,privatePem]=args.slice(11);
  const output=bundle.create(inputs,json(plan),json(prereg),pem(trustPem),checkpoint(pinned),
   json(walk),crypto.createPrivateKey(pem(privatePem)));
  process.stdout.write(JSON.stringify(output,null,2)+"\n");
 }else if(action==="verify"&&args.length===15){
  const inputs=args.slice(1,11).map(read);
  const [artifact,trustBundlePem,trustPreregPem,pinned]=args.slice(11);
  const result=bundle.verify(inputs,json(artifact),pem(trustBundlePem),
   pem(trustPreregPem),checkpoint(pinned));
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
 }else throw Error("Usage: node xmi2-research-bundle-cli.cjs create <10 evidence files> <plan.json> <preregistration.json> <trusted-prereg-public.pem> <pinned-checkpoint.txt> <walk.json> <bundle-signing-private.pem> | verify <10 evidence files> <bundle.json> <trusted-bundle-public.pem> <trusted-prereg-public.pem> <pinned-checkpoint.txt>");
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){
 process.stderr.write("Offline research bundle refused: "+e.message+"\n");process.exitCode=1;
}}
module.exports={main};
