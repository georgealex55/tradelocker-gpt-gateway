/* Deterministic educational headline-context labels; never forecasts or trade instructions. */
const WORDS={
 up:/\b(beat|beats|surge|surges|jump|jumps|rally|rallies|stronger|growth|upgrade|upgrades|record profit|rate hike)\b/i,
 down:/\b(miss|misses|plunge|plunges|fall|falls|slump|slumps|downgrade|downgrades|recession|layoff|layoffs|weakens|rate cut)\b/i
};
export function newsContextFlag(story){
 const headline=String(story?.title||"").slice(0,180);
 const positive=WORDS.up.test(headline),negative=WORDS.down.test(headline);
 const label=positive&&!negative?"Positive language":negative&&!positive?"Negative language":"Impact unclear";
 const type=positive&&!negative?"positive":negative&&!positive?"negative":"unclear";
 return Object.freeze({type,label,
  scope:["ticker-related","pair-related"].includes(story?.scope)?"Direct mention":
    story?.scope==="currency-related"?"Currency context":"Broad market",
  notice:"Headline-language heuristic only. Direction and price impact are unverified."});
}
