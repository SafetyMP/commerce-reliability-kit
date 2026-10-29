import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, realpathSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { evaluate, validateEvidence, compareReports } from '../packages/core/index.ts';
import type { Scenario } from '../packages/core/types.ts';
import { inventoryCapture, orderCapture } from '../examples/capture-integrations.ts';
import { fixture, time } from './helpers.ts';

const absent = (s: Scenario, ruleId: string): Scenario => {
  s.assertions = [{ id: 'absence', kind: 'finding', ruleId, present: false, required: true }];
  s.integrationAssertions = [];
  return s;
};
const delivery = (): Scenario => JSON.parse(readFileSync('examples/order-delivery.scenario.json', 'utf8'));

// Literal expectations follow the missing-evidence contract, not generated goldens.
test('contract review: mapped missing source order cannot disappear behind another delivered order', () => {
  const s = absent(delivery(), 'order.missing');
  const e = orderCapture(s.evidence, true);
  const mapping = structuredClone(e.mappings[0]!);
  mapping.id = 'second-order'; mapping.fromRef.entityId = 'B'; mapping.toRef.entityId = 'WB';
  e.mappings.push(mapping);
  for (const row of [...e.observations]) {
    if (row.entityType !== 'order' && row.entityType !== 'presence') continue;
    const copy = structuredClone(row); copy.id += '-B'; copy.fields.orderId = row.entityType === 'order' ? 'B' : 'WB';
    e.observations.push(copy);
  }
  e.observations = e.observations.filter(o => o.entityType !== 'order' || o.fields.orderId !== 'A');
  const r = evaluate(s, { mode: 'assert', observedEvidence: e });
  assert.equal(r.assertions[0]!.status, 'INCONCLUSIVE');
  assert.equal(r.summary.exitCode, 2);
  assert.equal(r.checks.find(c => c.id === 'order.presence:shop/A')?.reason, 'missing_source_order');
});

function twoDeadlineOrders(): Scenario {
  const s = absent(fixture('label-deadline'), 'fulfillment.deadline-missed');
  s.evidence.policy.deadlines!.push({ ...s.evidence.policy.deadlines![0]!, orderId: 'B' });
  for (const row of [...s.evidence.observations]) {
    const copy = structuredClone(row); copy.id += '-B';
    if (copy.entityType === 'order') copy.fields.orderId = 'B';
    if (copy.entityType === 'shipment') { copy.fields.orderId = 'B'; copy.fields.shipmentId = 'SB'; copy.fields.milestone = 'handed_off'; }
    s.evidence.observations.push(copy);
  }
  return s;
}

test('contract review: blocked deadline cannot disappear behind another met deadline', () => {
  const s = twoDeadlineOrders();
  const e = structuredClone(s.evidence);
  for (const row of e.observations) if (row.entityType === 'order' && row.fields.orderId === 'A') delete row.fields.ordered;
  const r = evaluate(s, { mode: 'assert', observedEvidence: e });
  assert.equal(r.assertions[0]!.status, 'INCONCLUSIVE');
  assert.equal(r.checks.find(c => c.id === 'fulfillment.deadline:shop/A')?.status, 'INCONCLUSIVE');
  assert.equal(r.checks.find(c => c.id === 'fulfillment.deadline:shop/B')?.status, 'PASS');
});

test('contract review: orphan shipment and policy deadline require missing order diagnostics', () => {
  const s = twoDeadlineOrders();
  const e = structuredClone(s.evidence);
  e.observations = e.observations.filter(o => o.entityType !== 'order' || o.fields.orderId !== 'A');
  for (const ruleId of ['fulfillment.deadline-missed', 'fulfillment.partial', 'fulfillment.over-shipped']) {
    absent(s, ruleId);
    const r = evaluate(s, { mode: 'assert', observedEvidence: e });
    assert.equal(r.assertions[0]!.status, 'INCONCLUSIVE', ruleId);
    assert.equal(r.checks.find(c => c.id === 'fulfillment.quantities:shop/A')?.reason, 'missing_source_order');
  }
});

