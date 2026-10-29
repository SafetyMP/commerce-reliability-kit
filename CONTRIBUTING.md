# Contributing

Use Node 22.23.2 and npm 10. Install locked dependencies with `npm ci --ignore-scripts` and `npm --prefix apps/demo ci --ignore-scripts`. Follow [development](docs/development.md) for the complete check and build commands. No lint check is currently configured. Submit focused pull requests explaining the problem and verification.

## Scenarios and semantic changes

Start with a minimal synthetic scenario and an independently reasoned oracle. Follow [scenario authoring](docs/SCENARIO-AUTHORING.md), [imports](docs/IMPORTS.md), and the [source register](docs/SOURCES.md). Supply purpose, initial conditions, capabilities, provenance, explicit evaluation time, policy, coverage, mappings, literal expectations, and limits. Include positive, boundary, and insufficient-evidence cases. State both expected findings and findings that must not appear. Never change expectations merely to match evaluator output.

A passing educational scenario can correctly detect an operational failure. Raw findings and assertion verdicts are separate; an expected INCONCLUSIVE diagnostic may satisfy an explicit meta assertion without becoming conclusive evidence. External assertions must use actual supplied outcomes or captures.

For semantic disagreements, open a scenario proposal with competing interpretations, a numerical or temporal worked example, versioned source URLs and retrieval dates, and evidence needed to distinguish them. Provider mapping proposals must state exact API/schema versions, account/location identity, stock semantics, unit conversions, coverage assumptions, normalization losses, and unresolved uncertainty. No provider endorsement or compatibility is inferred.

## Evidence and review

Recreate the smallest causal example with invented identifiers, quantities, and timestamps. Do not upload raw customer exports, credentials, personal information, merchant names, addresses, tokens, or private URLs. Inspect free text and generated reports. Pseudonymizing a customer export is not enough. Document provenance and license of borrowed material; do not copy upstream fixtures without license review.

Before review, run root typecheck, tests and build, demo tests/typecheck/build, portable gates, and publication checks in [development](docs/development.md). Record actual outcomes and limitations. Correctness changes need a reasoned oracle separate from evaluator output and an independent reviewer; if one is unavailable, leave review pending. Semantic changes need compatibility and version notes. Preserve user edits and useful tests.

Contributions are accepted under Apache-2.0; contributors retain copyright. Preserve third-party notices. Follow the [code of conduct](CODE_OF_CONDUCT.md) and [governance](GOVERNANCE.md). Core fixes and scenarios remain open and independently useful; commercial participation buys no favorable verdict.
