# Architecture

The Node toolkit lives in `packages/`: core validation, rules, assertions, explicit clock and evidence context; normalized capture importers; report rendering/comparison; and the CLI. Versioned contracts live in `schemas/`, 24 synthetic scenarios in `scenarios/`, and computed integration examples in `examples/`. The build emits JavaScript and portable contracts to root `dist/`. See the [CLI guide](cli-guide.md) and [import contract](IMPORTS.md).

The core separates supported diagnostics/findings from scenario assertions and behavioral integration assertions. Explicit evaluation time, account-qualified mappings, declared coverage, point captures, and policy determine sufficiency. Missing prerequisites produce uncertainty, not invented stock or proof of absence. Evidence/scenario/report schemas are 1.1.0, rules 1.1.1, tool 0.1.0; outcome/mapping/policy contracts remain 1.0.0.

`apps/demo/` is a static React application. Typed fixtures, pure six-fixture evaluator, bounded immutable history, comparisons, and client-side exports are separate from the Node engine. It shares core types and VirtualClock; Node parity tests feed actual demo facts into the core for overlapping semantics. This is not full engine equivalence: demo inventory is point-in-time, while persistent core mismatches require repeated aligned captures. Normal delay is fixture receipt latency, not general event-history analysis.

The frontend has Library, Workbench, Report, and Compare hash views. Only view identity is in the URL. State remains in memory; no server, database, API, service worker, external fonts, or telemetry is required. Vite emits static files to `apps/demo/dist`, the sole Pages artifact. JSON and standalone HTML downloads are generated in the browser from the selected report.

Metadata and user-declared coverage are assumptions, not independent proof. See [limitations](limitations.md), [compatibility](COMPATIBILITY.md), and [governance](../GOVERNANCE.md).
