import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { evaluate } from '../packages/core/index.ts';
import { fixture } from './helpers.ts';

for (const file of readdirSync('scenarios').filter(n => n.endsWith('.json')).sort()) test(`literal corpus oracle and permutation invariant: ${file}`, () => {
  const s = fixture(file.slice(0, -5)), r = evaluate(s);
  assert.equal(r.summary.exitCode, 0, JSON.stringify(r.assertions.filter(a => a.status !== 'PASS')));
  assert.ok(s.assumptions.length && s.doesNotEstablish.length && s.provenance.references.length);
  assert.ok(s.assertions.some(a => a.kind === 'finding' && a.present === false));
  const ids = new Set([...s.evidence.coverage, ...s.evidence.observations, ...s.evidence.outcomes].map(o => o.id));
  for (const f of r.findings) { assert.ok(f.evidence.length); assert.ok(f.evidence.every(id => ids.has(id))); }
  s.evidence.observations.reverse(); s.evidence.coverage.reverse(); s.evidence.mappings.reverse();
  const permuted = evaluate(s);
  assert.deepEqual(permuted.checks, r.checks); assert.deepEqual(permuted.findings, r.findings); assert.deepEqual(permuted.assertions, r.assertions);
});
