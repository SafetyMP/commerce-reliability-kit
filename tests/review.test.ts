import test from 'node:test';
import assert from 'node:assert/strict';
import { compareReports, evaluate, renderHTML } from '../packages/core/index.ts';
import type { Coverage, InventoryObservation, ShipmentObservation } from '../packages/core/types.ts';
import { fixture, time, pointInterval, setCaptureTime } from './helpers.ts';

const inventory = (s: ReturnType<typeof fixture>) => evaluate(s).checks.find(c => c.id === 'inventory.available:inventory-map')!;

test('review: unrelated shipment location scope cannot establish exact fulfillment', () => {
  const s = fixture('partial-shipment');
  s.evidence.coverage.find(c => c.resource === 'shipments')!.scope.locations = ['other'];
  const report = evaluate(s, { mode: 'assert', observed: [{ id: 'external', sourceId: 'shop', orderId: 'A', completed: false }] });
  assert.equal(report.checks.find(c => c.id === 'fulfillment.quantities:shop/A')!.status, 'INCONCLUSIVE');
  assert.equal(report.assertions[0]!.status, 'INCONCLUSIVE');
});

test('review: fresh pre-deadline snapshot cannot prove a missed deadline', () => {
  const s = fixture('label-deadline');
  setCaptureTime(s.evidence.coverage.find(c => c.resource === 'shipments')!, time('10:09'));
  for (const o of s.evidence.observations) if (o.entityType === 'shipment') o.observedAt = time('10:09');
  const r = evaluate(s);
  assert.equal(r.checks.find(c => c.id === 'fulfillment.deadline:shop/A')!.status, 'INCONCLUSIVE');
  assert.equal(r.findings.some(f => f.ruleId === 'fulfillment.deadline-missed'), false);
});

test('review: absent current source order cannot reuse historical eligibility', () => {
  const s = fixture('missing-order');
  const c = s.evidence.coverage.find(c => c.sourceId === 'shop')!;
  setCaptureTime(c, time('10:11'));
  s.evidence.observations[0]!.observedAt = time('10:11');
  s.evidence.coverage.push({ ...c, id: 'current-empty', snapshotId: 'current-empty', observedAt: time('10:12'), captureInterval: pointInterval(time('10:12')) });
  assert.equal(evaluate(s).findings.some(f => f.ruleId === 'order.missing'), false);
  assert.equal(evaluate(s).checks.find(c => c.id === 'order.presence:shop/A')!.status, 'INCONCLUSIVE');
});

test('review: equivalent timestamp spellings cannot hide simultaneous conflict', () => {
  const s = fixture('publication-buffer');
  const c = s.evidence.coverage.find(c => c.id === 'warehouse-1')!;
  s.evidence.coverage.push({ ...c, id: 'a-empty', snapshotId: 'a-empty', observedAt: '2026-10-28T10:12:00.000Z' });
  assert.equal(inventory(s).status, 'INCONCLUSIVE');
});

test('review: historical contradictory empty snapshot interrupts inventory persistence', () => {
  const s = fixture('persistent-mismatch');
  const c = s.evidence.coverage.find(c => c.id === 'warehouse-0')!;
  s.evidence.coverage.push({ ...c, id: 'a-empty', snapshotId: 'a-empty' });
  assert.equal(inventory(s).status, 'INCONCLUSIVE');
  assert.equal(evaluate(s).findings.some(f => f.ruleId === 'inventory.mismatch'), false);
});

test('review: skipped source-only uncertainty cannot bridge inventory persistence', () => {
  const s = fixture('persistent-mismatch');
  const c = s.evidence.coverage.find(c => c.id === 'warehouse-0')!;
  const o = s.evidence.observations.find(o => o.snapshotId === c.snapshotId) as InventoryObservation;
  const middle: Coverage = { ...c, id: 'middle', snapshotId: 'middle', observedAt: time('10:09'), captureInterval: pointInterval(time('10:09')) };
  s.evidence.coverage.push(middle);
  const row: InventoryObservation = { ...o, id: 'middle-row', snapshotId: middle.snapshotId, observedAt: middle.observedAt, fields: { ...o.fields } };
  delete row.fields.quantity;
  s.evidence.observations.push(row);
  assert.equal(inventory(s).status, 'INCONCLUSIVE');
});

test('review: distinct location mismatches have distinct comparison identities', () => {
  const s = fixture('persistent-mismatch');
  const mapping = structuredClone(s.evidence.mappings[0]!);
  mapping.id = 'other-location'; mapping.fromRef.locationId = 'other'; mapping.toRef.locationId = 'other';
  s.evidence.mappings.push(mapping);
  for (const c of s.evidence.coverage) c.scope.locations.push('other');
  for (const o of [...s.evidence.observations]) if (o.entityType === 'inventory') {
    s.evidence.observations.push({ ...o, id: o.id + '-other', fields: { ...o.fields, locationId: 'other' } });
  }
  const report = evaluate(s);
  assert.equal(report.findings.filter(f => f.ruleId === 'inventory.mismatch').length, 2);
  assert.deepEqual(compareReports(report, report).changes, []);
});

test('review: HTML escapes unchecked JavaScript caller enum fields too', () => {
  const report = evaluate(fixture('normal-delay'));
  Object.assign(report.manifest, { mode: '<img src=x onerror=alert(1)>' });
  Object.assign(report.checks[0]!, { status: '<IMG src=x onerror=alert(1)>', required: '<ScRiPt>bad</ScRiPt>' });
  const html = renderHTML(report);
  assert.doesNotMatch(html, /<img|<script/i);
});

test('review: same-ID void must reverse the latest preceding revision', () => {
  const s = fixture('partial-shipment');
  const o = s.evidence.observations[1] as ShipmentObservation;
  s.evidence.observations.push({ ...o, id: 'zz-revised', eventTime: time('10:08'), fields: { ...o.fields, quantity: 6 } });
  s.evidence.observations.push({ ...o, id: 'void', eventTime: time('10:09'), fields: { ...o.fields, milestone: 'voided', reversalOf: 'S1' } });
  assert.equal(evaluate(s).checks.find(c => c.id === 'fulfillment.quantities:shop/A')!.status, 'INCONCLUSIVE');
});

test('review: newer source uncertainty cannot be hidden behind an older aligned pair', () => {
  const s = fixture('publication-buffer');
  const c = s.evidence.coverage.find(c => c.id === 'warehouse-1')!;
  const o = s.evidence.observations.find(o => o.snapshotId === c.snapshotId) as InventoryObservation;
  s.evaluationTime = time('10:13');
  s.evidence.coverage.push({ ...c, id: 'newer-source', snapshotId: 'newer-source', observedAt: time('10:13'), captureInterval: pointInterval(time('10:13')) });
  const row: InventoryObservation = { ...o, id: 'newer-source-row', snapshotId: 'newer-source', observedAt: time('10:13'), fields: { ...o.fields } };
  delete row.fields.quantity; s.evidence.observations.push(row);
  assert.equal(inventory(s).status, 'INCONCLUSIVE');
});

test('review: external capture cannot rebind the scenario source to another account', () => {
  const s = fixture('partial-shipment'), capture = structuredClone(s.evidence);
    capture.outcomes = [];
  capture.sources.find(s => s.id === 'shop')!.account = 'another-merchant';
  for (const c of capture.coverage) if (c.sourceId === 'shop') c.scope.account = 'another-merchant';
  assert.throws(() => evaluate(s, { mode: 'assert', observedEvidence: capture,
    observed: [{ id: 'external', sourceId: 'shop', orderId: 'A', completed: false }] }), /account/);
});
