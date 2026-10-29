import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { evaluate, parseJSON, validateEvidence } from '../packages/core/index.ts';
import { fixture } from './helpers.ts';
test('oversized input, excessive nesting and prototype keys are rejected', () => {
  assert.throws(() => parseJSON('['.repeat(40) + '0' + ']'.repeat(40)), /nesting/);
  assert.throws(() => parseJSON(' '.repeat(32 * 1024 * 1024 + 1)), /limit/);
  assert.throws(() => parseJSON('{"__proto__": {"admin":true}}'));
  assert.throws(() => parseJSON('{bad json secret-marker}'), error => error instanceof Error && !error.message.includes('secret-marker'));
});
test('excluded customer fields are rejected, declared unmapped field names remain visible', () => {
  const s = fixture('normal-delay'); s.evidence.observations[0]!.unmappedFields = ['upstream_custom_state'];
  assert.deepEqual(evaluate(s).observations[0]!.unmappedFields, ['upstream_custom_state']);
  const invalid = structuredClone(s.evidence) as unknown as { observations: Record<string, unknown>[] };
  invalid.observations[0]!.customerName = 'private'; assert.throws(() => validateEvidence(invalid));
});
test('runtime source has no network imports or dynamic execution; evaluation tolerates denied fetch', () => {
  const fetch = globalThis.fetch; globalThis.fetch = async () => { throw new Error('network denied'); };
  try { assert.equal(evaluate(fixture('normal-delay')).summary.exitCode, 0); } finally { globalThis.fetch = fetch; }
  for (const dir of ['packages/core', 'packages/cli', 'packages/report']) for (const f of readdirSync(dir).filter(n => n.endsWith('.ts'))) {
    const source = readFileSync(`${dir}/${f}`, 'utf8');
    assert.doesNotMatch(source, /from ['"](?:node:)?(?:https?|net|tls|dns|child_process)['"]|\beval\s*\(|\bnew Function\s*\(/);
  }
});
