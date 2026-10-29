import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../packages/core/index.ts';
import type { OrderObservation, ShipmentObservation } from '../packages/core/types.ts';
import { fixture, time } from './helpers.ts';
const check = (s: ReturnType<typeof fixture>) => evaluate(s).checks.find(c => c.id === 'fulfillment.quantities:shop/A')!;
test('partial-shipment oracle deduplicates shipment IDs and keeps six outstanding', () => {
  const s = fixture('partial-shipment'), r = evaluate(s);
  assert.deepEqual(check(s).details, { obligation: 10, shipped: 4, remaining: 6, overShipped: 0, completed: false });
  assert.equal(r.integrationAssertions[0]!.status, 'FAIL'); assert.equal(r.summary.exitCode, 0);
  assert.equal(evaluate(s, { mode: 'assert', observed: [{ id: 'corrected', sourceId: 'shop', orderId: 'A', completed: false }] }).summary.exitCode, 0);
  assert.equal(evaluate(s, { mode: 'assert', observed: s.evidence.outcomes }).summary.exitCode, 1);
  assert.equal(evaluate(s, { mode: 'assert', observed: [] }).summary.exitCode, 2);
  assert.equal(evaluate(s, { mode: 'assert' }).integrationAssertions[0]!.status, 'INCONCLUSIVE');
});
test('incomplete shipment scope cannot establish exact remaining or completion', () => {
  const s = fixture('partial-shipment'); s.evidence.coverage[1]!.status = 'partial';
  assert.equal(check(s).status, 'INCONCLUSIVE'); assert.equal('remaining' in check(s).details, false);
  assert.equal(evaluate(s, { mode: 'assert', observed: s.evidence.outcomes }).summary.exitCode, 2);
});
test('equal source-time contradictions and unknown ordering remain inconclusive', () => {
  for (const unknown of [false, true]) {
    const s = fixture('partial-shipment'), duplicate = s.evidence.observations[2] as ShipmentObservation;
    duplicate.fields.quantity = 8; if (unknown) delete duplicate.eventTime;
    assert.equal(check(s).status, 'INCONCLUSIVE');
  }
});
test('out-of-order arrivals use source revision time; ingestion time cannot choose truth', () => {
  const s = fixture('partial-shipment'), duplicate = s.evidence.observations[2] as ShipmentObservation;
  duplicate.fields.quantity = 6; duplicate.eventTime = time('10:08'); duplicate.ingestedAt = time('10:01');
  assert.equal(check(s).details.remaining, 4);
  s.evidence.observations.reverse(); assert.equal(check(s).details.remaining, 4);
});
test('label generation does not discharge obligations; cancellation is separate', () => {
  const s = fixture('partial-shipment');
  for (const o of s.evidence.observations) if (o.entityType === 'shipment') o.fields.milestone = 'label';
  (s.evidence.observations[0] as OrderObservation).fields.canceled = 3;
  assert.equal(check(s).details.remaining, 7); assert.equal(check(s).details.shipped, 0);
});
test('explicit later reversal removes only its referenced handed-off shipment', () => {
  const s = fixture('partial-shipment'), shipment = s.evidence.observations[1] as ShipmentObservation;
  s.evidence.observations.push({ ...shipment, id: 'void', eventTime: time('10:09'), fields: { ...shipment.fields, shipmentId: 'VOID1', milestone: 'voided', reversalOf: 'S1' } });
  assert.equal(check(s).details.shipped, 0); assert.equal(check(s).details.remaining, 10);
  (s.evidence.observations[3] as ShipmentObservation).fields.reversalOf = 'unknown';
  assert.equal(check(s).status, 'INCONCLUSIVE');
});
test('overshipment remains visible and cannot satisfy another line', () => {
  const s = fixture('partial-shipment'), order = s.evidence.observations[0] as OrderObservation;
  for (const o of s.evidence.observations) if (o.entityType === 'shipment') o.fields.quantity = 12;
  s.evidence.observations.push({ ...order, id: 'second-line', fields: { ...order.fields, lineId: 'L2', ordered: 5 } });
  const c = check(s); assert.equal(c.details.remaining, 5); assert.equal(c.details.overShipped, 2); assert.equal(c.details.completed, false);
  assert.equal(evaluate(s).findings.some(f => f.ruleId === 'fulfillment.over-shipped'), true);
});
test('missing order quantity and line allocation never become zero', () => {
  const s = fixture('partial-shipment'); delete (s.evidence.observations[0] as OrderObservation).fields.canceled;
  assert.equal(check(s).status, 'INCONCLUSIVE');
});
test('conflicting simultaneous complete shipment snapshots are inconclusive', () => {
  const s = fixture('partial-shipment'), c = s.evidence.coverage[1]!;
  s.evidence.coverage.push({ ...c, id: 'empty-complete-snapshot', snapshotId: 'empty-complete-snapshot' });
  assert.equal(check(s).status, 'INCONCLUSIVE');
});
