# Architecture

The Node toolkit lives in `packages/`: core validation, rules, assertions, explicit clock and evidence context; normalized capture importers; report rendering/comparison; and the CLI. Versioned contracts live in `schemas/`, 24 synthetic scenarios in `scenarios/`, and computed integration examples in `examples/`. The build emits JavaScript and portable contracts to root `dist/`. See the [CLI guide](cli-guide.md) and [import contract](IMPORTS.md).

The core separates supported diagnostics/findings from scenario assertions and behavioral integration assertions. Explicit evaluation time, account-qualified mappings, declared coverage, point captures, and policy determine sufficiency. Missing prerequisites produce uncertainty, not invented stock or proof of absence. Evidence/scenario/report schemas are 1.1.0, rules 1.1.1, tool 0.1.0; outcome/mapping/policy contracts remain 1.0.0.

The public React case uses the partial-shipment browser fixture. Its compact technical workspace compares the selected case with two saved evaluator reports for the same order. The URL carries the selected packet, support action, stage, comparison run, loaner stock packet and listing limit. Worksheet inputs and the sponsor’s decision stay in session memory. The business case replays separate checked-in inventory fixtures against a fictional queue of counter pickups, online requests and two café loaners. The technical view reads the same inventory selection. The browser writes no orders or inventory.

The application uses local assets and in-memory state. Vite produces the Pages artifact in `apps/demo/dist`. For the evidence model’s boundaries, see [limitations](limitations.md), [compatibility](COMPATIBILITY.md), and [governance](../GOVERNANCE.md).
