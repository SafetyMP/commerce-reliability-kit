# Demo walkthrough

The static browser demo has six synthetic fixtures: partial shipment, normal delay, missing order, inventory buffer, stale evidence, and duplicate shipment. Each provides faulty, corrected, and insufficient-evidence variants. No account, credentials, backend, or telemetry is involved. See [development](development.md) to run locally.

## The order decision

The original connector closed DEMO-1042 after a three-unit handoff appeared in the shop’s shipment feed. The order and shipment records both come from the synthetic shop. At the default **Order case** view, read the order line, recorded handoff and capture coverage, then choose a support response. The reply panel reveals the tested connector output, outstanding balance and assertion verdict alongside the consequences of that response. Closing on the first handoff fails the completion assertion. Reconciling the same line quantities passes and leaves two units open. Choose **Try a partial capture** to see why a three-unit handoff alone cannot establish how many units remain. **Inspect this run’s records in the technical workspace** saves the displayed evaluation and opens its report.

Use **What will you tell the customer?** to choose closure, follow-up, or warehouse confirmation. Selecting a different rule or capture clears your previous response. Inspect the records and choose again to compare the simulated reply and fulfillment task. Try closing on a partial capture, then request confirmation to see who owns the missing evidence. Clear the response to replay.

The support agent decides what to tell this customer, the fulfillment lead can supply independent handoff records, and the integration engineer can reproduce the failure. We propose the ecommerce operations manager as pilot sponsor because the role spans fulfillment and customer service. Shopify describes these responsibilities in its [support roles](https://help.shopify.com/en/manual/your-account/users/roles/predefined-roles), [warehouse and fulfillment role](https://help.shopify.com/en/manual/your-account/users/roles/role-examples), [fulfillment service developer guide](https://shopify.dev/docs/apps/build/orders-fulfillment/fulfillment-service-apps/build-for-fulfillment-services), and [operations manager overview](https://www.shopify.com/enterprise/blog/how-to-overcome-your-daily-operational-frustrations-to-focus-on-future-growth).

For the sponsor, the investment question is whether a shared evidence report saves enough review time to justify preparing and maintaining it. The worksheet values released hours at an editable labor rate. At the illustrative 40 reviews/month, 15 minutes saved, $48/hour and $4,800 first-year cost, net labor capacity is worth $960 and break-even is 12.5 minutes per review. Compare with manual review or adding a quantity check to the connector’s existing test suite. Validate the inputs by measuring comparable tickets, reopened cases and missing records during a four-week pilot on one connector.

Shopify documents total and remaining fulfillment quantities and recommends reconciling webhook-driven state against fetched records. The kit models this problem with synthetic fixtures. [Fulfillment line quantities](https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrderLineItem) · [Webhook ordering and reconciliation](https://shopify.dev/docs/apps/build/webhooks)

## Inspect the technical cases

Open **Technical workspace** for a compact evidence guide. From there, choose the scenario library, workbench, reports, or comparison. **Return to order case** restores the support-desk case and its worksheet values within the same session.

1. Search or filter the Library, then open the recommended partial-shipment card.
2. Run **Faulty example**. Inspect order `DEMO-1042`: 5 ordered, 3 fulfilled, 2 outstanding, and a failed completion assertion.
3. Use **Inspect supporting evidence** to read normalized order, shipment, and coverage records.
4. Select **Try corrected example** and run it. Partially fulfilled is the correct output; the assertion passes with the same source facts and policy.
5. Select **Compare runs** to inspect FAIL → PASS and confirm unchanged evidence, policy, and evaluation time.
6. Open the selected report and download **JSON report** or **HTML report**. HTML is standalone and dynamic values are escaped.

The corrected missing-order example can pass while the supported finding remains. Corrected stale evidence remains INCONCLUSIVE under its default policy; stale evidence is not a stock shortage. Inventory buffer compares expected publication after the target-unit buffer; changing policy can change conclusions. Insufficient variants change evidence and comparisons flag that difference. Unknown quantities are not zero.

Navigate directly with `#case`, `#technical`, `#library`, `#workbench`, `#report`, or `#compare`. An unknown hash falls back to Library. Refresh retains the view but resets drafts and reports; report/comparison views show empty-state guidance until new runs exist. Hashes do not encode a scenario or saved report. The latest 12 reports remain only during the session; Reset demo clears everything.

Keyboard users can skip to main content, tab through native controls, inspect focused records, and scroll comparison tables. Visible focus and responsive layouts should be checked at desktop and narrow widths. Production browser acceptance must exercise search/filter, policy validation, actual downloads, refresh, back/forward, and operation with external requests blocked. Node tests cannot establish those browser behaviors.

The six-fixture evaluator is distinct from the full toolkit engine. [Architecture](architecture.md) and [limitations](limitations.md) describe their relationship. No real integration or physical stock accuracy is established.
