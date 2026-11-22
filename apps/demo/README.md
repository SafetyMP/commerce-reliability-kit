# Fulfillment case

The support desk reviews a synthetic partial shipment and an operations manager weighs a reconciliation pilot. A separate compact technical workspace follows the selected order through three stages and compares two saved runs. It also contains a warehouse stock probe for replacement availability.

From the repository root:

```sh
npm --prefix apps/demo ci --ignore-scripts
npm --prefix apps/demo run dev
npm --prefix apps/demo test
npm --prefix apps/demo run build
npm --prefix apps/demo run preview
```

[Case walkthrough](../../docs/demo-guide.md) · [Development checks](../../docs/development.md) · [Architecture](../../docs/architecture.md) · [Pages guide](../../docs/deployment.md)
