import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../packages/core/index.ts';
import { fixture, time } from './helpers.ts';
const inventory = (s: ReturnType<typeof fixture>) => evaluate(s).checks.find(c => c.id === 'inventory.available:inventory-map')!;
test('aggregation cannot hide missing, overlapping, stale or inequivalent members', () => {
  for (const mutation of ['missing', 'overlap', 'unit', 'quantity', 'scope', 'overflow', 'stale']) {
    const s = fixture('facility-aggregation'), m = s.evidence.mappings[0]!;
    const west = s.evidence.observations.find(o => o.entityType === 'inventory' && o.fields.locationId === 'west' && o.snapshotId === 'warehouse-1')!;
    assert.equal(west.entityType, 'inventory'); if (west.entityType !== 'inventory') throw new Error();
    if (mutation === 'missing') s.evidence.observations = s.evidence.observations.filter(o => o !== west);
    if (mutation === 'overlap') m.aggregation!.locations = ['east', 'east'];
    if (mutation === 'unit') west.fields.unit = 'case';
    if (mutation === 'quantity') delete west.fields.quantity;
    if (mutation === 'scope') west.fields.stockScope = 'quarantine';
    if (mutation === 'overflow') west.fields.quantity = Number.MAX_SAFE_INTEGER;
    if (mutation === 'stale') s.evaluationTime = time('10:30');
    assert.equal(inventory(s).status, 'INCONCLUSIVE', mutation);
    assert.equal(evaluate(s).findings.some(f => f.ruleId === 'inventory.mismatch'), false);
  }
});
test('aggregation and converted units expose a real persistent mismatch in target units', () => {
  for (const name of ['facility-aggregation', 'unit-conversion']) {
    const s = fixture(name);
    for (const o of s.evidence.observations) if (o.entityType === 'inventory' && o.sourceId === 'shop') o.fields.quantity = 9;
    assert.equal(inventory(s).reason, 'persistent_mismatch');
    assert.equal(inventory(s).details.difference, -1);
    s.evidence.policy.inventory!.tolerance = 1;
    assert.equal(inventory(s).reason, 'within_tolerance');
  }
});
test('deadline equality, late handoff, missing timestamp, coverage and future deadline', () => {
  const s = fixture('label-deadline');
  for (const o of s.evidence.observations) if (o.entityType === 'shipment') { o.fields.milestone = 'handed_off'; o.fields.milestoneTime = time('10:10'); }
  const deadline = () => evaluate(s).checks.find(c => c.id === 'fulfillment.deadline:shop/A');
  assert.equal(deadline()?.reason, 'deadline_met');
  for (const o of s.evidence.observations) if (o.entityType === 'shipment') o.fields.milestoneTime = time('10:11');
  assert.equal(deadline()?.reason, 'deadline_missed');
  for (const o of s.evidence.observations) if (o.entityType === 'shipment') delete o.fields.milestoneTime;
  assert.equal(deadline()?.status, 'INCONCLUSIVE');
  s.evidence.policy.deadlines![0]!.at = time('10:13'); assert.equal(deadline()?.reason, 'within_deadline');
  s.evidence.coverage[1]!.status = 'partial';
  assert.equal(deadline()?.status, 'INCONCLUSIVE');
  assert.equal(deadline()?.reason, 'incomplete_coverage');
  assert.equal(evaluate(s).findings.some(f => f.ruleId === 'fulfillment.deadline-missed'), false);
});
