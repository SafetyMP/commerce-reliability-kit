# Fulfillment case and technical workspace

## The order decision

The original connector closed DEMO-1042 after a three-unit handoff appeared in the shop’s shipment feed. The order and shipment records both come from the synthetic shop. At the default **Order case** view, read the order line, recorded handoff and capture coverage, then choose a support response. The reply panel reveals the tested connector output, outstanding balance and assertion verdict alongside the consequences of that response. Closing on the first handoff fails the completion assertion. Reconciling the same line quantities passes and leaves two units open. Choose **Try a partial capture** to see why a three-unit handoff alone cannot establish how many units remain. **Trace this order in the technical workspace** carries the current packet and selected support action into the inspector.

Use **What will you tell the customer?** to choose closure, follow-up, or warehouse confirmation. Selecting a different rule or capture clears your previous response. Inspect the records and choose again to compare the simulated reply and fulfillment task. Try closing on a partial capture, then request confirmation to see who owns the missing evidence. Clear the response to replay.

The support agent decides what to tell this customer, the fulfillment lead can supply independent handoff records, and the integration engineer can reproduce the failure. We propose the ecommerce operations manager as pilot sponsor because the role spans fulfillment and customer service. Shopify describes these responsibilities in its [support roles](https://help.shopify.com/en/manual/your-account/users/roles/predefined-roles), [warehouse and fulfillment role](https://help.shopify.com/en/manual/your-account/users/roles/role-examples), [fulfillment service developer guide](https://shopify.dev/docs/apps/build/orders-fulfillment/fulfillment-service-apps/build-for-fulfillment-services), and [operations manager overview](https://www.shopify.com/enterprise/blog/how-to-overcome-your-daily-operational-frustrations-to-focus-on-future-growth).

For the sponsor, the investment question is whether a shared evidence report saves enough review time to justify preparing and maintaining it. The worksheet values released hours at an editable labor rate. At the illustrative 40 reviews/month, 15 minutes saved, $48/hour and $4,800 first-year cost, net labor capacity is worth $960 and break-even is 12.5 minutes per review. Compare with manual review or adding a quantity check to the connector’s existing test suite. Validate the inputs by measuring comparable tickets, reopened cases and missing records during a four-week pilot on one connector.

Shopify documents total and remaining fulfillment quantities and recommends reconciling webhook-driven state against fetched records. The kit models this problem with synthetic fixtures. [Fulfillment line quantities](https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrderLineItem) · [Webhook ordering and reconciliation](https://shopify.dev/docs/apps/build/webhooks)

Choose **What would you fund?** to assign a next step to operations or engineering. The four-week pilot shows the first-year labor estimate under the displayed assumptions. These are planning inputs.

## Trace the selected order

Select a support action, then open the technical workspace. Step through **Capture the records**, **Reconcile the line** and **Hand off the exception**. Compare the selected packet with the saved first-handoff and line-reconciliation runs. The two saved runs share the same order and shipment records but produce different connector outputs. A partial capture in the business case leaves its own balance unknown even when the saved run has complete evidence. The comparison link can be bookmarked. Returning to the case keeps the selected packet and response; the worksheet and funding decision stay in memory during the visit.

Under **Before promising a replacement**, a compact stock check reuses the inspection-hold and cycle-count fixtures. These records concern a different item. They explain why an order-line discrepancy alone cannot establish replacement availability. The former scenario-library, workbench, report and comparison bookmarks resolve to the compact technical workspace.

[Shopify inventory definitions](https://help.shopify.com/en/manual/inventory-and-locations/fundamentals/inventory-states) · [Local development](development.md) · [Architecture](architecture.md)
