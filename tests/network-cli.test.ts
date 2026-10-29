import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixture } from './helpers.ts';
const run = (...args: string[]) => spawnSync(process.execPath, ['--import', './tests/deny-network.mjs', '--experimental-strip-types', ...args], { encoding: 'utf8', timeout: 15000 });
const cli = (...args: string[]) => run('packages/cli/index.ts', ...args);
test('network tripwire is effective for fetch, sockets, HTTP and DNS', () => {
  for (const code of ['fetch("https://invalid.invalid")', 'import("node:net").then(n=>n.connect(443))', 'import("node:https").then(n=>n.get("https://invalid.invalid"))', 'import("node:dns").then(n=>n.lookup("invalid.invalid",()=>{}))']) {
    assert.equal(run('--input-type=module', '-e', code).status, 91);
  }
});
test('every CLI workflow and every report format completes with runtime networking denied', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commerce-network-')));
  try {
    const s = fixture('publication-buffer'), profile = join(dir, 'profile.json'), stream = join(dir, 'capture.jsonl');
    writeFileSync(profile, JSON.stringify({ ...s.evidence, observations: [] }));
    writeFileSync(stream, s.evidence.observations.map(o => JSON.stringify(o)).join('\n'));
    assert.equal(cli('validate', stream, '--profile', profile).status, 0);
    const out = join(dir, 'report');
    const analyzed = cli('analyze', stream, '--profile', profile, '--at', s.evaluationTime, '--output', out);
    assert.equal(analyzed.status, 0, analyzed.stderr);
    const compared = cli('compare', join(out, 'report.json'), join(out, 'report.json'));
    assert.equal(compared.status, 0); assert.deepEqual(JSON.parse(compared.stdout).changes, []);
    const outcomes = join(dir, 'outcomes.json'); writeFileSync(outcomes, JSON.stringify([{ id: 'external', sourceId: 'shop', orderId: 'A', completed: false }]));
    const capture = join(dir, 'external.json'); writeFileSync(capture, JSON.stringify({ ...fixture('partial-shipment').evidence, outcomes: [] }));
    assert.equal(cli('assert', 'scenarios/partial-shipment.json', '--capture', capture, '--observed', outcomes, '--format', 'junit').status, 0);
    for (const format of ['json', 'html', 'junit']) assert.equal(cli('demo', 'missing-order', '--format', format).status, 0);
    assert.doesNotMatch(readFileSync(join(out, 'report.html'), 'utf8'), /<script|<link|<img|<iframe/);
    assert.equal(cli('compare', join(out, 'report.json'), stream).status, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
