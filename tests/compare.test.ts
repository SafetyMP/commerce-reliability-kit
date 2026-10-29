import test from 'node:test';
import assert from 'node:assert/strict';
import { compareReports, evaluate } from '../packages/core/index.ts';
import { fixture } from './helpers.ts';
test('stable comparison ignores ordering, identifies changes and qualifies context', () => {
  const before = evaluate(fixture('publication-buffer')), after = structuredClone(before);
  after.checks.reverse(); after.assertions.reverse(); after.coverage.reverse();
  assert.deepEqual(compareReports(before, after), { compatible: true, changes: [], contextChanges: [], warnings: [] });
  const changed = evaluate(fixture('persistent-mismatch'));
  const diff = compareReports(before, changed);
  assert.ok(diff.changes.some(c => c.layer === 'findings' && c.change === 'added'));
  assert.ok(diff.contextChanges.includes('inputHash')); assert.ok(diff.contextChanges.includes('scenarioId')); assert.equal(diff.warnings.length, 1);
  changed.manifest.ruleVersion = '2.0.0'; assert.throws(() => compareReports(before, changed));
});
test('policy and coverage changes remain visible even with identical findings', () => {
  const s = fixture('publication-buffer'), before = evaluate(s);
  s.evidence.policy.inventory!.tolerance = 1; s.evidence.coverage[0]!.limitations.push('Declared by another importer');
  const diff = compareReports(before, evaluate(s)); assert.ok(diff.contextChanges.includes('policyHash')); assert.ok(diff.contextChanges.includes('coverage'));
});
