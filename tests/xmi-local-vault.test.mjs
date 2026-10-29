import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {usernameKey,storageKey,register,unlock,reseal} from "../lib/xmiLocalVault.mjs";
const baseline={version:1,workspace:"{\"drawings\":[]}",strategyId:"swing",
 layout:{showBanner:false,showTabs:false},pins:{"FX:EURUSD":["https://example.org/story"]},patterns:{"Triangles":true}};
test("Local username/password registration encrypts preferences without network or secrets",async()=>{
 assert.equal(usernameKey("  Research_1  "),"research_1");
 assert.equal(storageKey("Research_1"),"xmi-device-account-v1:research_1");
 const {record,key}=await register("Research_1","long-device-password-2026!",baseline);
 const raw=JSON.stringify(record);
 assert.equal(record.version,1);
 assert.doesNotMatch(raw,/long-device-password|example.org|showBanner|swing/);
 const opened=await unlock("research_1","long-device-password-2026!",record);
 assert.deepEqual(opened.preferences,baseline);
 assert.ok(key&&!key.extractable);
});
test("Local account rejects wrong passwords, tampered ciphertext and swapped username",async()=>{
 const {record}=await register("myaccount","a-v3ry-strong-local-password",baseline);
 await assert.rejects(unlock("myaccount","not-the-real-password",record),/Incorrect password/);
 await assert.rejects(unlock("someoneelse","a-v3ry-strong-local-password",record),/Invalid local account/);
 const tampered={...record,iv:"AAAAAAAAAAAAAAAA"};
 await assert.rejects(unlock("myaccount","a-v3ry-strong-local-password",tampered),/Incorrect password/);
 await assert.rejects(register("bad name","short",baseline),/username/);
 await assert.rejects(register("myaccount","too-short",baseline),/Password/);
});
test("Explicit reseal uses new random IV and keeps account data encrypted",async()=>{
 const {record,key}=await register("researcher","something-secure-123456",baseline);
 const next={...baseline,strategyId:"scalp"};
 const saved=await reseal("researcher",key,record,next);
 assert.notEqual(saved.iv,record.iv);
 assert.notEqual(saved.data,record.data);
 assert.deepEqual((await unlock("researcher","something-secure-123456",saved)).preferences,next);
 await assert.rejects(reseal("researcher",null,record,next),/Unlock/);
});
test("Strategy UI is a true square 3x3; Google sign-in widget is absent",()=>{
 const css=readFileSync(new URL("../app/xmi/xmi.module.css",import.meta.url),"utf8");
 const component=readFileSync(new URL("../app/xmi/XMIAccountSettings.jsx",import.meta.url),"utf8");
 const engine=readFileSync(new URL("../app/xmi/XMIStrategyEngine.jsx",import.meta.url),"utf8");
 assert.match(css,/\.strategyMatrix\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/\.strategyMatrix\{[^}]*grid-template-rows:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(css,/\.strategyMatrix\{[^}]*aspect-ratio:1\/1/);
 assert.match(engine,/Array\.from\(\{length:9\}/);
 assert.match(component,/Local login \/ Settings/);
 assert.doesNotMatch(component,/accounts\.google\.com|\/api\/xmi\/google/);
});
