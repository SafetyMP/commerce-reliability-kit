import type { Coverage, Observation, Scenario, ScenarioId, SourceFacts, Variant } from './types.ts';
export const variants: Record<Variant, string> = { faulty: 'Faulty example', corrected: 'Corrected example', insufficient: 'Insufficient evidence' };
export const scenarios: Scenario[] = [{
  id: 'partial-shipment', title: 'Partial shipment incorrectly marked complete', category: 'Fulfillment',
  description: 'One shipment leaves. The whole order is marked complete.', behavior: 'Completion must account for every outstanding unit.',
  initialConditions: 'Order DEMO-1042 has five units ordered, none canceled, and a single handoff of three units.',
  expectedBehavior: 'Partially fulfilled — two units remain outstanding. A handoff does not complete the whole order.',
  evidenceRequired: 'Order line + complete shipment snapshot', limitations: ['A recorded handoff does not establish delivery to the customer.'],
  variants: ['faulty', 'corrected', 'insufficient'], defaults: {}, evaluationTime: '2026-10-28T10:15:00Z',
}, {
  id: 'normal-delay', title: 'Normal order synchronization delay', category: 'Orders',
  description: 'The warehouse receives an order after 12 minutes.', behavior: 'Distinguish a normal delay from a missing order.',
  initialConditions: 'DEMO-1043 is released at 10:00 UTC and received at 10:12 UTC. The default allowance is 30 minutes.',
  expectedBehavior: 'With the default allowance, the 12-minute delay is normal. A shorter allowance identifies a late arrival, not persistent absence.',
  evidenceRequired: 'Eligible order + warehouse receipt time', limitations: ['One received order cannot establish delivery guarantees for other orders.'],
  variants: ['faulty', 'corrected', 'insufficient'], defaults: { allowanceMinutes: 30 }, evaluationTime: '2026-10-28T10:15:00Z',
}, {
  id: 'missing-order', title: 'Persistent missing order', category: 'Orders',
  description: 'An eligible order stays absent beyond the allowed delay.', behavior: 'Diagnose absence only with complete, repeated observations.',
  initialConditions: 'DEMO-1044 is released at 10:00 UTC. Complete warehouse snapshots at 10:35 and 10:50 contain no matching order.',
  expectedBehavior: 'After the allowance, two complete observations at least 10 minutes apart establish persistent absence. Correct diagnosis can PASS while the order is still missing.',
  evidenceRequired: 'Eligible order + two complete warehouse scopes',
  limitations: ['Absence is limited to the declared DEMO warehouse / main / all-orders scope.', 'The fixed persistence requirement is 10 minutes; this demo does not model later recovery.'],
  variants: ['faulty', 'corrected', 'insufficient'], defaults: { allowanceMinutes: 30 }, evaluationTime: '2026-10-28T10:50:00Z',
}, {
  id: 'inventory-buffer', title: 'Inventory publication buffer', category: 'Inventory',
  description: 'Four units are intentionally withheld from publication.', behavior: 'Apply the approved buffer to already-net sellable stock.',
  initialConditions: 'Warehouse net sellable quantity is 14 each. Storefront publication is 10 each for DEMO-SKU-08 at DEMO-MAIN.',
  expectedBehavior: 'With buffer 4, max(0, 14 − 4) = 10. There is no supported inventory mismatch.',
  evidenceRequired: 'Aligned inventory snapshots + equivalent units',
  limitations: ['Net sellable quantities already exclude reservations; do not subtract them again.', 'Only a one-to-one, same-unit, same-location fixture mapping is modeled.', 'This is a point-in-time publication comparison. The full core requires repeated aligned observations to establish a persistent mismatch.'],
  variants: ['faulty', 'corrected', 'insufficient'], defaults: { buffer: 4 }, evaluationTime: '2026-10-28T10:15:00Z',
}, {
  id: 'stale-evidence', title: 'Stale warehouse evidence', category: 'Data coverage',
  description: 'The storefront is current. The warehouse capture is 45 minutes old.', behavior: 'Keep stale quantities unknown for the current comparison.',
  initialConditions: 'At 11:00 UTC, the warehouse observation is from 10:15 UTC. Both captured quantities are 10 each.',
  expectedBehavior: 'Under the default 15-minute freshness limit, the inventory assertion is INCONCLUSIVE. Corrected behavior recognizes uncertainty without inventing stock.',
  evidenceRequired: 'Inventory capture times + freshness policy',
  limitations: ['Relaxing the freshness policy accepts older evidence; it does not make that evidence current.', 'This fixture compares capture ages only; it cannot establish stock movements between observations.', 'The full core also requires aligned inventory captures. Passing this freshness-only fixture does not establish full-core comparability.'],
  variants: ['faulty', 'corrected', 'insufficient'], defaults: { freshnessMinutes: 15 }, evaluationTime: '2026-10-28T11:00:00Z',
}, {
  id: 'duplicate-shipment', title: 'Duplicate shipment event', category: 'Fulfillment',
  description: 'The same three-unit shipment arrives three times.', behavior: 'Count one shipment once, even when delivery repeats.',
  initialConditions: 'DEMO-1045 has three units ordered. DEMO-SHIP-02 is handed off once; its identical event is delivered three times.',
  expectedBehavior: 'Count three fulfilled units once, not nine. Zero units remain outstanding.',
  evidenceRequired: 'Stable shipment identity + three event deliveries', limitations: ['Deduplication assumes stable source, shipment and line identity; conflicting revisions are outside this fixture.'],
  variants: ['faulty', 'corrected', 'insufficient'], defaults: {}, evaluationTime: '2026-10-28T10:15:00Z',
}];
export function getScenario(id: string): Scenario {
  const scenario = scenarios.find(s => s.id === id);
  if (!scenario) throw new Error(`Unknown local scenario: ${id}`);
  return scenario;
}
const at = (hhmm: string) => `2026-10-28T${hhmm}:00Z`;
function coverage(id: string, sourceId: string, resource: Coverage['resource'], time = '10:12'): Coverage {
  return { id, sourceId, resource, scope: { account: `DEMO-${sourceId}`, locations: ['DEMO-MAIN'], filter: 'all' },
    snapshotId: id, observedAt: at(time), status: 'complete', pagination: 'exhausted', completenessBasis: 'user-declared',
    captureInterval: { version: '1.0.0', start: at(time), end: at(time) },
    limitations: ['Synthetic point-capture completeness declaration, not verified against a provider.'] };
}
function record(id: string, sourceId: string, snapshotId: string, observed = '10:12', event: string | null = '10:00') {
  return { id, sourceId, sourceRecordId: id, snapshotId, observedAt: at(observed),
    ...(event === null ? {} : { eventTime: at(event) }), evidenceRef: `synthetic:${id}`, unmappedFields: [] };
}
/** Six closed fixtures. Not an importer or a general reconciliation engine. */
export function sourceFacts(id: ScenarioId, variant: Variant): SourceFacts {
  const observations: Observation[] = [], scopes: Coverage[] = [];
  if (id === 'partial-shipment' || id === 'duplicate-shipment') {
    const duplicate = id === 'duplicate-shipment', orderId = duplicate ? 'DEMO-1045' : 'DEMO-1042';
    scopes.push(coverage('DEMO-order-snapshot', 'shop', 'orders'), coverage('DEMO-shipment-snapshot', 'shop', 'shipments'));
    observations.push({ ...record('DEMO-order-line', 'shop', scopes[0]!.id), entityType: 'order',
      fields: { orderId, lineId: 'DEMO-L1', productId: 'DEMO-SKU-08', ordered: duplicate ? 3 : 5, canceled: 0, eligible: true, releasedAt: at('10:00') } });
    for (let i = 1; i <= (duplicate ? 3 : 1); i++) observations.push({
      ...record(`DEMO-shipment-delivery-${i}`, 'shop', scopes[1]!.id, '10:12', '10:06'),
      sourceRecordId: duplicate ? 'DEMO-SHIP-02' : 'DEMO-SHIP-01', ingestedAt: at(`10:0${6 + i}`), entityType: 'shipment',
      fields: { shipmentId: duplicate ? 'DEMO-SHIP-02' : 'DEMO-SHIP-01', orderId, lineId: 'DEMO-L1', quantity: 3, milestone: 'handed_off', milestoneTime: at('10:06') },
    });
    if (variant === 'insufficient') { scopes[1]!.status = 'partial'; scopes[1]!.pagination = 'remaining'; }
  } else if (id === 'normal-delay' || id === 'missing-order') {
    const missing = id === 'missing-order', observed = missing ? '10:50' : '10:12', orderId = missing ? 'DEMO-1044' : 'DEMO-1043';
    scopes.push(coverage('DEMO-order-snapshot', 'shop', 'orders', observed));
    observations.push({ ...record('DEMO-released-order', 'shop', scopes[0]!.id, observed), entityType: 'order',
      fields: { orderId, eligible: true, releasedAt: at('10:00'), ordered: 1, canceled: 0, lineId: 'DEMO-L1' } });
    if (missing) scopes.push(coverage('DEMO-warehouse-35', 'warehouse', 'orders', '10:35'), coverage('DEMO-warehouse-50', 'warehouse', 'orders', '10:50'));
    else {
      scopes.push(coverage('DEMO-warehouse-receipt', 'warehouse', 'orders'));
      if (variant !== 'insufficient') observations.push({ ...record('DEMO-received-order', 'warehouse', scopes[1]!.id, '10:12', '10:12'), entityType: 'presence', fields: { orderId } });
    }
    if (variant === 'insufficient') { scopes[scopes.length - 1]!.status = 'partial'; scopes[scopes.length - 1]!.pagination = 'remaining'; }
  } else {
    const stale = id === 'stale-evidence', warehouseTime = stale ? '10:15' : '10:12', shopTime = stale ? '11:00' : '10:12';
    scopes.push(coverage('DEMO-warehouse-stock', 'warehouse', 'inventory', warehouseTime), coverage('DEMO-storefront-stock', 'shop', 'inventory', shopTime));
    observations.push({ ...record('DEMO-net-sellable', 'warehouse', scopes[0]!.id, warehouseTime, null), entityType: 'inventory',
      fields: { itemId: 'DEMO-SKU-08', locationId: 'DEMO-MAIN', ...(variant === 'insufficient' ? {} : { quantity: stale ? 10 : 14 }), unit: 'each', semantics: 'net_available', stockScope: 'sellable-main' } },
    { ...record('DEMO-published-stock', 'shop', scopes[1]!.id, shopTime, null), entityType: 'inventory',
      fields: { itemId: 'DEMO-SKU-08', locationId: 'DEMO-MAIN', quantity: 10, unit: 'each', semantics: 'available_to_sell', stockScope: 'sellable-main' } });
  }
  return { observations, coverage: scopes };
}
