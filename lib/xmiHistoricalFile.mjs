/* Explicit local historical candle import for production research; no broker connection. */
import {normalizeBars,validateResolution} from "./xmiLiveMath.mjs";
export function parseHistoricalFile(source,{symbol,resolution,now=Date.now()}){
 if(typeof source!=="string"||source.length>900000)throw Error("Historical JSON file exceeds 900 KB");
 let input;
 try{input=JSON.parse(source);}catch{throw Error("Invalid OHLC JSON file");}
 const data=Array.isArray(input)?{bars:input}:input;
 if(!data||typeof data!=="object"||Array.isArray(data)||!Array.isArray(data.bars))
  throw Error("Use a JSON array of OHLC candles or an object with a bars array");
 if(data.symbol&&String(data.symbol).replace("/","").toUpperCase()!==symbol)
  throw Error("Imported candle symbol does not match the active chart");
 if(data.resolution&&data.resolution!==resolution)
  throw Error("Imported timeframe differs from the selected chart timeframe");
 validateResolution(resolution);
 if(data.bars.length<2||data.bars.length>400)throw Error("Import between 2 and 400 actual OHLC candles");
 const bars=normalizeBars(data.bars,resolution,now);
 if(bars.length<2)throw Error("At least two distinct aligned historical candles required");
 return Object.freeze({symbol,resolution,bars});
}
