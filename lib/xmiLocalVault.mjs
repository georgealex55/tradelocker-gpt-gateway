/* Device-local encrypted research preferences. No server, Google, or trading access. */
const ITERATIONS=310000,VERSION=1,PREFIX="xmi-device-account-v1:";
const encoder=new TextEncoder(),decoder=new TextDecoder();
function cryptoApi(){
 const c=globalThis.crypto;
 if(!c?.subtle||!c.getRandomValues)throw Error("Secure browser cryptography is required");
 return c;
}
export function usernameKey(input){
 const name=String(input||"").trim().toLowerCase();
 if(!/^[a-z][a-z0-9._-]{2,31}$/.test(name))throw Error("Use a 3–32 character username starting with a letter");
 return name;
}
export function storageKey(username){return PREFIX+usernameKey(username);}
function passwordCheck(p){
 if(typeof p!=="string"||p.length<12||p.length>128)throw Error("Password must be 12–128 characters");
}
function b64(bytes){
 let value="";for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));
 return btoa(value);
}
function un64(value,max=450000){
 if(typeof value!=="string"||value.length>max*1.5||!/^[A-Za-z0-9+/]*={0,2}$/.test(value))
  throw Error("Invalid encrypted account record");
 const data=atob(value);
 if(data.length>max)throw Error("Encrypted account too large");
 return Uint8Array.from(data,ch=>ch.charCodeAt(0));
}
function rand(n){const b=new Uint8Array(n);cryptoApi().getRandomValues(b);return b;}
async function keyFor(password,salt){
 passwordCheck(password);
 const c=cryptoApi();
 const material=await c.subtle.importKey("raw",encoder.encode(password),"PBKDF2",false,["deriveKey"]);
 return c.subtle.deriveKey({name:"PBKDF2",hash:"SHA-256",salt,iterations:ITERATIONS},
  material,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
function check(record,username){
 if(!record||record.version!==VERSION||record.username!==usernameKey(username)||
  record.kdf!=="PBKDF2-SHA256-310000"||record.cipher!=="AES-256-GCM"||
  !record.salt||!record.iv||!record.data)throw Error("Invalid local account format");
 const salt=un64(record.salt,32),iv=un64(record.iv,24);
 if(salt.length!==16||iv.length!==12)throw Error("Invalid local account salt or nonce");
 return {salt,iv};
}
function validatePreferences(p){
 if(!p||typeof p!=="object"||Array.isArray(p))throw Error("Settings are missing");
 const s=JSON.stringify(p);
 if(s.length>350000)throw Error("Settings exceed the local account size limit");
 return s;
}
async function encrypt(username,key,preferences,salt){
 const c=cryptoApi(),iv=rand(12),content=encoder.encode(validatePreferences(preferences));
 const ciphertext=await c.subtle.encrypt({name:"AES-GCM",iv,additionalData:encoder.encode(username)},key,content);
 return {version:VERSION,username,kdf:"PBKDF2-SHA256-310000",cipher:"AES-256-GCM",
  salt:b64(salt),iv:b64(iv),data:b64(new Uint8Array(ciphertext))};
}
export async function register(username,password,preferences){
 const name=usernameKey(username),salt=rand(16),key=await keyFor(password,salt);
 const record=await encrypt(name,key,preferences,salt);
 return {record,key};
}
export async function unlock(username,password,record){
 const name=usernameKey(username),{salt,iv}=check(record,name);
 const key=await keyFor(password,salt);
 try{
  const plain=await cryptoApi().subtle.decrypt({name:"AES-GCM",iv,
   additionalData:encoder.encode(name)},key,un64(record.data));
  const prefs=JSON.parse(decoder.decode(plain));
  validatePreferences(prefs);
  return {key,preferences:prefs};
 }catch{throw Error("Incorrect password or corrupted local account");}
}
export async function reseal(username,key,record,preferences){
 const name=usernameKey(username),{salt}=check(record,name);
 if(!key)throw Error("Unlock the local account before saving");
 return encrypt(name,key,preferences,salt);
}
