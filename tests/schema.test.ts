import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { evaluate, validateEvidence, validateReport, validateScenario } from '../packages/core/index.ts';
import { fixture } from './helpers.ts';
test('every public fixture and generated report satisfies portable schemas', () => {
  for (const file of readdirSync('scenarios').filter(n => n.endsWith('.json'))) {
    const s = fixture(file.slice(0, -5)); validateScenario(s); validateReport(evaluate(s));
  }
});
test('conflicting duplicate observation IDs are invalid; exact delivery duplicates deduplicate', () => {
  const s = fixture('partial-shipment'); s.evidence.observations.push(structuredClone(s.evidence.observations[0]!));
  assert.doesNotThrow(() => evaluate(s));
  const last = s.evidence.observations.at(-1)!; if (last.entityType === 'order') last.fields.ordered = 12;
  assert.throws(() => evaluate(s), /Duplicate or conflicting stable ID/);
});
test('unknown fields and unsupported schema versions fail validation without leaking data', () => {
  const s = fixture('normal-delay');
  assert.throws(() => validateEvidence({ ...s.evidence, secretCustomerAddress: 'private marker' }), error => error instanceof Error && !error.message.includes('private marker'));
  assert.throws(() => validateScenario({ ...s, schemaVersion: '9.0.0' }));
  assert.throws(() => validateEvidence({ ...s.evidence, sources: [] }));
});
test('scope account, snapshot timestamp and observation linkage are mandatory', () => {
  const s = fixture('publication-buffer'); s.evidence.coverage[0]!.scope.account = 'wrong'; assert.throws(() => evaluate(s));
  const t = fixture('publication-buffer'); t.evidence.observations[0]!.snapshotId = 'missing'; assert.throws(() => evaluate(t));
});
test('deterministic findings, diagnostics and assertions survive reordered unordered inputs', () => {
  const s = fixture('missing-order'), a = evaluate(s);
  s.evidence.coverage.reverse(); s.evidence.observations.reverse(); s.evidence.sources.reverse();
  const b = evaluate(s); assert.deepEqual(a.findings, b.findings); assert.deepEqual(a.checks, b.checks); assert.deepEqual(a.assertions, b.assertions);
});
