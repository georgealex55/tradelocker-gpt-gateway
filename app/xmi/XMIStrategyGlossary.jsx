import styles from "./xmi.module.css";

const GROUPS = [
 {
  id: "xmi-glossary-indicators",
  title: "Indicators",
  cards: [
   ["EMA · Exponential moving average",
    "Closing prices, with greater weight on recent candles.",
    "Compares a faster average with a slower one. The day preset uses EMA20 and EMA50, while the swing preset uses EMA50 and EMA200."],
   ["VWAP · Volume-weighted average price",
    "The average price over a reference period, weighted by the volume of each candle.",
    "Compares the close with the session reference when volume is available. A price-only Forex feed cannot calculate VWAP."],
   ["RSI · Relative strength index",
    "The balance of recent gains and losses on a scale from 0 to 100.",
    "Checks whether momentum meets the upper or lower threshold set in the research preset."],
   ["MACD · Moving average convergence/divergence",
    "The difference between two EMAs, compared with a smoothed signal line.",
    "Reads the histogram above or below zero to check momentum alignment."],
   ["Volume",
    "Trading activity per candle, or the number of price updates on a feed that supplies tick volume.",
    "Shows activity alongside price. XMI labels the source and leaves the study unavailable when the feed supplies no volume."],
   ["ATR · Average true range",
    "Typical candle movement, including gaps from the previous close.",
    "Checks volatility in pips. The EUR/USD scalp study also uses ATR to estimate a hypothetical stop distance."],
   ["ADX · Average directional index",
    "Trend strength calculated from directional price movement.",
    "Checks whether a trend is strong enough for a preset. The +DI and −DI lines describe direction separately."],
   ["Bollinger Bands",
    "A moving average and bands a chosen number of standard deviations away from it.",
    "Shows where price sits relative to its recent range of variation and whether the bands are widening or narrowing."],
   ["Donchian Channels",
    "The highest high and lowest low over a lookback window.",
    "The GBP/USD breakout preset compares the close with the prior bars’ boundaries, excluding the candle being evaluated."],
   ["Stochastic oscillator",
    "Where the close sits inside the recent high-to-low range.",
    "The USD/JPY pullback preset compares %K with its smoothed %D line for a momentum check."],
  ],
 },
 {
  id: "xmi-glossary-structure",
  title: "Market structure",
  cards: [
   ["BOS · Break of structure",
    "A candle closes beyond an established swing high or swing low.",
    "XMI marks BOS when the break continues or establishes the structure direction."],
   ["CHoCH · Change of character",
    "A candle closes through a swing level opposite the previous structure direction.",
    "Marks a possible change in the sequence of highs and lows."],
   ["MSS · Market structure shift",
    "An opposing structure break accompanied by a strong directional candle.",
    "Highlights an opposing break that also meets XMI’s displacement condition."],
   ["HH, HL, LH and LL",
    "Higher high, higher low, lower high and lower low. Each compares a confirmed pivot with the previous pivot of the same kind.",
    "Describes the sequence of swings. XMI waits for two candles to close after a pivot before confirming it."],
   ["Support and resistance",
    "Price levels where earlier declines or advances paused and reversed.",
    "Uses confirmed swing lows for support and confirmed swing highs for resistance."],
   ["FVG · Fair value gap",
    "A three-candle pattern where the first and third candles’ price ranges leave an area between them.",
    "Draws that area as a price imbalance to track in subsequent candles."],
   ["Order block",
    "The last opposite-direction candle before a qualifying directional break.",
    "Highlights that candle’s range as a research zone."],
   ["Liquidity sweep",
    "A wick passes a confirmed swing level and the candle closes back inside it.",
    "Marks a brief breach and rejection of the level."],
   ["Displacement",
    "A wide directional candle relative to preceding closed candles.",
    "Helps identify a strong move during a structure break."],
   ["Premium and discount",
    "Price above or below the midpoint of the latest confirmed swing range.",
    "Shows which half of the selected range contains the close."],
   ["Session high and low",
    "The highest and lowest prices inside a completed reference session.",
    "Plots levels from fixed UTC windows after each session closes."],
  ],
 },
 {
  id: "xmi-glossary-patterns",
  title: "Chart patterns",
  cards: [
   ["Double top and double bottom",
    "Two similar swing highs separated by a dip, or two similar swing lows separated by a bounce.",
    "XMI marks the shape from confirmed pivots. A close through the intervening level is a separate reversal check."],
   ["Triple top and triple bottom",
    "Three swings testing roughly the same upper or lower price area.",
    "Highlights a repeated test of a level for further review."],
   ["Head and shoulders",
    "Three swings with a larger middle peak. The inverse version has a deeper middle trough.",
    "Identifies a possible reversal shape. The neckline connects the two intervening pivots."],
   ["Triangles",
    "Swing boundaries that converge as the price range narrows.",
    "Highlights compression where a later close beyond a boundary can be reviewed separately."],
   ["Flags and pennants",
    "A short consolidation after a sharp move. Flags tend to have parallel boundaries, while pennants converge.",
    "Marks a pause in the earlier move so the next break can be evaluated."],
   ["Wedges",
    "Two sloped boundaries moving in the same direction while drawing closer together.",
    "Highlights compression inside a rising or falling range."],
   ["Channels",
    "Price swings bounded by roughly parallel lines.",
    "Shows how price moves between the upper and lower boundaries of a trend or range."],
  ],
 },
];

export default function XMIStrategyGlossary({ headingRef }) {
 return (
  <section className={styles.strategyGlossary} aria-labelledby="xmi-strategy-glossary">
   <header>
    <p className={styles.eyebrow}>Strategy reference</p>
    <h3 id="xmi-strategy-glossary" ref={headingRef} tabIndex={-1}>Strategy glossary</h3>
    <p>See what each indicator or pattern looks at and how XMI uses it in research.</p>
   </header>
   <nav className={styles.glossaryLinks} aria-label="Glossary categories">
    {GROUPS.map(group => <a key={group.id} href={"#" + group.id}>{group.title}</a>)}
   </nav>
   {GROUPS.map(group => (
    <section key={group.id} className={styles.glossaryGroup} aria-labelledby={group.id}>
     <h4 id={group.id}>{group.title}</h4>
     <div className={styles.glossaryGrid}>
      {group.cards.map(([name, reads, use]) => (
       <article key={name} className={styles.glossaryCard}>
        <h5>{name}</h5>
        <dl>
         <dt>Looks at</dt><dd>{reads}</dd>
         <dt>How to read it in XMI</dt><dd>{use}</dd>
        </dl>
       </article>
      ))}
     </div>
    </section>
   ))}
   <footer className={styles.glossarySources}>
    <span>Reference guides</span>
    <a href="https://www.fidelity.com/learning-center/trading-investing/technical-analysis" target="_blank" rel="noreferrer">Technical indicators</a>
    <a href="https://www.tradingview.com/support/solutions/43000502018-volume-weighted-average-price-vwap/" target="_blank" rel="noreferrer">VWAP</a>
    <a href="https://www.tradingview.com/support/solutions/43000502253-donchian-channels-dc/" target="_blank" rel="noreferrer">Donchian Channels</a>
    <a href="https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-patterns/double-top-reversal" target="_blank" rel="noreferrer">Double top</a>
   </footer>
  </section>
 );
}
