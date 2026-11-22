# Five tables before the doors open

North Quay Lighting and Mina’s café are fictional. The order, shipment and inventory evidence comes from the kit’s synthetic fixtures. The case starts with Mina’s deadline, what North Quay normally does, and why a shipping notice alone leaves her with a question.

Choose **Read Jo’s order file**. The checkout line and the packing slip both come from the shop. Read the quantities before choosing what Jo tells Mina. The resulting customer reply and assignment depend on the response and the coverage of the records. After a reply, use the replay disclosure to see what changes under another connector rule or with incomplete shipment evidence.

At four, Mina opens the carton, counts three lamps herself and asks about two loaners in another finish. Her later count supplies the business context for the loaners. The morning evaluator still sees only its shop records. In **Two loaner lamps for tonight**, three pickups have first claim and eight shoppers try the website before the café arrives. Compare listing three, five or six lamps. Switch the warehouse record from after inspection to before inspection to discover what remains knowable. A listing is a promise to customers. A count of lamps on the shelf alone cannot establish how many promises the shop can keep.

The support agent decides what to tell this customer, the fulfillment lead can supply independent handoff records, and the integration engineer can reproduce the failure. We propose the ecommerce operations manager as pilot sponsor because the role spans fulfillment and customer service. Shopify describes these responsibilities in its [support roles](https://help.shopify.com/en/manual/your-account/users/roles/predefined-roles), [warehouse and fulfillment role](https://help.shopify.com/en/manual/your-account/users/roles/role-examples), [fulfillment service developer guide](https://shopify.dev/docs/apps/build/orders-fulfillment/fulfillment-service-apps/build-for-fulfillment-services), and [operations manager overview](https://www.shopify.com/enterprise/blog/how-to-overcome-your-daily-operational-frustrations-to-focus-on-future-growth).

For the sponsor, the investment question is whether a shared evidence report saves enough review time to justify preparing and maintaining it. The worksheet values released hours at an editable labor rate. At the illustrative 40 reviews/month, 15 minutes saved, $48/hour and $4,800 first-year cost, net labor capacity is worth $960 and break-even is 12.5 minutes per review. Compare with manual review or adding a quantity check to the connector’s existing test suite. Validate the inputs by measuring comparable tickets, reopened cases and missing records during a four-week pilot on one connector.

Shopify documents total and remaining fulfillment quantities and recommends reconciling webhook-driven state against fetched records. The kit models this problem with synthetic fixtures. [Fulfillment line quantities](https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrderLineItem) · [Webhook ordering and reconciliation](https://shopify.dev/docs/apps/build/webhooks)

Choose **What would you fund?** to assign a next step to operations or engineering. The four-week pilot shows the first-year labor estimate under the displayed assumptions. These are planning inputs.

## Trace the selected order

The technical workspace carries the order packet, reply, loaner record and listing limit. Inspect the normalized handoff and its snapshot coverage. Switch the order replay while looking at the line balance to test when the evaluator can calculate an outstanding quantity. The support handoff includes the saved-run comparison. The inventory stage shows the source and storefront quantities, the warehouse quantity semantics, and the effect of the selected listing on the café.

The technical bookmark preserves those selections, the active stage and the saved comparison run. Worksheet edits and the funding choice last for the visit. The former scenario-library, workbench, report and comparison bookmarks resolve to this compact workspace.

[Shopify inventory definitions](https://help.shopify.com/en/manual/products/inventory/fundamentals/inventory-states) · [Local development](development.md) · [Architecture](architecture.md)
