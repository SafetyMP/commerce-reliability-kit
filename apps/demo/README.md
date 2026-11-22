# Stock promise desk

The offline React demo reads synthetic warehouse and storefront records from three project fixtures. An inventory planner sets a listing limit, replays counter pickups and online requests, and can compare the last two offers. The technical page links to the importers, rule engine and reporting package.

From the repository root:

```sh
npm --prefix apps/demo ci --ignore-scripts
npm --prefix apps/demo run dev
npm --prefix apps/demo test
npm --prefix apps/demo run build
npm --prefix apps/demo run preview
```

[Desk walkthrough](../../docs/demo-guide.md) · [Development checks](../../docs/development.md) · [Architecture](../../docs/architecture.md) · [Pages guide](../../docs/deployment.md)
