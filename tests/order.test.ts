import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, VirtualClock } from '../packages/core/index.ts';
import { fixture, time, pointInterval, setCaptureTime } from './helpers.ts';
const check = (s: ReturnType<typeof fixture>) => evaluate(s).checks.find(c => c.id === 'order.presence:shop/A')!;
test('reviewed order oracle uses explicit allowance and persistent scoped absence', () => {
  assert.equal(check(fixture('normal-delay')).reason, 'within_allowance');
  const r = evaluate(fixture('missing-order'));
  assert.equal(r.findings.find(f => f.ruleId === 'order.missing')?.evidence.includes('destination-0'), true);
  assert.equal(r.findings.find(f => f.ruleId === 'order.missing')?.evidence.includes('destination-1'), true);
  assert.equal(r.assertions.every(a => a.status === 'PASS'), true);
  assert.equal(check(fixture('incomplete-pagination')).status, 'INCONCLUSIVE');
});
test('allowance equality is elapsed and persistence equality is sufficient', () => {
  const s = fixture('missing-order'); s.evaluationTime = time('10:10');
  for (const c of s.evidence.coverage) setCaptureTime(c, time(c.id === 'destination-0' ? '10:05' : '10:10'));
  s.evidence.observations[0]!.observedAt = time('10:10');
  assert.equal(check(s).reason, 'persistent_absence');
  s.evaluationTime = time('10:05'); s.evidence.coverage = s.evidence.coverage.filter(c => c.id !== 'destination-1');
  setCaptureTime(s.evidence.coverage[0]!, time('10:05')); s.evidence.observations[0]!.observedAt = time('10:05');
  assert.equal(check(s).reason, 'insufficient_persistence');
});
test('two IDs at one observation instant cannot establish persistence even at duration zero', () => {
  const s = fixture('missing-order'); s.evidence.policy.persistenceMs = 0;
  setCaptureTime(s.evidence.coverage[1]!, time('10:12'));
  assert.equal(check(s).status, 'INCONCLUSIVE');
});
for (const status of ['partial', 'failed', 'unknown'] as const) test(`latest ${status} snapshot interrupts two older complete absences`, () => {
  const s = fixture('missing-order');
  s.evidence.coverage.push({ ...s.evidence.coverage[2]!, id: 'interrupt', snapshotId: 'interrupt', observedAt: time('10:13'), captureInterval: pointInterval(time('10:13')), status });
  s.evaluationTime = time('10:13');
  assert.equal(check(s).status, 'INCONCLUSIVE');
  assert.equal(evaluate(s).findings.some(f => f.ruleId === 'order.missing'), false);
});
test('intermediate failed coverage and known presence reset absence support', () => {
  for (const presence of [false, true]) {
    const s = fixture('missing-order'); const c = { ...s.evidence.coverage[1]!, id: 'middle', snapshotId: 'middle', observedAt: time('10:09'), captureInterval: pointInterval(time('10:09')), status: presence ? 'complete' as const : 'failed' as const };
    s.evidence.coverage.push(c);
    if (presence) s.evidence.observations.push({ id: 'present', sourceId: 'warehouse', sourceRecordId: 'A2', entityType: 'presence', snapshotId: 'middle', observedAt: c.observedAt, evidenceRef: 'synthetic:presence', unmappedFields: [], fields: { orderId: 'A2' } });
    assert.equal(check(s).status, 'INCONCLUSIVE');
  }
});
test('unknown cadence, future observations and mapping conflicts block absence', () => {
  for (const mutation of ['cadence', 'future', 'mapping']) {
    const s = fixture('missing-order');
    if (mutation === 'cadence') s.evidence.policy.freshness[1]!.cadenceMs = null;
    if (mutation === 'future') s.evaluationTime = time('10:11');
    if (mutation === 'mapping') s.evidence.mappings.push({ ...s.evidence.mappings[0]!, id: 'conflict', toRef: { ...s.evidence.mappings[0]!.toRef, entityId: 'A3' } });
    assert.equal(check(s).status, 'INCONCLUSIVE');
  }
});
test('freshness equality is fresh; stale is strictly greater', () => {
  const s = fixture('normal-delay'); s.evaluationTime = time('10:12');
  const current = () => evaluate(s).checks.find(c => c.id === 'observation.freshness:shop/orders/main/all')!;
  assert.equal(current().status, 'PASS'); s.evaluationTime = '2026-10-28T10:12:00.001Z';
  assert.equal(current().reason, 'stale_evidence');
});
test('VirtualClock advances without waiting and rejects negative or unsafe steps', () => {
  const clock = new VirtualClock(time('10:00'));
  assert.equal(clock.advance(300000), '2026-10-28T10:05:00.000Z');
  assert.throws(() => clock.advance(-1)); assert.throws(() => clock.advance(Number.MAX_SAFE_INTEGER));
});
test('presence requires explicit destination location and rejects unrelated scope', () => {
  for (const name of ['normal-delay', 'missing-order', 'incomplete-pagination']) {
    const s = fixture(name);
    assert.equal(s.evidence.mappings[0]!.toRef.locationId, 'main');
    for (const c of s.evidence.coverage) if (c.sourceId === 'warehouse') c.scope.locations = ['unrelated'];
    assert.equal(check(s).status, 'INCONCLUSIVE');
    assert.ok(!evaluate(s).findings.some(f => f.ruleId === 'order.missing'));
    delete s.evidence.mappings[0]!.toRef.locationId;
    assert.equal(check(s).reason, 'missing_destination_scope');
  }
});
test('unrelated coverage cannot supply the second absence observation or presence', () => {
  const s = fixture('missing-order');
  s.evidence.coverage[1]!.scope.locations = ['unrelated'];
  assert.equal(check(s).reason, 'insufficient_persistence');
  s.evidence.coverage[1]!.scope.locations = ['main'];
  const c = { ...s.evidence.coverage[2]!, id: 'other', snapshotId: 'other', scope: { ...s.evidence.coverage[2]!.scope, locations: ['unrelated'] } };
  s.evidence.coverage.push(c);
  s.evidence.observations.push({ id: 'unrelated-presence', sourceId: 'warehouse', sourceRecordId: 'A2', entityType: 'presence', snapshotId: c.snapshotId, observedAt: c.observedAt, evidenceRef: 'synthetic:unrelated', unmappedFields: [], fields: { orderId: 'A2' } });
  assert.equal(check(s).reason, 'persistent_absence');
});
