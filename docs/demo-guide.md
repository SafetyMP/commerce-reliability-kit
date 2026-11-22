# Stock promise desk

An omnichannel inventory planner sets an online offer for a store that also serves counter pickups. Shopify distinguishes sellable quantities from on-hand stock and documents how location fulfillment affects overselling. This informed the choice of audience and the decision to show the evidence records before asking for a listing limit. [Inventory states](https://help.shopify.com/en/manual/inventory-and-locations/fundamentals/inventory-states) · [Fulfillment locations](https://help.shopify.com/en/manual/inventory-and-locations/locations/fulfillment)

## Work a receiving packet

Open **Inspection hold**. The warehouse reports eight net sellable units and has already excluded four quarantined units. The storefront reports six on offer. Read the mapping and buffer rule, then set a listing limit. Keep counter pickups at three and online requests at eight. Run offers of six and four and compare the dispatch records. Six accepts more demand but leaves one order short. Four declines more demand and leaves one unit available. Matching a static listing policy does not guarantee fulfillment after a pickup rush.

Switch to **Cycle count**. The warehouse’s figure is on hand. You can still inspect the number of orders accepted or declined by the simulated listing, but need a comparable net record to estimate fulfillment. **Regular replenishment** supplies a net record for a different stock position.

The input records come from the repository’s [quarantine](../scenarios/damaged-quarantine.json), [cycle-count](../scenarios/gross-versus-net.json), and [replenishment](../scenarios/publication-buffer.json) fixtures. Counter demand, online demand and ordering at the counter before online fulfillment are illustrative assumptions. The desk is offline. Refresh clears the last two runs. For a pilot, replay actual redacted discrepancy cases with the inventory planner and storefront owner. Measure unsupported promises and demand turned away under the same demand and stock history.

## Technical reference

Open **Technical reference** for the import, evaluate and report components, a reproduction command, and evaluator limits. Former browser-workbench bookmarks also open this reference. [Architecture](architecture.md) · [Run locally](development.md)
