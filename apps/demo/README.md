# Commerce Reliability Kit frontend demo

React 19.2, TypeScript 5.9, and Vite 7.2 power six synthetic, deterministic examples. No accounts, backend, telemetry, external runtime assets, or persistence. The latest 12 reports remain in memory until reset, clear, or reload.

From the repository root:

```sh
npm --prefix apps/demo ci --ignore-scripts
npm --prefix apps/demo run dev
npm --prefix apps/demo test
npm --prefix apps/demo run build
npm --prefix apps/demo run preview
```

Read the [demo walkthrough](../../docs/demo-guide.md), [development checks](../../docs/development.md), [architecture](../../docs/architecture.md), and [Pages guide](../../docs/deployment.md). Set `PAGES_BASE_PATH` or Vite's `--base` for a project subpath; the local default is relative. Output is `apps/demo/dist` and local cache is `.vite-cache`.

[Faulty partial-shipment JSON](examples/partial-shipment-faulty.json) and [standalone HTML](examples/partial-shipment-faulty.html) are synthetic snapshots produced by the UI's export code. Findings describe source facts; assertions judge example behavior. Corrected missing-order diagnosis can pass while the order remains absent. Stale evidence remains inconclusive under its default policy.
