import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateScenario, scenarios } from '../src/evaluator.ts';
import { sourceFacts } from '../src/fixtures.ts';
import type { Policy, ScenarioId, Variant } from '../src/types.ts';

test('partial shipment preserves 5/0/3/2 and judges completion against outstanding units', () => {
  const bad = evaluateScenario('partial-shipment', 'faulty'), good = evaluateScenario('partial-shipment', 'corrected');
  assert.equal(bad.metrics.order, 'DEMO-1042');
  assert.deepEqual([bad.metrics.ordered, bad.metrics.canceled, bad.metrics.fulfilled, bad.metrics.outstanding], [5, 0, 3, 2]);
  assert.equal(bad.assertions[0]!.status, 'FAIL');
  assert.equal(bad.assertions[0]!.expected, 'Partially fulfilled');
  assert.equal(bad.assertions[0]!.observed, 'Complete');
  assert.match(bad.assertions[0]!.reason, /Outstanding quantity was incorrectly treated as fulfilled/);
  assert.equal(good.assertions[0]!.status, 'PASS');
  assert.equal(good.findings[0]!.id, 'fulfillment.partial');
});
for (const s of scenarios) {
  test(`${s.id}: deterministic, same source facts across implementations, immutable report`, () => {
    const a = evaluateScenario(s.id, 'faulty'), b = evaluateScenario(s.id, 'corrected');
    assert.deepEqual(a.observations, b.observations);
    assert.deepEqual(a.coverage, b.coverage);
    assert.equal(a.evidenceIdentity, b.evidenceIdentity);
    assert.deepEqual(b, evaluateScenario(s.id, 'corrected'));
    assert.equal(b.evaluationTime, new Date(s.evaluationTime).toISOString());
    assert.equal(b.assertions[0]!.status, s.id === 'stale-evidence' ? 'INCONCLUSIVE' : 'PASS');
    assert.equal(a.assertions[0]!.status, s.id === 'stale-evidence' ? 'INCONCLUSIVE' : 'FAIL');
    assert.throws(() => b.observations.pop(), TypeError);
    assert.throws(() => { b.assertions[0]!.status = 'FAIL'; }, TypeError);
    const freshFacts = sourceFacts(s.id, 'corrected'); freshFacts.observations.pop();
    assert.equal(evaluateScenario(s.id, 'corrected').evidenceIdentity, b.evidenceIdentity);
  });
  test(`${s.id}: missing evidence remains inconclusive and all references resolve`, () => {
    const r = evaluateScenario(s.id, 'insufficient');
    assert(r.assertions.some(a => a.status === 'INCONCLUSIVE'));
    assert.notEqual(r.evidenceIdentity, evaluateScenario(s.id, 'corrected').evidenceIdentity);
    const available = new Set([...r.observations, ...r.coverage].map(o => o.id));
    for (const item of [...r.assertions, ...r.findings]) for (const id of item.evidence) assert(available.has(id));
    assert(!JSON.stringify(r).includes('NaN'));
  });
}
test('normal delay is a 12-minute receipt; allowance changes diagnosis, not source facts', () => {
  const normal = evaluateScenario('normal-delay', 'corrected');
  assert.equal(normal.metrics.delayMinutes, 12); assert.equal(normal.findings.length, 0);
  const late = evaluateScenario('normal-delay', 'corrected', { allowanceMinutes: 11 });
  assert.equal(late.findings[0]!.id, 'order.late-arrival');
  assert.equal(late.assertions[0]!.status, 'PASS');
  assert.equal(normal.evidenceIdentity, late.evidenceIdentity);
  assert.equal(evaluateScenario('normal-delay', 'corrected', { allowanceMinutes: 12 }).findings.length, 0);
  assert.equal(evaluateScenario('normal-delay', 'insufficient').metrics.delayMinutes, null);
});
test('persistent absence can PASS; one post-allowance capture cannot establish persistence', () => {
  const absent = evaluateScenario('missing-order', 'corrected');
  assert.equal(absent.assertions[0]!.status, 'PASS'); assert.equal(absent.findings[0]!.id, 'order.missing');
  assert.equal(absent.metrics.postAllowanceObservations, 2); assert.equal(absent.metrics.persistenceMinutes, 15);
  const one = evaluateScenario('missing-order', 'corrected', { allowanceMinutes: 40 });
  assert.equal(one.assertions[0]!.status, 'INCONCLUSIVE'); assert.equal(one.findings.length, 0);
  assert.equal(one.metrics.postAllowanceObservations, 1);
  const waiting = evaluateScenario('missing-order', 'corrected', { allowanceMinutes: 60 });
  assert.equal(waiting.assertions[0]!.status, 'PASS'); assert.equal(waiting.findings.length, 0);
  assert.equal(evaluateScenario('missing-order', 'insufficient').findings.length, 0);
});
test('buffer is applied to net 14, never subtract reservations twice; zero floor is explicit', () => {
  const r = evaluateScenario('inventory-buffer', 'corrected');
  assert.equal(r.metrics.expectedPublished, 10); assert.equal(r.findings.length, 0);
  const noBuffer = evaluateScenario('inventory-buffer', 'corrected', { buffer: 0 });
  assert.equal(noBuffer.metrics.expectedPublished, 14); assert.equal(noBuffer.findings[0]!.id, 'inventory.mismatch');
  assert.equal(noBuffer.assertions[0]!.status, 'PASS');
  assert.equal(evaluateScenario('inventory-buffer', 'faulty', { buffer: 0 }).assertions[0]!.status, 'PASS');
  assert.equal(evaluateScenario('inventory-buffer', 'corrected', { buffer: 20 }).metrics.expectedPublished, 0);
  const missing = evaluateScenario('inventory-buffer', 'insufficient');
  assert.equal(missing.metrics.comparableWarehouseQuantity, null); assert.equal(missing.metrics.expectedPublished, null);
  assert.equal(missing.findings.length, 0);
});
test('stale corrected stays inconclusive, never zero or shortage; freshness control is live', () => {
  const r = evaluateScenario('stale-evidence', 'corrected');
  assert.equal(r.metrics.warehouseAgeMinutes, 45); assert.equal(r.metrics.capturedWarehouseQuantity, 10);
  assert.equal(r.metrics.comparableWarehouseQuantity, null); assert.equal(r.metrics.expectedPublished, null);
  assert.equal(r.assertions[0]!.status, 'INCONCLUSIVE');
  assert(!JSON.stringify(r.findings).includes('shortage'));
  assert.equal(evaluateScenario('stale-evidence', 'corrected', { freshnessMinutes: 44 }).assertions[0]!.status, 'INCONCLUSIVE');
  const relaxed = evaluateScenario('stale-evidence', 'corrected', { freshnessMinutes: 45 });
  assert.equal(relaxed.assertions[0]!.status, 'PASS'); assert.equal(relaxed.findings.length, 0);
  assert.equal(relaxed.evidenceIdentity, r.evidenceIdentity);
});
test('three duplicate deliveries of quantity three count as three, not nine', () => {
  const good = evaluateScenario('duplicate-shipment', 'corrected'), bad = evaluateScenario('duplicate-shipment', 'faulty');
  assert.equal(good.metrics.eventDeliveries, 3); assert.equal(good.metrics.uniqueShipments, 1);
  assert.equal(good.metrics.fulfilled, 3); assert.equal(good.metrics.outstanding, 0);
  assert.equal(bad.metrics.fulfilled, 3); assert.equal(bad.metrics.exampleFulfilled, 9);
  assert.equal(evaluateScenario('duplicate-shipment', 'insufficient').metrics.fulfilled, null);
});
test('policies reject invalid or irrelevant controls instead of silently clamping or ignoring', () => {
  for (const value of [-1, NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1, '4', undefined, null]) {
    assert.throws(() => evaluateScenario('inventory-buffer', 'corrected', { buffer: value } as Policy));
  }
  assert.throws(() => evaluateScenario('partial-shipment', 'corrected', { buffer: 4 }));
  assert.throws(() => evaluateScenario('not-a-scenario' as ScenarioId, 'corrected'));
  assert.throws(() => evaluateScenario('partial-shipment', 'unknown' as Variant));
});
