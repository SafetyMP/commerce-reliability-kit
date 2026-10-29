# Commerce Reliability Kit

Reproduce, diagnose, and test order and inventory integration failures using explicit evidence and deterministic synthetic scenarios.

[Open the live synthetic demo](https://safetymp.github.io/commerce-reliability-kit/)

**Early v0.1 toolkit and frontend demo.** The repository implements a Node CLI and library with 24 scenarios, normalized capture imports, assertions, and reports. The browser demo uses a separate, smaller six-fixture evaluator. [Source repository](https://github.com/SafetyMP/commerce-reliability-kit). No versioned package release is published.

Built for integration agencies, connector engineers, warehouse and fulfillment software teams, and merchant technical teams. For example: a connector marks an order complete after one shipment, while units remain outstanding. Inspect the evidence, run faulty and corrected examples, and compare their assertions.

![The real synthetic demo comparing faulty and corrected partial-shipment runs, with a FAIL to PASS assertion transition and unchanged evidence](docs/assets/demo-comparison.jpg)

## What exists

- A deterministic core with explicit evaluation time, order presence, fulfillment quantities and deadlines, freshness, and inventory comparison rules.
- 24 synthetic scenarios, schema validation, JSON/JSONL/normalized CSV imports, and integration assertions against user-supplied outcomes or captures.
- CLI and library APIs; JSON, standalone HTML, and JUnit reports; qualified report comparison.
- A static React demo with six scenarios, search and filters, evidence inspection, policy controls, before/after comparison, and local JSON/HTML downloads.

**A scenario can pass because it correctly detects an expected operational problem.** Findings describe supported operational facts. Assertion verdicts judge whether an expectation was met. Expected missing orders can coexist with passing demo assertions; missing evidence stays INCONCLUSIVE. Demo assertions do not certify a connector.

## Quick start

Use Node **22.23.2** and npm **10**, with the two committed lockfiles. Dependency installation needs registry access or a populated cache; analysis and evaluation run locally.

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run build
node dist/packages/cli/index.js demo partial-shipment --output ./my-first-report
npm --prefix apps/demo ci --ignore-scripts
npm --prefix apps/demo test
npm --prefix apps/demo run build
npm --prefix apps/demo run dev
```

Open `my-first-report/report.html` for the standalone toolkit report, or the local URL printed by Vite for the frontend. Existing report files are never overwritten. The package remains private and is not published to npm. There is no lint command configured.

See the [CLI and library guide](docs/cli-guide.md), [demo walkthrough](docs/demo-guide.md), and [development checks](docs/development.md). The [Pages guide](docs/deployment.md) explains production builds, validation, deployment, and rollback.

## Evidence, privacy, and limits

Demo records are synthetic. No merchant accounts are connected. No production integration has been validated by the demo. Agreement between records does not prove physical stock accuracy. No telemetry, analytics, hosted monitoring, live collectors, automatic corrections, or provider adapter catalog is included.

The demo keeps at most 12 reports in memory; refresh clears them. Reports downloaded from the demo contain synthetic data. Toolkit reports include accepted input evidence: review identifiers and free text before sharing your own captures. Strict schemas and import field filtering do not guarantee anonymity.

Coverage, mappings, and stock semantics remain caller declarations. Unknown, stale, ambiguous, or incomplete prerequisites can prevent a conclusion. General bundles, fractional conversions, returns, B2B/EDI, and arbitrary transformations are outside the current scope. See [architecture](docs/architecture.md), [limitations](docs/limitations.md), [compatibility](docs/COMPATIBILITY.md), and the dated [source register](docs/SOURCES.md).

## Participate

[Contributing](CONTRIBUTING.md) · [Support](SUPPORT.md) · [Security reports](SECURITY.md) · [Code of conduct](CODE_OF_CONDUCT.md) · [Governance](GOVERNANCE.md)

[Scenario authoring](docs/SCENARIO-AUTHORING.md) · [Roadmap](docs/roadmap.md) · [Commercial boundary](docs/COMMERCIAL-BOUNDARY.md) · [Changelog](CHANGELOG.md)

Original code, documentation, and synthetic fixtures are licensed under [Apache-2.0](LICENSE). Preserve [NOTICE](NOTICE) and third-party attribution. There is no vendor endorsement or certification claim.