for (const kind of ['missing', 'partial', 'failed', 'unknown', 'stale', 'non-atomic', 'missing-interval', 'unknown-boundary'] as const) {
  test(`contract review: external no-finding assertion rejects ${kind} inventory evidence`, () => {
    const s = absent(fixture('publication-buffer'), 'inventory.mismatch');
    const e = inventoryCapture(s.evidence, true);
    for (const c of e.coverage) {
      if (['partial', 'failed', 'unknown'].includes(kind)) c.status = kind as 'partial' | 'failed' | 'unknown';
      if (kind === 'stale') { c.observedAt = time('09:00'); c.captureInterval = { version: '1.0.0', start: c.observedAt, end: c.observedAt }; }
      if (kind === 'non-atomic') c.captureInterval!.start = time('09:00');
      if (kind === 'missing-interval') delete c.captureInterval;
      if (kind === 'unknown-boundary') c.captureInterval!.end = null;
    }
    if (kind === 'stale') for (const o of e.observations) { o.observedAt = time('09:00'); o.ingestedAt = s.evaluationTime; }
    if (kind === 'missing') { e.coverage = []; e.observations = []; }
    const r = evaluate(s, { mode: 'assert', observedEvidence: e });
    assert.equal(r.assertions[0]!.status, 'INCONCLUSIVE');
    assert.equal(r.summary.exitCode, 2);
    assert.deepEqual(r.findings.filter(f => f.ruleId === 'inventory.mismatch'), []);
  });
}

test('contract review: later observedAt cannot refresh an earlier point capture', () => {
  const e = fixture('publication-buffer').evidence;
  e.coverage[0]!.observedAt = time('10:12');
  assert.throws(() => validateEvidence(e), /outside capture interval/);
});

test('contract review: policy and internally consistent account rebinding are invalid', () => {
  const s = fixture('publication-buffer');
  const changedPolicy = structuredClone(s.evidence); changedPolicy.policy.inventory!.buffer = 3;
  assert.throws(() => evaluate(s, { mode: 'assert', observedEvidence: changedPolicy }), /scenario policy/);
  const changedAccount = structuredClone(s.evidence);
  for (const source of changedAccount.sources) source.account = 'other-account';
  for (const c of changedAccount.coverage) c.scope.account = 'other-account';
  for (const m of changedAccount.mappings) { m.fromRef.account = 'other-account'; m.toRef.account = 'other-account'; }
  validateEvidence(changedAccount);
  assert.throws(() => evaluate(s, { mode: 'assert', observedEvidence: changedAccount }), /account bindings/);
});

test('contract review: JSON/JUnit external inventory exits distinguish faulty, corrected, uncertain and invalid inputs', () => {
  const s = fixture('publication-buffer'), dir = realpathSync(mkdtempSync(join(tmpdir(), 'contract-review-')));
  try {
    const capture = join(dir, 'capture.json');
    const good = inventoryCapture(s.evidence, true), bad = inventoryCapture(s.evidence, false);
    const missing = { ...good, coverage: [], observations: [] };
    const invalid = { ...good, policy: { ...good.policy, persistenceMs: 0 } };
    for (const [e, code] of [[bad, 1], [good, 0], [missing, 2], [invalid, 3]] as const) {
      writeFileSync(capture, JSON.stringify(e));
      for (const format of ['json', 'junit']) {
        const run = spawnSync(process.execPath, ['--experimental-strip-types', 'packages/cli/index.ts', 'assert', 'scenarios/publication-buffer.json', '--capture', capture, '--format', format], { encoding: 'utf8', timeout: 15000 });
        assert.equal(run.status, code, run.stderr);
        if (code === 3) { assert.equal(run.stdout, ''); continue; }
        if (format === 'json') assert.equal(JSON.parse(run.stdout).summary.exitCode, code);
        else {
          assert.match(run.stdout, new RegExp(`name="exitCode" value="${code}"`));
          if (code === 1) assert.match(run.stdout, /<failure /);
          if (code === 2) assert.match(run.stdout, /<skipped type="INCONCLUSIVE"/);
          if (code === 0) assert.doesNotMatch(run.stdout, /<(failure|skipped) /);
        }
      }
    }
    const before = evaluate(s), after = structuredClone(before); after.manifest.ruleVersion = '1.1.0';
    assert.throws(() => compareReports(before, after), /Incompatible/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
