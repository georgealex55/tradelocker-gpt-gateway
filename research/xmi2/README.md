# XMI 2.0 offline research on the existing gateway preview

This standalone historical-import-only research engine is ported from `georgealex55/XMI-terminal` release commit `a049cd6746961f49b41e2802aa8bfd30338d6dda`.

It is included in the **existing TradeLocker gateway Draft PR #12 preview branch** as local CLI and source modules only. The code is **not wired to broker execution, live data, scheduled jobs, Neon, or HTTP APIs**.

## Available preview
Open the existing gateway `/xmi` page and select **Historical Chart Studio · Import Only**, or navigate to `/xmi2/chart-studio.html`. This separate static page only accepts manually imported OHLC JSON and does not poll a broker.

## Offline verification
After checkout, run `node --test research/xmi2/tests/*.test.cjs`. The local research CLI tools are `xmi2-strategy-lab-cli.cjs`, `xmi2-research-bundle-cli.cjs`, `xmi2-research-checkpoint-cli.cjs`, and `xmi2-research-viewer-cli.cjs`. They only read explicitly named local historical evidence files and require independently trusted signing keys/checkpoints. They do not embed private signing keys in generated artifacts.

The prior preview's broker bridge stays code-disabled in `lib/xmiBridgePolicy.mjs`. TradeLocker production `main`, trade execution settings, cron jobs and database schemas are not modified. No claims of real-world signer identity, independent timestamps, P&L or predictive performance.
