# Normalized capture imports

All accepted identifiers, units, status meanings and coverage declarations are supplied by the caller. This is not a vendor export mapper. Start from examples/capture.json, examples/capture.jsonl, examples/capture.csv and profiles/inventory.json. The JSON example is exactly a normalized evidence envelope. JSONL has one normalized observation object per nonempty line; CSV has one observation per row.

For JSONL/CSV, --profile points to a complete evidence envelope whose observations array is empty. It supplies schemaVersion, sources, coverage, mappings, outcomes and policy. For JSON input, an optional profile replaces only its policy; capture sources/mappings/coverage remain unchanged. Analyze evaluation time is supplied with --at; assertion mode uses the scenario evaluation time. No importer asserts independently verified completeness.

External assertion mode accepts these same formats via `assert scenario.json --capture evidence.json --observed outcomes.jsonl`; streams/CSV also use `--profile`. It uses the scenario evaluation time and requires an unchanged scenario policy. Capture observations/coverage/mappings replace fixture evidence. External bundle outcomes are used when --observed is absent. When --observed is present, the bundle outcomes array must be empty; otherwise input is invalid, even when values match or the separate file is empty. Without --capture, fixture outcomes are never substituted. Diagnostic/finding assertions run alongside completion assertions; demo integration-status meta assertions are excluded. Missing/incomplete captured evidence remains INCONCLUSIVE, even when fixture evidence would have supported an assertion. Missing coverage with retained linked rows is invalid; missing coverage and rows is valid insufficient evidence. No missing data is filled from fixtures. Policy and reused source account bindings remain enforced.

CSV uses a header row and comma-separated fields; double quotes escape commas/newlines and doubled quotes escape a quote. CRLF and LF are accepted. Common columns: id, sourceId, sourceRecordId, entityType, snapshotId, observedAt, evidenceRef. Optional common timestamps: eventTime, updatedTime, ingestedAt. Entity columns are flat:

| Entity | Columns |
| --- | --- |
| order | orderId, lineId, productId, ordered, canceled, eligible, releasedAt |
| presence | orderId |
| shipment | shipmentId, orderId, lineId, quantity, milestone, milestoneTime, reversalOf |
| inventory | itemId, locationId, quantity, unit, semantics, stockScope |

Required fields still depend on the evidence schema. Blank cells omit the value; missing is never zero. Nonnegative safe integers use decimal digits without signs, exponent notation, decimals or padding. Booleans are exactly true/false. No formula is evaluated. There is no CSV export, so no spreadsheet-formula escape contract is implied. A formula in a numeric field is invalid; unknown fields are discarded with visible loss markers.

Only the known observation metadata and entity fields survive capture import. Unknown field values, including privacy fields, are dropped and counted as excluded-field-N in each observation's unmappedFields. Unknown field names themselves may be sensitive, so markers are ordinal rather than copies of arbitrary names. User-supplied safe unmappedFields names are retained. Review those names before sharing. Loss counts are visible in JSON and the HTML observation section; callers must assess whether lost data blocks a conclusion. Declared missing prerequisites still yield INCONCLUSIVE.

Unknown envelope, policy, mapping and coverage fields are rejected rather than silently changed. Unknown entity types, conflicting IDs, malformed CSV, oversized files, deep JSON and prototype keys are invalid. Strict validate on an unimported JSON scenario/evidence file rejects unknown fields; analyze imports observation fields first. For CSV/JSONL, validate performs the same normalization as analyze.

Limits: 32 MiB per file, JSON nesting 32, CSV columns 128. Use files, not directories, URLs, archives or symlinks. On platforms with symlinked temporary aliases, pass the canonical path. Safe local identifiers use letters/digits/underscore/dot/colon/hyphen; slash is reserved for composite rule IDs. Map raw identifiers to stable explicit aliases; do not collapse different originals. Keep mapping losses, assumptions and coverage limitations visible.

Do not share captured merchant records publicly. Recreate a minimal case using new synthetic identifiers, times and quantities while retaining the causal relationship; remove text and credentials, independently calculate the oracle, and review every resulting report before contribution.

## Capture interval contract (evidence 1.1.0)

Coverage carries `captureInterval: {"version":"1.0.0","start":"2026-10-28T10:12:00Z","end":"2026-10-28T10:12:00Z"}`. Boundaries are inclusive UTC instants, with millisecond precision at most. Each boundary may explicitly be null (unknown); omission of the whole interval also means unknown. A supplied interval must include its version and both boundaries. Unknown versions, malformed timestamps, reversed known boundaries, and observedAt outside any known boundary are invalid. Ordering and containment require runtime validation in addition to portable JSON Schema's shape/format checks. The existing rule that rows match their coverage observedAt remains.

Only `start=end=observedAt` is atomic for v0.1 snapshot reasoning. Never turn a paginated scan into a point capture by assigning its last-page/completion/ingestion timestamp to every row. Declare the real collection interval, or unknown boundaries if unavailable. Nonzero-width intervals remain INCONCLUSIVE even if complete and recently finished; this release does not reconstruct simultaneous inventory, collection consistency, or negative order evidence from such scans. Future known boundaries block current conclusions. Freshness ages use capture start where known; ingestion cannot refresh evidence. Source eventTime/updatedTime remain source chronology and are preserved separately.

JSON envelopes hold intervals in coverage; JSONL/CSV rows inherit their interval from the explicit envelope profile, not from inferred row extrema. Public JSON/JSONL/CSV samples describe the same point snapshots. Reports retain exact declarations in JSON, HTML coverage and JUnit system-out, including unknown boundaries. Summary complete counts still mean declared complete/exhausted, not sufficient temporal evidence.

Old 1.0.0 envelopes must be explicitly migrated to 1.1.0. Copy observedAt into both boundaries only when the producer knows it was a point capture (as all bundled synthetic fixtures are). Otherwise leave the interval absent or record unknown boundaries; do not invent atomicity. No automatic version or interval upgrade is performed.
