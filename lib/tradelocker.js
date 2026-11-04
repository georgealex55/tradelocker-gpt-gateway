const env = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Missing environment variable: ${k}`);
  return v;
};

export function baseUrl() {
  return process.env.TRADELOCKER_ENV === "live"
    ? "https://live.tradelocker.com/backend-api"
    : "https://demo.tradelocker.com/backend-api";
}

// Per-serverless-instance singleflight session. Never persist or expose broker tokens.
let brokerSession=null,loginFlight=null;
function sessionExpiry(data,token,now){
  const durations=[Number(data?.expiresIn),Number(data?.expires_in)];
  const claims=String(token).split(".");
  if(claims.length===3){
    try{
      const json=JSON.parse(Buffer.from(claims[1],"base64url").toString("utf8"));
      if(Number.isFinite(json?.exp))durations.push(Math.max(0,json.exp*1000-now)/1000);
    }catch{}
  }
  const ttl=durations.find(x=>Number.isFinite(x)&&x>0);
  // Respect broker expirations with a 30s margin; unknown tokens cached for only 60s.
  return now+Math.max(0,Math.min(300,ttl===undefined?60:Math.max(0,ttl-30)))*1000;
}
function upstreamError(status,stage){
  const code=status===401?"UPSTREAM_AUTH_EXPIRED":
    status===403?"UPSTREAM_ACCESS_DENIED":
    status===402?"UPSTREAM_QUOTA":
    status===429?"UPSTREAM_RATE_LIMIT":
    status>=500?"UPSTREAM_UNAVAILABLE":"UPSTREAM_BAD_RESPONSE";
  const e=new Error("TradeLocker "+stage+" failed ("+code+")");
  e.code=code;e.status=status;
  return e;
}
export async function login({force=false}={}){
  const now=Date.now();
  if(!force&&brokerSession?.token&&brokerSession.until>now)return brokerSession.token;
  if(loginFlight)return loginFlight;
  if(force)brokerSession=null;
  const flight=(async()=>{
    const res=await fetch(`${baseUrl()}/auth/jwt/token`,{
      method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({email:env("TRADELOCKER_EMAIL"),
        password:env("TRADELOCKER_PASSWORD"),server:env("TRADELOCKER_SERVER")}),
      cache:"no-store",signal:AbortSignal.timeout(18000)
    });
    if(!res.ok)throw upstreamError(res.status,"authentication");
    let data;try{data=await res.json();}catch{throw new Error("TradeLocker authentication returned invalid JSON");}
    const token=data.accessToken||data.access_token;
    if(typeof token!=="string"||!token)throw new Error("TradeLocker authentication returned no access token");
    brokerSession={token,until:sessionExpiry(data,token,Date.now())};
    return token;
  })();
  loginFlight=flight;
  try{return await flight;}finally{if(loginFlight===flight)loginFlight=null;}
}
export async function tlFetch(path,options={}){
  if(typeof path!=="string"||!path.startsWith("/")||path.startsWith("//"))
    throw new Error("Invalid TradeLocker API path");
  const method=String(options.method||"GET").toUpperCase();
  const request=async(token)=>{
    const headers={"content-type":"application/json",
      ...(options.headers||{}),
      Authorization:`Bearer ${token}`,accNum:env("TRADELOCKER_ACC_NUM"),
      ...(process.env.TRADELOCKER_DEVELOPER_API_KEY
       ?{"developer-api-key":process.env.TRADELOCKER_DEVELOPER_API_KEY}:{})
    };
    const res=await fetch(`${baseUrl()}${path}`,{...options,headers,cache:"no-store",
      signal:options.signal||AbortSignal.timeout(18000)});
    return res;
  };
  let token=await login(),res=await request(token);
  if(res.status===401){
    // Only retry safe reads. Never replay a trade/order POST after an auth response.
    if(brokerSession?.token===token)brokerSession=null;
    if(method==="GET"){token=await login({force:true});res=await request(token);}
  }
  if(!res.ok)throw upstreamError(res.status,"request");
  try{return await res.json();}catch{throw new Error("TradeLocker returned invalid JSON");}
}

export function accountId() { return env("TRADELOCKER_ACCOUNT_ID"); }

export function validateOrder(o) {
  const allowedSides = ["buy","sell"];
  if (!allowedSides.includes(String(o.side || "").toLowerCase())) throw new Error("side must be buy or sell");
  if (!(Number(o.qty) > 0)) throw new Error("qty must be > 0");
  if (!Number.isFinite(Number(o.routeId))) throw new Error("routeId required");
  if (!Number.isFinite(Number(o.tradableInstrumentId))) throw new Error("tradableInstrumentId required");

  const maxQty = Number(process.env.MAX_ORDER_QTY || "1");
  if (Number(o.qty) > maxQty) throw new Error(`qty exceeds MAX_ORDER_QTY (${maxQty})`);

  if (process.env.REQUIRE_STOP_LOSS !== "false" && o.stopLoss == null)
    throw new Error("stopLoss required by gateway");

  return {
    qty: Number(o.qty),
    routeId: Number(o.routeId),
    side: String(o.side).toLowerCase(),
    tradableInstrumentId: Number(o.tradableInstrumentId),
    type: o.type || "market",
    validity: o.validity || "IOC",
    price: Number(o.price || 0),
    ...(o.stopLoss != null ? {stopLoss:Number(o.stopLoss), stopLossType:o.stopLossType || "absolute"} : {}),
    ...(o.takeProfit != null ? {takeProfit:Number(o.takeProfit), takeProfitType:o.takeProfitType || "absolute"} : {})
  };
}
