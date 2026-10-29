import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../packages/core/index.ts';
import type { InventoryObservation } from '../packages/core/types.ts';
import { fixture, time, pointInterval, setCaptureTime } from './helpers.ts';
const check = (s: ReturnType<typeof fixture>) => evaluate(s).checks.find(c => c.id === 'inventory.available:inventory-map')!;
const quantities = (s: ReturnType<typeof fixture>, source: string, quantity: number) => { for (const o of s.evidence.observations) if (o.entityType === 'inventory' && o.sourceId === source) o.fields.quantity = quantity; };
test('buffer legitimate difference and paired true mismatch use the same evidence prerequisites', () => {
  const s = fixture('publication-buffer'); assert.equal(check(s).status, 'PASS'); assert.equal(check(s).details.expectedQuantity, 10);
  quantities(s, 'shop', 9);
  assert.equal(check(s).reason, 'persistent_mismatch'); assert.equal(check(s).details.difference, -1);
  const f = evaluate(s).findings.find(f => f.ruleId === 'inventory.mismatch')!;
  assert.equal(f.evidence.includes('warehouse-0'), true); assert.equal(f.evidence.includes('shop-1'), true);
});
test('stale observation oracle produces staleness but suppresses inventory mismatch', () => {
  const s = fixture('stale-observations'); const r = evaluate(s);
  assert.equal(check(s).status, 'INCONCLUSIVE'); assert.equal(r.findings.some(f => f.ruleId === 'inventory.mismatch'), false);
  assert.equal(r.findings.some(f => f.ruleId === 'observation.stale'), true);
  s.evidence.policy.freshness[0]!.cadenceMs = null;
  assert.equal(evaluate(s).findings.some(f => f.ruleId === 'observation.stale'), false);
});
test('conversion precedes buffer, buffer floors at zero, tolerance is in target units', () => {
  const s = fixture('publication-buffer'); s.evidence.mappings[0]!.factor = 2; quantities(s, 'shop', 22);
  assert.equal(check(s).status, 'PASS');
  s.evidence.policy.inventory!.buffer = 25; quantities(s, 'shop', 0); assert.equal(check(s).status, 'PASS');
  quantities(s, 'shop', 1); s.evidence.policy.inventory!.tolerance = 1; assert.equal(check(s).status, 'PASS');
});
test('missing and gross quantities cannot be compared as net', () => {
  for (const mode of ['missing', 'gross', 'unit', 'scope']) {
    const s = fixture('publication-buffer'); const o = s.evidence.observations[2] as InventoryObservation;
    if (mode === 'missing') delete o.fields.quantity;
    if (mode === 'gross') o.fields.semantics = 'on_hand';
    if (mode === 'unit') o.fields.unit = 'case';
    if (mode === 'scope') o.fields.stockScope = 'other-stock';
    assert.equal(check(s).status, 'INCONCLUSIVE');
    assert.equal('observedQuantity' in check(s).details, false);
  }
});
test('unsafe integer inputs are invalid and conversion overflow is inconclusive', () => {
  const s = fixture('publication-buffer'); quantities(s, 'warehouse', Number.MAX_SAFE_INTEGER + 1); assert.throws(() => evaluate(s));
  quantities(s, 'warehouse', Number.MAX_SAFE_INTEGER); s.evidence.mappings[0]!.factor = 2;
  assert.equal(check(s).reason, 'unsafe_arithmetic');
});
test('latest partial scope blocks older mismatches and agreement resets persistence', () => {
  const s = fixture('publication-buffer'); quantities(s, 'shop', 9);
  for (const source of ['warehouse', 'shop']) {
    const c = s.evidence.coverage.find(c => c.sourceId === source)!;
    const o = s.evidence.observations.find((o): o is InventoryObservation => o.entityType === 'inventory' && o.sourceId === source)!;
    s.evidence.coverage.push({ ...c, id: source + '-middle', snapshotId: source + '-middle', observedAt: time('10:09'), captureInterval: pointInterval(time('10:09')) });
    s.evidence.observations.push({ ...o, id: source + '-middle-row', snapshotId: source + '-middle', observedAt: time('10:09'), fields: { ...o.fields, quantity: source === 'shop' ? 10 : 12 } });
  }
  assert.equal(check(s).reason, 'insufficient_persistence');
  s.evidence.coverage.find(c => c.id === 'shop-1')!.status = 'partial'; assert.equal(check(s).status, 'INCONCLUSIVE');
});
test('unaligned snapshots and duplicate observation instants cannot establish persistence', () => {
  const s = fixture('publication-buffer'); quantities(s, 'shop', 9);
  for (const c of s.evidence.coverage) setCaptureTime(c, time('10:12'));
  for (const o of s.evidence.observations) o.observedAt = time('10:12');
  s.evidence.policy.persistenceMs = 0; assert.equal(check(s).status, 'INCONCLUSIVE');
});
test('contradictory simultaneous source snapshots cannot be chosen by lexical ID', () => {
  const s = fixture('publication-buffer');
  const c = s.evidence.coverage.find(c => c.id === 'warehouse-1')!;
  const o = s.evidence.observations.find((o): o is InventoryObservation => o.entityType === 'inventory' && o.snapshotId === c.snapshotId)!;
  s.evidence.coverage.push({ ...c, id: 'warehouse-conflict', snapshotId: 'warehouse-conflict' });
  s.evidence.observations.push({ ...o, id: 'conflicting-position', snapshotId: 'warehouse-conflict', fields: { ...o.fields, quantity: 13 } });
  assert.equal(check(s).status, 'INCONCLUSIVE');
});
