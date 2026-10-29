# Expanded corpus oracle register — 2026-10-28

The original six scenarios remain covered by the portable design gate and product tests.

The following 18 expectations were authored as literal arithmetic/semantic cases before evaluation. scripts/author-corpus.py writes them without importing or calling the evaluator. Passing tests are execution evidence, not independent review.

| Scenario | Literal expectation and expected non-finding |
| --- | --- |
| duplicate-delivery | Unique S1=4 plus S2=6 fulfills 10 despite retries; no partial or surplus. |
| out-of-order-events | Latest source revision is 6, despite reversed ingestion; 10-6=4 remains; no surplus. |
| cancellation-processing | 10-6 confirmed cancellations=4 obligations; 4 handed off; no partial. |
| gross-versus-net | On-hand and available-to-sell are not equivalent; inconclusive, no mismatch. |
| damaged-quarantine | Net 8 already excludes 4 quarantined; buffer 2 publishes 6; no double subtraction or mismatch. |
| facility-aggregation | Explicitly disjoint 5+7=12; one buffer 2 yields 10; no mismatch. |
| overlapping-transfers | Overlapping stock during transfer cannot be summed; inconclusive, no mismatch. |
| duplicate-skus | Ambiguous identity blocks numeric comparison; no SKU-based inference or mismatch. |
| product-merge | Old mapping expires at 10:10 before 10:12 evaluation; inconclusive, no mismatch. |
| label-deadline | Label=10 discharges zero; 10 remain and explicit 10:10 handoff deadline is missed; no partial shipment. |
| recurrence-after-agreement | 10:09 agreement interrupts 10:06 mismatch; 10:12 recurrence alone is inconclusive; no persistent mismatch. |
| unsupported-bundles | Missing line allocation blocks exact obligations; no partial/surplus conclusion. |
| unknown-semantics | Unknown quantity meaning blocks equality even when numbers align; no mismatch. |
| unit-conversion | 2 cases x 6 each - 2 each buffer = 10 each; no mismatch. |
| conversion-boundary | Safe input MAX_SAFE_INTEGER x 2 overflows exact integer arithmetic; inconclusive, no mismatch. |
| shipment-reversal | Explicit later void of S1 removes its 4; shipped=0, remaining=10; no partial or surplus. |
| buffer-floor | max(0,12-20)=0 equals declared zero; no mismatch. |
| persistent-mismatch | Expected 12-2=10; observed 9 twice six minutes apart gives difference -1 and persistent mismatch. |

Each JSON file contains scope/snapshot IDs, source versions, freshness/cadence, mapping/policy assumptions, required capabilities, expected findings/non-findings, provenance and limits. All are original synthetic Apache-2.0 fixtures. Sources are coordinator references in SOURCES.md, not provider validation.

Additional boundary probes cover tolerance equality, conversion and aggregation true mismatches, missing/unsafe member quantities, overlapping groups, deadline equality/late/missing timestamps, incomplete coverage, duplicate IDs and input permutations. The original oracle tests continue to assert exact four/six fulfillment, stale warehouse identity/age, mapped destination scope and within-allowance reason.
