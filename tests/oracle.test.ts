import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, validateScenario } from '../packages/core/index.ts';
import type { ShipmentObservation } from '../packages/core/types.ts';
import { fixture, pointInterval, setCaptureTime } from './helpers.ts';

test('six fixtures enforce the independently authored literal quantities, ages, and allowance', () => {
  const partial = evaluate(fixture('partial-shipment'));
  const line = partial.checks.find(c => c.id === 'fulfillment.line:shop/A/L1')!;
  assert.equal(line.details.shipped, 4); assert.equal(line.details.remaining, 6);
  assert.equal(partial.assertions.find(a => a.id === 'partial-line-quantities')!.status, 'PASS');
  const stale = evaluate(fixture('stale-observations'));
  const warehouse = stale.checks.find(c => c.id === 'observation.freshness:warehouse/inventory/main/all')!;
  const shop = stale.checks.find(c => c.id === 'observation.freshness:shop/inventory/main/all')!;
  assert.equal(warehouse.status, 'FAIL'); assert.equal(warehouse.details.ageMs, 4320000);
  assert.equal(shop.status, 'PASS'); assert.equal(shop.details.ageMs, 0);
  assert.deepEqual(stale.findings.filter(f => f.ruleId === 'observation.stale').map(f => f.entities), [['warehouse/inventory/main/all']]);
  const normal = evaluate(fixture('normal-delay')).checks.find(c => c.id === 'order.presence:shop/A')!;
  assert.equal(normal.reason, 'within_allowance');
  assert.equal(normal.details.ageMs, 120000); assert.equal(normal.details.allowanceMs, 300000);
  assert.ok(Number(normal.details.ageMs) < Number(normal.details.allowanceMs));
  for (const name of ['normal-delay', 'missing-order', 'incomplete-pagination', 'partial-shipment', 'publication-buffer']) {
    const s = fixture(name), r = evaluate(s);
    assert.ok(s.assertions.some(a => a.ruleId === 'observation.stale' && a.present === false && a.required));
    assert.deepEqual(r.findings.filter(f => f.ruleId === 'observation.stale'), []);
    assert.equal(r.summary.exitCode, 0);
  }
});

test('quantity assertions reject double counting even while the partial label remains true', () => {
  const s = fixture('partial-shipment');
  // Give the second delivery a genuinely distinct shipment identity: 8 shipped, 2 remaining.
  (s.evidence.observations[2] as ShipmentObservation).fields.shipmentId = 'S2';
  const r = evaluate(s);
  assert.ok(r.findings.some(f => f.ruleId === 'fulfillment.partial'));
  assert.equal(r.assertions.find(a => a.id === 'partial-detected')!.status, 'PASS');
  assert.equal(r.assertions.find(a => a.id === 'partial-line-quantities')!.status, 'FAIL');
  assert.equal(r.summary.exitCode, 1);
});

test('generic detail, reason and exact entity assertions reject incorrect expectations', () => {
  for (const field of ['quantity', 'missing-detail', 'reason', 'entity', 'extra-entity']) {
    const s = fixture(field === 'quantity' || field === 'missing-detail' ? 'partial-shipment' : field === 'reason' ? 'normal-delay' : 'stale-observations');
    const a = field === 'quantity' || field === 'missing-detail' ? s.assertions.find(a => a.id === 'partial-line-quantities')! :
      field === 'reason' ? s.assertions.find(a => a.kind === 'diagnostic')! : s.assertions.find(a => a.ruleId === 'observation.stale')!;
    if (field === 'quantity') a.expectedDetails = { shipped: 8, remaining: 2 };
    if (field === 'missing-detail') a.expectedDetails = { imaginaryQuantity: 4 };
    if (field === 'reason') a.expectedReason = 'destination_present';
    if (field === 'entity') a.expectedEntities = ['shop/inventory/main/all'];
    if (field === 'extra-entity') a.expectedEntities!.push('shop/inventory/main/all');
    const r = evaluate(s);
    assert.equal(r.assertions.find(result => result.id === a.id)!.status, 'FAIL', field);
    assert.equal(r.summary.exitCode, 1, field);
  }
  const s = fixture('partial-shipment');
  const a = s.assertions.find(a => a.id === 'partial-line-quantities')!;
  a.checkId = 'fulfillment.line:shop/A/unknown';
  assert.equal(evaluate(s).assertions.find(result => result.id === a.id)!.status, 'INCONCLUSIVE');
  a.expectedDetails = {};
  assert.throws(() => validateScenario(s), /Invalid scenario contract/);
});

test('wrong-resource staleness cannot satisfy the warehouse oracle', () => {
  const s = fixture('stale-observations');
  for (const c of s.evidence.coverage) setCaptureTime(c, c.sourceId === 'warehouse' ? s.evaluationTime : '2026-10-28T09:00:00Z');
  for (const o of s.evidence.observations) o.observedAt = o.sourceId === 'warehouse' ? s.evaluationTime : '2026-10-28T09:00:00Z';
  const r = evaluate(s);
  assert.deepEqual(r.findings.filter(f => f.ruleId === 'observation.stale').map(f => f.entities), [['shop/inventory/main/all']]);
  for (const id of ['warehouse-freshness', 'warehouse-inventory-age', 'shop-inventory-age']) {
    assert.equal(r.assertions.find(a => a.id === id)!.status, 'FAIL');
  }
});

test('freshness alone blocks an otherwise aligned persistent inventory mismatch', () => {
  const s = fixture('publication-buffer');
  for (const o of s.evidence.observations) if (o.entityType === 'inventory' && o.sourceId === 'shop') o.fields.quantity = 9;
  assert.equal(evaluate(s).checks.find(c => c.id === 'inventory.available:inventory-map')!.reason, 'persistent_mismatch');
  // Keep aligned distinct snapshots and quantity mismatch; only warehouse freshness becomes insufficient.
  s.evaluationTime = '2026-10-28T10:23:00Z';
  s.evidence.policy.freshness.find(f => f.sourceId === 'shop')!.freshnessLimitMs = 3600000;
  const r = evaluate(s);
  assert.equal(r.checks.find(c => c.id === 'inventory.available:inventory-map')!.reason, 'stale_evidence');
  assert.ok(!r.findings.some(f => f.ruleId === 'inventory.mismatch'));
  assert.deepEqual(r.findings.filter(f => f.ruleId === 'observation.stale').map(f => f.entities), [['warehouse/inventory/main/all']]);
  // The blocked result must not retain a seemingly established comparison quantity.
  assert.equal(r.checks.find(c => c.id === 'inventory.available:inventory-map')!.details.observedQuantity, undefined);
});
