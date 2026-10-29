# CLI and library guide

Build from the repository root as described in [development](development.md). All examples below run from that root. Create a first report with `node dist/packages/cli/index.js demo partial-shipment --output ./first-report` before comparing it. Output creation is exclusive: choose a new directory each time.

## Three workflows

**Learn and reproduce:** a successful demo means the declared diagnostic outcome was reproduced. Expected missing orders or inconclusive checks can coexist with passing scenario assertions.

```sh
node dist/packages/cli/index.js demo missing-order --format html
node dist/packages/cli/index.js validate scenarios/partial-shipment.json
```

**Test an integration:** your own test framework runs the integration and supplies normalized outcomes. The examples calculate outcomes; they do not edit expectations.

```sh
node dist/examples/run-integration.js faulty scenarios/partial-shipment.json > faulty.jsonl
node dist/examples/run-integration.js corrected scenarios/partial-shipment.json > corrected.jsonl
node dist/packages/cli/index.js assert scenarios/partial-shipment.json --observed faulty.jsonl
# exit 1: one handed-off shipment cannot close the six outstanding units
node dist/packages/cli/index.js assert scenarios/partial-shipment.json --observed corrected.jsonl --format junit
# exit 0: supplied completed=false agrees with sufficient evidence
```

Outcomes accept a JSON object, JSON array, or JSONL, using [the outcome schema](../schemas/outcome.schema.json). Missing/empty external outcomes are INCONCLUSIVE; fixture outcomes are never injected. The corrected example only handles its documented snapshot fixture, not general revisions, reversals or production adapters.

To test inventory/order observations as well as completion outcomes, add `--capture your-evidence.json`. JSONL/CSV captures additionally require `--profile your-envelope.json`. This evaluates the scenario's diagnostic/finding expectations **and** behavioral completion assertions against the supplied evidence. Demo-only `integration-status` expectations are excluded. Missing prerequisites make positive and expected-no-finding assertions INCONCLUSIVE; a separate explicit expectation of uncertainty may pass while the raw diagnostic stays INCONCLUSIVE.

Capture observations/coverage/mappings replace fixture evidence entirely. Policy and reused source account bindings must match the scenario. Supply completion outcomes either in the external bundle, or with `--observed` and an **empty bundle outcomes array**. Supplying both is invalid (exit 3), even if the separate outcomes are empty or identical. Nothing is silently overridden. Without `--capture`, the existing outcomes-only workflow checks behavioral completion against fixture observations and never uses fixture outcomes. Library equivalents are `{mode: 'assert', observedEvidence: evidence}` or `{mode: 'assert', observedEvidence: {...evidence, outcomes: []}, observed: outcomes}`.

These examples compute faulty/corrected captures from the same scenario without changing its expectations:

```sh
node dist/examples/run-capture-integration.js inventory faulty scenarios/publication-buffer.json > faulty-capture.json
node dist/examples/run-capture-integration.js inventory corrected scenarios/publication-buffer.json > corrected-capture.json
node dist/packages/cli/index.js assert scenarios/publication-buffer.json --capture faulty-capture.json
# exit 1: published 9 instead of 10 across both snapshots
node dist/packages/cli/index.js assert scenarios/publication-buffer.json --capture corrected-capture.json
# exit 0: computed max(0, 12 - 2) = 10
node dist/examples/run-capture-integration.js order faulty examples/order-delivery.scenario.json > missing-order-capture.json
node dist/examples/run-capture-integration.js order corrected examples/order-delivery.scenario.json > delivered-order-capture.json
node dist/packages/cli/index.js assert examples/order-delivery.scenario.json --capture missing-order-capture.json
# exit 1: persistent absence violates the positive delivery contract
node dist/packages/cli/index.js assert examples/order-delivery.scenario.json --capture delivered-order-capture.json
# exit 0: mapped destination presence is supplied
```

These functions handle only their synthetic example shapes, not production collection or general reconciliation. The positive order contract is separate from the unchanged `missing-order` demo, whose expected finding still passes its educational meta assertions.

**Diagnose captures:** provide normalized evidence and explicit evaluation time. Coverage and mappings remain caller declarations.

```sh
node dist/packages/cli/index.js analyze examples/capture.json --at 2026-10-28T10:12:00Z --output ./capture-report
node dist/packages/cli/index.js analyze examples/capture.jsonl --profile profiles/inventory.json --at 2026-10-28T10:12:00Z
node dist/packages/cli/index.js analyze examples/capture.csv --profile profiles/inventory.json --at 2026-10-28T10:12:00Z
node dist/packages/cli/index.js validate examples/capture.csv --profile profiles/inventory.json
node dist/packages/cli/index.js compare first-report/report.json first-report/report.json
```

Inputs are files, not directories or archives. A stream/CSV profile is an evidence envelope with sources, coverage, mappings, policy and **empty observations**. For JSON evidence, an optional profile overrides only policy. [Import instructions](IMPORTS.md) specify exact normalization and privacy behavior. Comparison matches stable diagnostic/assertion IDs and rule/entity identities; different inputs, scenarios, policy or coverage are explicitly qualified, and incompatible versions/workflows are rejected.

## Library and packaging

```js
import { evaluate, VirtualClock, importCapture, compareReports, renderHTML } from 'commerce-reliability-kit';
const clock = new VirtualClock('2026-10-28T10:12:00Z');
const evidence = importCapture('examples/capture.json');
const report = evaluate(evidence, { mode: 'analyze', evaluationTime: clock.now() });
```

Use `evaluate(scenario)` for demo mode and `evaluate(scenario, { mode: 'assert', observed: outcomes })` for integration assertions. Inputs are validated and never mutated; report evidence is copied to preserve the run against later caller edits. No wall clock supplies evaluation time.

`npm run build` invokes `node node_modules/typescript/bin/tsc` explicitly, then copies schemas/scenarios. Library exports and CLI bin point to compiled JS, which works inside consumer `node_modules` where native TS stripping is unsupported. `npm pack --offline --ignore-scripts` after building prepares a local package; it does not publish. The package remains private. See [CI and clean-install examples](CI.md).

## Status and denominators

Reports retain separate `checks`, `assertions`, and `integrationAssertions` layers, all counts, and complete/declared/total coverage. Complete counts are supplied declarations, not counts of usable atomic evidence; inspect diagnostic prerequisites and intervals. JUnit testcases are only the selected workflow's assertions; raw diagnostic statuses and denominators remain in properties/system-out. INCONCLUSIVE and NOT APPLICABLE testcases are skipped, never promoted to passes. Analyze has zero oracle testcases.

Demo/assert exit precedence: invalid configuration/runner failure **3**; any required FAIL **1**; required INCONCLUSIVE or NOT APPLICABLE, or no required assertions **2**; otherwise **0**. Analyze exits **0** for conclusive diagnostics even with operational findings, **2** for inconclusive/no diagnostics, **3** for runner errors. Validate and compatible compare return **0**, invalid input/incompatibility **3**; compare differences are data, not CI verdicts.

