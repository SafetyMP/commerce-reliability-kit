import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../../../packages/core/index.ts';
import type { Evidence, Mapping, Policy as CorePolicy } from '../../../packages/core/types.ts';
import { evaluateScenario } from '../src/evaluator.ts';
import type { RunReport } from '../src/types.ts';

// Test-only adapter: feed the actual demo records to the actual core. No core import in the browser.
function coreEvidence(report: RunReport): Evidence {
  const fulfillment = report.scenarioId === 'partial-shipment' || report.scenarioId === 'duplicate-shipment';
  const inventory = report.scenarioId === 'inventory-buffer' || report.scenarioId === 'stale-evidence';
  const mappings: Mapping[] = [];
  if (inventory) mappings.push({ id: 'DEMO-inventory-map', version: '1.0.0', kind: 'inventory', validFrom: '2026-10-28T00:00:00Z', ambiguous: false,
    fromRef: { sourceId: 'warehouse', account: 'DEMO-warehouse', entityId: 'DEMO-SKU-08', locationId: 'DEMO-MAIN' },
    toRef: { sourceId: 'shop', account: 'DEMO-shop', entityId: 'DEMO-SKU-08', locationId: 'DEMO-MAIN' },
    factor: 1, fromUnit: 'each', toUnit: 'each', stockScope: 'sellable-main' });
  if (!fulfillment && !inventory) {
    const order = report.observations.find(o => o.entityType === 'order')!;
    assert(order.entityType === 'order');
    mappings.push({ id: 'DEMO-order-map', version: '1.0.0', kind: 'order', validFrom: '2026-10-28T00:00:00Z', ambiguous: false,
      fromRef: { sourceId: 'shop', account: 'DEMO-shop', entityId: order.fields.orderId, locationId: 'DEMO-MAIN' },
      toRef: { sourceId: 'warehouse', account: 'DEMO-warehouse', entityId: order.fields.orderId, locationId: 'DEMO-MAIN' } });
  }
  const resources = [...new Map(report.coverage.map(c => [`${c.sourceId}/${c.resource}`, c])).values()];
  const policy: CorePolicy = {
    version: '1.0.0', checks: [fulfillment ? 'fulfillment.quantities' : inventory ? 'inventory.available' : 'order.presence', 'observation.freshness'],
    synchronizationAllowanceMs: (report.policy.allowanceMinutes ?? 30) * 60000, persistenceMs: 10 * 60000,
    freshness: resources.map(c => ({ sourceId: c.sourceId, resource: c.resource, cadenceMs: 60000, freshnessLimitMs: (report.policy.freshnessMinutes ?? 60) * 60000 })),
    ...(inventory ? { inventory: { mode: 'fixed-buffer' as const, buffer: report.policy.buffer ?? 0, tolerance: 0, maxAlignmentMs: 60000, floorAtZero: true as const } } : {}),
  };
  return { schemaVersion: '1.1.0', sources: ['shop', 'warehouse'].map(id => ({ id, account: `DEMO-${id}`, provider: `synthetic-${id}`, apiVersion: 'synthetic-1' })),
    observations: structuredClone(report.observations), coverage: structuredClone(report.coverage), mappings, policy, outcomes: [] };
}
for (const id of ['partial-shipment', 'duplicate-shipment'] as const) {
  test(`real core parity: ${id} quantitative facts and incomplete scope`, () => {
    const r = evaluateScenario(id, 'corrected');
    const actual = evaluate(coreEvidence(r), { evaluationTime: r.evaluationTime });
    const check = actual.checks.find(c => c.id.startsWith('fulfillment.quantities:'))!;
    assert.equal(check.status, 'PASS');
    assert.equal(check.details.obligation, Number(r.metrics.ordered) - Number(r.metrics.canceled));
    assert.equal(check.details.shipped, r.metrics.fulfilled); assert.equal(check.details.remaining, r.metrics.outstanding);
    assert.equal(check.details.completed, r.metrics.outstanding === 0);
    const insufficient = evaluateScenario(id, 'insufficient');
    const blocked = evaluate(coreEvidence(insufficient), { evaluationTime: insufficient.evaluationTime }).checks.find(c => c.id.startsWith('fulfillment.quantities:'))!;
    assert.equal(blocked.status, 'INCONCLUSIVE'); assert.equal(blocked.details.remaining, undefined); assert.equal(insufficient.metrics.outstanding, null);
  });
}
test('real core parity: buffer quantities, default no mismatch, and unknown quantity', () => {
  for (const buffer of [0, 4, 20]) {
    const r = evaluateScenario('inventory-buffer', 'corrected', { buffer });
    const actual = evaluate(coreEvidence(r), { evaluationTime: r.evaluationTime });
    const check = actual.checks.find(c => c.id === 'inventory.available:DEMO-inventory-map')!;
    assert.equal(check.details.expectedQuantity, r.metrics.expectedPublished);
    assert.equal(check.details.observedQuantity, r.metrics.storefrontQuantity);
    if (buffer === 4) { assert.equal(check.status, 'PASS'); assert.equal(actual.findings.length, 0); }
    // The full core requires repeated observations for a persistent mismatch.
    // This UI reports only a point comparison; do not claim finding/status parity for buffer 0 or 20.
    else assert.equal(check.reason, 'insufficient_persistence');
  }
  const r = evaluateScenario('inventory-buffer', 'insufficient');
  const actual = evaluate(coreEvidence(r), { evaluationTime: r.evaluationTime });
  const check = actual.checks.find(c => c.id === 'inventory.available:DEMO-inventory-map')!;
  assert.equal(check.status, 'INCONCLUSIVE'); assert.equal(check.details.expectedQuantity, undefined); assert.equal(r.metrics.expectedPublished, null);
});
test('real core parity: stale inventory remains unknown and capture age is 45 minutes', () => {
  const r = evaluateScenario('stale-evidence', 'corrected');
  const actual = evaluate(coreEvidence(r), { evaluationTime: r.evaluationTime });
  const check = actual.checks.find(c => c.id === 'inventory.available:DEMO-inventory-map')!;
  const freshness = actual.checks.find(c => c.id.startsWith('observation.freshness:warehouse/'))!;
  assert.equal(check.status, 'INCONCLUSIVE'); assert.equal(check.details.expectedQuantity, undefined);
  assert.equal(freshness.details.ageMs, Number(r.metrics.warehouseAgeMinutes) * 60000);
  assert(actual.findings.some(f => f.ruleId === 'observation.stale'));
  assert(!actual.findings.some(f => f.ruleId === 'inventory.mismatch'));
});
test('real core parity: repeated post-allowance absence vs insufficient persistence', () => {
  for (const allowanceMinutes of [30, 40, 60]) {
    const r = evaluateScenario('missing-order', 'corrected', { allowanceMinutes });
    const actual = evaluate(coreEvidence(r), { evaluationTime: r.evaluationTime });
    const check = actual.checks.find(c => c.id === 'order.presence:shop/DEMO-1044')!;
    assert.equal(check.status, allowanceMinutes === 30 ? 'FAIL' : allowanceMinutes === 40 ? 'INCONCLUSIVE' : 'PASS');
    assert.equal(actual.findings.some(f => f.ruleId === 'order.missing'), r.findings.some(f => f.id === 'order.missing'));
    if (allowanceMinutes === 30) assert.equal(r.assertions[0]!.status, 'PASS');
  }
});
