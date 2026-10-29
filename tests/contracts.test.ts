import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { evaluate, importCapture, renderHTML, renderJUnit, validateEvidence, validateReport } from '../packages/core/index.ts';
import type { Scenario } from '../packages/core/types.ts';
import { inventoryCapture, orderCapture } from '../examples/capture-integrations.ts';
import { correctedIntegration, faultyIntegration } from '../examples/integrations.ts';
import { fixture, time } from './helpers.ts';

const orderScenario = (): Scenario => JSON.parse(readFileSync('examples/order-delivery.scenario.json', 'utf8'));
const cli = (...args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', 'packages/cli/index.ts', ...args], { encoding: 'utf8', timeout: 15000 });

test('public snapshots explicitly declare point intervals; import paths preserve them', () => {
  for (const name of readdirSync('scenarios')) {
    const s = fixture(name.slice(0, -5));
    for (const c of s.evidence.coverage) assert.deepEqual(c.captureInterval, { version: '1.0.0', start: c.observedAt, end: c.observedAt });
  }
  const json = importCapture('examples/capture.json');
  for (const extension of ['jsonl', 'csv']) assert.deepEqual(importCapture(`examples/capture.${extension}`, 'profiles/inventory.json').coverage, json.coverage);
});

test('interval version, syntax, reversed boundaries and observation containment are validated', () => {
  for (const interval of [
    { version: '2.0.0', start: time('10:06'), end: time('10:06') },
    { version: '1.0.0', start: 'yesterday', end: time('10:06') },
    { version: '1.0.0', start: time('10:07'), end: time('10:06') },
    { version: '1.0.0', start: time('10:00'), end: time('10:01') },
    { version: '1.0.0', start: time('10:13'), end: null },
    { version: '1.0.0', start: null }
  ]) {
    const e = fixture('publication-buffer').evidence;
    Object.assign(e.coverage[0]!, { captureInterval: interval });
    assert.throws(() => validateEvidence(e));
  }
});

for (const name of ['publication-buffer', 'missing-order', 'partial-shipment']) {
  for (const kind of ['missing', 'unknown', 'non-atomic', 'future']) test(`${name}: ${kind} capture interval blocks snapshot conclusions`, () => {
    const s = fixture(name), e = structuredClone(s.evidence);
    for (const c of e.coverage) {
      if (kind === 'missing') delete c.captureInterval;
      if (kind === 'unknown') c.captureInterval = { version: '1.0.0', start: null, end: c.observedAt };
      if (kind === 'non-atomic') c.captureInterval = { version: '1.0.0', start: time('09:00'), end: c.observedAt };
      if (kind === 'future') c.captureInterval!.end = time('10:13');
    }
    const r = evaluate(e, { evaluationTime: s.evaluationTime });
    assert.ok(r.checks.length > 0);
    assert.ok(r.checks.every(c => c.status === 'INCONCLUSIVE'));
    assert.deepEqual(r.findings, []);
    assert.equal(r.summary.exitCode, 2);
    const reason = kind === 'future' ? 'future_evidence' : kind === 'non-atomic' ? 'non_atomic_capture_interval' : 'unknown_capture_interval';
    assert.ok(r.checks.every(c => c.reason === reason));
    assert.ok(r.checks.every(c => c.details.remaining === undefined && c.details.observedQuantity === undefined));
    assert.deepEqual(r.coverage, [...e.coverage].sort((a, b) => a.id.localeCompare(b.id)));
  });
}

test('fresh ingestion and scan completion do not refresh old captures or source event times', () => {
  const s = fixture('stale-observations');
  for (const o of s.evidence.observations) o.ingestedAt = s.evaluationTime;
  const r = evaluate(s);
  assert.equal(r.checks.find(c => c.id === 'observation.freshness:warehouse/inventory/main/all')!.reason, 'stale_evidence');
  assert.deepEqual(r.observations.map(o => o.eventTime), [...s.evidence.observations].sort((a, b) => a.id.localeCompare(b.id)).map(o => o.eventTime));
  const scan = fixture('publication-buffer');
  for (const c of scan.evidence.coverage) c.captureInterval!.start = time('09:00');
  const report = evaluate(scan.evidence, { evaluationTime: scan.evaluationTime });
  assert.ok(report.checks.every(c => c.status === 'INCONCLUSIVE'));
  assert.equal(report.checks.find(c => c.id.startsWith('observation.freshness:'))!.details.ageMs, 4320000);
  assert.match(renderHTML(report), /captureInterval/); assert.match(renderJUnit(report), /captureInterval/);
});

test('unknown and non-atomic historical intervals cannot supply persistence', () => {
  for (const name of ['persistent-mismatch', 'missing-order']) for (const unknown of [false, true]) {
    const s = fixture(name);
    for (const c of s.evidence.coverage.filter(c => c.observedAt === time('10:06'))) c.captureInterval!.start = unknown ? null : time('10:05');
    const r = evaluate(s.evidence, { evaluationTime: s.evaluationTime });
    assert.ok(!r.findings.some(f => ['order.missing', 'inventory.mismatch'].includes(f.ruleId)));
    assert.equal(r.checks.find(c => /^(inventory.available|order.presence):/.test(c.id))!.status, 'INCONCLUSIVE');
  }
});

for (const kind of ['inventory', 'order'] as const) test(`library and CLI: external ${kind} fails then passes unchanged positive expectations`, () => {
  const s = kind === 'inventory' ? fixture('publication-buffer') : orderScenario();
  const path = kind === 'inventory' ? 'scenarios/publication-buffer.json' : 'examples/order-delivery.scenario.json';
  const capture = kind === 'inventory' ? inventoryCapture : orderCapture;
  const original = JSON.stringify(s), bad = capture(s.evidence, false), good = capture(s.evidence, true);
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commerce-contracts-')));
  try {
    const file = join(dir, 'external.json');
    for (const [e, code] of [[bad, 1], [good, 0]] as const) {
      const r = evaluate(s, { mode: 'assert', observedEvidence: e });
      assert.equal(r.summary.exitCode, code);
      assert.ok(r.assertions.length >= 2);
      assert.equal(r.findings.some(f => f.ruleId === (kind === 'inventory' ? 'inventory.mismatch' : 'order.missing')), code === 1);
      if (kind === 'inventory') assert.equal(r.checks.find(c => c.id === 'inventory.available:inventory-map')!.details.observedQuantity, code === 1 ? 9 : 10);
      writeFileSync(file, JSON.stringify(e));
      const run = cli('assert', path, '--capture', file);
      assert.equal(run.status, code, run.stderr);
      assert.deepEqual(JSON.parse(run.stdout).assertions, r.assertions);
    }
    // Complete fixture coverage cannot fill missing external records or envelopes.
    const empty = { ...good, coverage: [], observations: [] };
    const uncertain = evaluate(s, { mode: 'assert', observedEvidence: empty });
    assert.equal(uncertain.summary.exitCode, 2);
    assert.ok(uncertain.assertions.every(a => a.status === 'INCONCLUSIVE'));
    assert.deepEqual(uncertain.coverage, []); assert.deepEqual(uncertain.observations, []);
    writeFileSync(file, JSON.stringify(empty));
    assert.equal(cli('assert', path, '--capture', file).status, 2);
    writeFileSync(file, JSON.stringify({ ...good, coverage: [] }));
    assert.throws(() => evaluate(s, { mode: 'assert', observedEvidence: { ...good, coverage: [] } }));
    assert.equal(cli('assert', path, '--capture', file).status, 3);
    assert.equal(JSON.stringify(s), original);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('external assertion streams use supplied profile coverage without fixture fallback', () => {
  const s = fixture('publication-buffer'), dir = realpathSync(mkdtempSync(join(tmpdir(), 'commerce-contracts-')));
  try {
    const profile = join(dir, 'profile.json'), stream = join(dir, 'capture.jsonl');
    const evidence = inventoryCapture(s.evidence, false);
    writeFileSync(profile, JSON.stringify({ ...evidence, observations: [] }));
    writeFileSync(stream, evidence.observations.map(o => JSON.stringify(o)).join('\n'));
    assert.equal(cli('assert', 'scenarios/publication-buffer.json', '--capture', stream, '--profile', profile).status, 1);
    writeFileSync(stream, inventoryCapture(s.evidence, true).observations.map(o => JSON.stringify(o)).join('\n'));
    assert.equal(cli('assert', 'scenarios/publication-buffer.json', '--capture', stream, '--profile', profile).status, 0);
    writeFileSync(profile, JSON.stringify({ ...evidence, observations: [], coverage: [] }));
    assert.equal(cli('assert', 'scenarios/publication-buffer.json', '--capture', stream, '--profile', profile).status, 3);
    writeFileSync(stream, '');
    assert.equal(cli('assert', 'scenarios/publication-buffer.json', '--capture', stream, '--profile', profile).status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('external expected uncertainty is a meta pass; absence assertions and raw diagnostics remain inconclusive', () => {
  const s = fixture('incomplete-pagination');
  const r = evaluate(s, { mode: 'assert', observedEvidence: s.evidence });
  assert.equal(r.assertions.find(a => a.id === 'diagnostic-presence')!.status, 'PASS');
  assert.equal(r.assertions.find(a => a.id === 'missing-finding')!.status, 'INCONCLUSIVE');
  assert.equal(r.checks.find(c => c.id === 'order.presence:shop/A')!.status, 'INCONCLUSIVE');
  assert.equal(r.summary.exitCode, 2);
  // An uncertainty-only contract may pass without changing the underlying diagnosis.
  s.assertions = s.assertions.filter(a => a.kind === 'diagnostic');
  const meta = evaluate(s, { mode: 'assert', observedEvidence: s.evidence });
  assert.equal(meta.summary.exitCode, 0); assert.ok(meta.summary.diagnostics.INCONCLUSIVE > 0);
});

test('external fulfillment retains 1/0/2 exits and excludes demo integration-status expectations', () => {
  const s = fixture('partial-shipment'), capture = { ...structuredClone(s.evidence), outcomes: [] };
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commerce-contracts-')));
  try {
    const file = join(dir, 'capture.json'), observed = join(dir, 'outcomes.jsonl');
    writeFileSync(file, JSON.stringify(capture));
    for (const [outcomes, code] of [[faultyIntegration(capture), 1], [correctedIntegration(capture), 0], [[], 2]] as const) {
      const r = evaluate(s, { mode: 'assert', observedEvidence: capture, observed: [...outcomes] });
      assert.equal(r.summary.exitCode, code);
      assert.ok(!r.assertions.some(a => a.id === 'faulty-outcome-detected'));
      assert.ok(r.assertions.some(a => a.id === 'partial-line-quantities' && a.status === 'PASS'));
      writeFileSync(observed, outcomes.map(o => JSON.stringify(o)).join('\n'));
      assert.equal(cli('assert', 'scenarios/partial-shipment.json', '--capture', file, '--observed', observed).status, code);
    }
    capture.coverage.find(c => c.resource === 'shipments')!.status = 'partial';
    const r = evaluate(s, { mode: 'assert', observedEvidence: capture, observed: correctedIntegration(capture) });
    assert.equal(r.summary.exitCode, 2);
    assert.equal(r.assertions.find(a => a.id === 'partial-detected')!.status, 'INCONCLUSIVE');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('bundle outcomes are used explicitly; separate outcomes require an empty bundle, even when empty or identical', () => {
  const s = fixture('partial-shipment'), capture = structuredClone(s.evidence);
  capture.outcomes = correctedIntegration(capture);
  assert.equal(evaluate(s, { mode: 'assert', observedEvidence: capture }).summary.exitCode, 0);
  for (const outcomes of [[], capture.outcomes, faultyIntegration(capture)]) assert.throws(() => evaluate(s, { mode: 'assert', observedEvidence: capture, observed: outcomes }), /Choose bundle outcomes/);
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commerce-contracts-')));
  try {
    const file = join(dir, 'capture.json'), observed = join(dir, 'outcomes.json');
    writeFileSync(file, JSON.stringify(capture)); writeFileSync(observed, '[]');
    assert.equal(cli('assert', 'scenarios/partial-shipment.json', '--capture', file).status, 0);
    assert.equal(cli('assert', 'scenarios/partial-shipment.json', '--capture', file, '--observed', observed).status, 3);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.equal(evaluate(s, { mode: 'assert' }).summary.exitCode, 2); // No fixture outcomes default.
  assert.equal(evaluate(s, { mode: 'assert', observed: correctedIntegration(s.evidence) }).summary.exitCode, 0);
  assert.equal(evaluate(fixture('publication-buffer'), { mode: 'assert', observed: [] }).summary.exitCode, 2);
});


test('simultaneous known point capture cannot hide an unknown interval in freshness', () => {
  const s = fixture('publication-buffer'), c = structuredClone(s.evidence.coverage.find(c => c.id === 'warehouse-1')!);
  c.id = 'a-unknown'; c.snapshotId = 'a-unknown'; delete c.captureInterval;
  s.evidence.coverage.push(c);
  const r = evaluate(s, { mode: 'assert', observedEvidence: s.evidence });
  assert.equal(r.checks.find(c => c.id === 'observation.freshness:warehouse/inventory/main/all')!.status, 'INCONCLUSIVE');
  assert.equal(r.assertions.find(a => a.id === 'warehouse-freshness')!.status, 'INCONCLUSIVE');
  const bad = evaluate(fixture('publication-buffer'));
  bad.coverage[0]!.captureInterval!.start = time('10:13');
  assert.throws(() => validateReport(bad), /Reversed/);
});


test('invalid explicitly supplied evidence cannot fall back to fixture diagnostics', () => {
  const s = fixture('publication-buffer');
  assert.throws(() => evaluate(s, { mode: 'assert', observedEvidence: null as never }));
  assert.throws(() => evaluate(s, { mode: 'assert', observedEvidence: false as never }));
  assert.throws(() => evaluate(s, { mode: 'assert', observed: null as never }));
  assert.throws(() => evaluate(s, { observed: [] }), /assertion mode/);
});
