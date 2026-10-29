# Changelog

## Security maintenance — unreleased, 2026-10-29

- Update Ajv from 8.17.1 to 8.18.0 and Vite from 7.2.2 to 7.3.7, including Vite-required esbuild dependencies, to address reported dependency security advisories.

## 0.1.0 — unreleased, 2026-10-28

- 24 synthetic scenarios, deterministic order/fulfillment/inventory/freshness checks, explicit evaluation time, nonoverlapping facility aggregation, and shipment deadlines.
- Normalized JSON/JSONL/CSV capture imports, external integration assertions, and compatible report comparison.
- JSON, escaped standalone HTML, and JUnit reports with separate diagnostic/assertion denominators.
- Evidence/scenario/report contract 1.1.0: point-capture boundaries and conservative unknown/non-atomic handling. External captures evaluate diagnostic/finding expectations plus completion without injecting fixture outcomes.
- Rules 1.1.1 retain mapped orders, orphan shipment obligations, and blocked deadlines as inconclusive subjects instead of silently removing them from finding-absence checks.
- Six-fixture React demo with evidence inspection, policy controls, comparison, bounded session history, and local JSON/HTML downloads.
- Public contribution/security/support guidance, Pages workflow, hash navigation, static metadata, and publication inventory checks.

No release tag, registry publication, provider validation, or production certification is implied. See [compatibility](docs/COMPATIBILITY.md) for version boundaries.
