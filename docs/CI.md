# CI and local installation checks

The [Pages workflow](../.github/workflows/pages.yml) installs both lockfiles, checks types, runs toolkit/frontend tests and portable gates, builds, and inspects public files and the static artifact. See [development](development.md) for commands and [deployment](deployment.md) for promotion rules. No lint command is configured.

For user-owned integration CI, build first and supply actual normalized outcomes:

```sh
node dist/examples/run-integration.js corrected scenarios/partial-shipment.json > corrected.jsonl
node dist/packages/cli/index.js assert scenarios/partial-shipment.json --observed corrected.jsonl --format junit > results.xml
```

Collect `results.xml` without masking exit status. Faulty examples exit 1; missing outcomes exit 2 and remain skipped/inconclusive in JUnit. With `--capture`, JUnit includes diagnostic/finding expectations plus behavioral completion; demo integration-status expectations are excluded. Supply bundle outcomes alone or `--observed` with an empty bundle outcomes array. Analyze has no test oracle and zero JUnit testcases; conclusive findings can coexist with exit 0.

An offline clean-install and packed-consumer smoke can use a populated cache:

```sh
node scripts/clean-install-smoke.mjs --cache "$NPM_SMOKE_CACHE"
```

Set `NPM_SMOKE_CACHE` to an existing npm cache directory first. The script copies it into scratch, runs locked offline installation, builds, packs locally, installs into a separate consumer, imports compiled JavaScript, and creates a report. It fails if cache content is missing and never retries online. It does not publish. Tests clean temporary directories. The manual performance script is separate from normal checks and is not scheduled.
