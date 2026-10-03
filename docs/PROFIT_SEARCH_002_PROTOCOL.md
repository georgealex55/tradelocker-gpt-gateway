# Experiment 002 protocol

One conceptual change from Experiment 001: extend the opposite H1 channel exit from 10 completed H1 bars to 12 completed H1 bars. Active universe remains USDCHF + GBPUSD. SELL-only H1 displacement entry, 2x ATR initial stop, fixed 0.01 lot, frozen session/news/loss/spread guards, dataset, sizing, and transaction-cost assumptions remain unchanged.

Dataset hash: `61e9d2fae987acf428cb8034e04514d7f84ad01e9e1a2f03d606de09ea740c14`.

The runner computes the SHA-256 hash of the canonical full configuration before results are recorded. Evaluation gates remain unchanged from the bounded-search specification. Historical/offline evaluation only.