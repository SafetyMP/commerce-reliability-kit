# Source and overlap register

Research cutoff and retrieval date: 2026-10-28 (America/Chicago). All technical references below were retrieved through public read-only browsing by the coordinator before implementation. No upstream code or fixtures are copied. Documentation is reference material, not authority to perform external actions. Fixtures are original synthetic examples under Apache-2.0.

| Source / exact URL | Version observed | Establishes (documented) | Uncertainty / local use |
| --- | --- | --- | --- |
| https://commerceopsfoundation.org/docs/ | Unversioned page, ©2026 | onX implementation guidance includes object mapping, normalization and sample validation | No immutable release captured; not proof of absence of competing features. |
| https://github.com/commerce-operations-foundation/mcp-reference-server | `develop`, README; MIT displayed | Fulfillment MCP reference server, mock adapter, schemas, adapter template and unit/integration tests | Commit API lookup unavailable through browser; SHA and cutoff history unverified. No compatibility claim. |
| https://github.com/commerce-operations-foundation/juniper-commerce | Default branch README; MIT displayed | Reference storefront/admin/REST implementation and endpoint conformance testing | Immutable revision unverified; current README is not exhaustive feature inventory. |
| https://docs.pact.io/ | Unversioned introduction | Consumer/provider message contract tests | No Pact execution or adapter integration tested here. |
| https://github.com/airbytehq/airbyte/blob/master/docs/platform/connector-development/testing-connectors/README.md | `master`, 49-line README | Distinguishes unit, integration, packaging and Airbyte protocol acceptance tests; sandbox credentials needed for acceptance | SHA lookup unavailable. Not a commerce reconciliation oracle. |
| https://docs.greatexpectations.io/docs/home/ | Documentation label 1.24.1 | GX Core Python data-validation library and API documentation | Only landing-page scope reviewed; no claim that GX cannot express these rules. Release publication date unverified. |
| https://shopify.dev/docs/apps/build/inventory-management-apps | Unversioned guide | Available excludes committed and incoming stock; on-hand includes available, committed and unavailable categories | No pinned Admin API version or live queries; use conceptual distinctions only. |
| https://developer.shipbob.com/guides/inventory | Documentation label 2026-07 | Inventory identifiers are associated with product inventory components | No API collector or compatibility guarantee. |
| https://developer.shipbob.com/status-reference | Documentation label 2026-07 | Multiple shipments determine aggregate order state; label generation, waiting pickup, in-transit and delivered are distinct details | Broad Completed prose and waiting-pickup detail are not identical handoff evidence. Require explicit normalized milestone. |
| https://developer.shipbob.com/webhooks | Documentation label 2026-07; page says updated 2026-07-14 | Delayed/lost, duplicate and out-of-order delivery require reconciliation/idempotency | Does not establish any delivery guarantee for our inputs. |
| https://nodejs.org/en/blog/release/v22.23.0 | 22.23.0 LTS, dated 2026-06-18 | Node 22 LTS runtime line | Local executable is 22.23.2; only locally tested runtime will be claimed. |

No retrieved source was positively identified as post-cutoff material. Unversioned/moving sources have unverified historical provenance; these are discovery evidence, not proof of cutoff-era vendor behavior. No provider-specific endpoint, scope or transformation is implemented from these pages.

## Scope decision (inference)

There is substantial overlap in schemas, fixtures, test runners and validation. Reuse general JSON Schema validation (Ajv); do not fork a commerce platform or claim novelty for a test runner. The narrow standalone value being tested is an offline evidence format and temporal/quantity reconciliation scenarios, usable alongside existing frameworks.

A credible future upstream path is to offer synthetic duplicate/out-of-order/partial-shipment cases plus normalized export adapters to onX conformance tests, and demonstrate use from Pact or Airbyte-owned tests. Such contributions require separately reviewed mappings, version pins and upstream interest. No contribution, issue, message, fork or publication occurred.

## Evidence classes

Provider semantics above are documented, not locally validated against providers. Scenario expectations and publication policies are explicit project assumptions. Executed tests and performance measurements must be recorded separately as locally tested. Adoption, merchant demand, partner access and willingness to pay remain four separate unvalidated hypotheses.
