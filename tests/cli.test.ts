import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { evaluate } from '../packages/core/index.ts';
import { correctedIntegration, faultyIntegration } from '../examples/integrations.ts';
import { fixture } from './helpers.ts';
const cli = (...args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', 'packages/cli/index.ts', ...args], { encoding: 'utf8', timeout: 10000 });
test('faulty and corrected integrations compute distinct external outcomes from the same input', () => {
  const s = fixture('partial-shipment');
  assert.equal(evaluate(s, { mode: 'assert', observed: faultyIntegration(s.evidence) }).summary.exitCode, 1);
  assert.equal(evaluate(s, { mode: 'assert', observed: correctedIntegration(s.evidence) }).summary.exitCode, 0);
  const order = s.evidence.observations[0]!; if (order.entityType === 'order') order.fields.ordered = 4;
  assert.equal(correctedIntegration(s.evidence)[0]!.completed, true);
});
test('CLI JSONL outcomes, empty stream, report files and invalid paths', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commerce-cli-test-')));
  try {
    const s = fixture('partial-shipment'), path = join(dir, 'outcomes.jsonl');
    const bin = join(dir, 'commerce-check.ts'); symlinkSync(join(process.cwd(), 'packages/cli/index.ts'), bin);
    const linked = spawnSync(process.execPath, ['--experimental-strip-types', bin, 'demo', 'normal-delay'], { encoding: 'utf8' });
    assert.equal(linked.status, 0, linked.stderr); assert.equal(JSON.parse(linked.stdout).summary.exitCode, 0);
    writeFileSync(path, correctedIntegration(s.evidence).map(o => JSON.stringify(o)).join('\n') + '\n');
    const run = cli('assert', 'scenarios/partial-shipment.json', '--observed', path, '--format', 'junit');
    assert.equal(run.status, 0, run.stderr); assert.match(run.stdout, /<testsuites/);
    assert.doesNotMatch(run.stdout, /<failure /);
    writeFileSync(path, faultyIntegration(s.evidence).map(o => JSON.stringify(o)).join('\n'));
    const faulty = cli('assert', 'scenarios/partial-shipment.json', '--observed', path, '--format', 'junit');
    assert.equal(faulty.status, 1, faulty.stderr); assert.match(faulty.stdout, /<failure /);
    writeFileSync(path, '');
    const missing = cli('assert', 'scenarios/partial-shipment.json', '--observed', path, '--format', 'junit');
    assert.equal(missing.status, 2); assert.match(missing.stdout, /<skipped type="INCONCLUSIVE"/);
    const expectedMissing = cli('demo', 'missing-order', '--format', 'junit');
    assert.equal(expectedMissing.status, 0, expectedMissing.stderr); assert.doesNotMatch(expectedMissing.stdout, /<failure /);
    const demo = cli('demo', 'stale-observations', '--output', join(dir, 'report'));
    assert.equal(demo.status, 0, demo.stderr); assert.ok(JSON.parse(demo.stdout).summary.diagnostics.INCONCLUSIVE > 0);
    assert.match(readFileSync(join(dir, 'report/report.html'), 'utf8'), /Coverage/);
    assert.equal(cli('demo', 'normal-delay', '--output', join(dir, 'report')).status, 3);
    assert.equal(cli('demo', '../normal-delay').status, 3);
    assert.equal(cli('demo', 'normal-delay', '--format', 'csv').status, 3);
    assert.equal(cli('unknown-command', 'x').status, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('analyze distinguishes operational findings from runner failure', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commerce-cli-test-')));
  try {
    const s = fixture('missing-order'), file = join(dir, 'capture.json'); writeFileSync(file, JSON.stringify(s.evidence));
    const run = cli('analyze', file, '--at', s.evaluationTime);
    assert.equal(run.status, 0, run.stderr); assert.ok(JSON.parse(run.stdout).findings.some((f: { ruleId: string }) => f.ruleId === 'order.missing'));
    assert.equal(cli('analyze', file).status, 3);
    assert.equal(cli('validate', file).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('assert evaluates supplied capture observations and outcomes under the unchanged scenario policy', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commerce-external-')));
  try {
    const s = fixture('partial-shipment'), capture = structuredClone(s.evidence);
    capture.outcomes = [];
    const outcomes = join(dir, 'outcomes.json'), file = join(dir, 'evidence.json');
    writeFileSync(outcomes, JSON.stringify(correctedIntegration(s.evidence)));
    for (const o of capture.observations) if (o.entityType === 'shipment') o.fields.quantity = 10;
    writeFileSync(file, JSON.stringify(capture));
    const supplied = cli('assert', 'scenarios/partial-shipment.json', '--capture', file, '--observed', outcomes);
    assert.equal(supplied.status, 1, supplied.stderr); // Fixture remaining=6 cannot mask supplied remaining=0.
    assert.equal(JSON.parse(supplied.stdout).checks.find((c: { id: string }) => c.id === 'fulfillment.quantities:shop/A').details.remaining, 0);
    capture.coverage[1]!.status = 'partial'; writeFileSync(file, JSON.stringify(capture));
    assert.equal(cli('assert', 'scenarios/partial-shipment.json', '--capture', file, '--observed', outcomes).status, 2);
    capture.policy.persistenceMs = 0; writeFileSync(file, JSON.stringify(capture));
    assert.equal(cli('assert', 'scenarios/partial-shipment.json', '--capture', file, '--observed', outcomes).status, 3);
    assert.throws(() => evaluate(s, { observedEvidence: capture }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
