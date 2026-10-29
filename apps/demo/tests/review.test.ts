import test from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateScenario, scenarios } from '../src/evaluator.ts';
import { compareRuns } from '../src/reports.ts';
import { createExport, downloadExport, escapeHTML, renderHTML } from '../src/export.ts';
import type { Policy } from '../src/types.ts';

test('a time-only comparison names the changed time without inventing policy or evidence changes', () => {
  const before = evaluateScenario('stale-evidence', 'corrected');
  const after = structuredClone(before);
  after.evaluationTime = '2026-10-28T11:10:00Z';
  const result = compareRuns(before, after);
  assert(result.compatible && result.sameEvidence && result.samePolicy && !result.sameTime);
  assert.match(result.warning, /different evaluation times/i);
  assert.doesNotMatch(result.warning, /use different policies or evidence/);
});

test('absence requires two post-allowance captures, including exact boundary instants', () => {
  for (const [allowanceMinutes, count, status, finding] of [
    [35, 2, 'PASS', true], [36, 1, 'INCONCLUSIVE', false],
    [50, 1, 'INCONCLUSIVE', false], [51, 0, 'PASS', false],
  ] as const) {
    const r = evaluateScenario('missing-order', 'corrected', { allowanceMinutes });
    assert.equal(r.metrics.postAllowanceObservations, count);
    assert.equal(r.assertions[0]!.status, status);
    assert.equal(r.findings.some(f => f.id === 'order.missing'), finding);
    if (allowanceMinutes === 51) assert.equal(r.assertions[0]!.expected, 'Within synchronization allowance');
  }
});

test('relaxed policies cannot turn missing quantities or partial coverage into a pass', () => {
  for (const s of scenarios) {
    const policies: Policy[] = Object.hasOwn(s.defaults, 'buffer') ? [{ buffer: 0 }, { buffer: 100 }]
      : Object.hasOwn(s.defaults, 'freshnessMinutes') ? [{ freshnessMinutes: 0 }, { freshnessMinutes: 1000 }]
      : Object.hasOwn(s.defaults, 'allowanceMinutes') ? [{ allowanceMinutes: 0 }, { allowanceMinutes: 1000 }]
      : [{}];
    for (const policy of policies) {
      const r = evaluateScenario(s.id, 'insufficient', policy);
      assert.equal(r.assertions[0]!.status, 'INCONCLUSIVE', `${s.id}: ${JSON.stringify(policy)}`);
      assert(!r.findings.some(f => ['order.missing', 'inventory.mismatch'].includes(f.id)));
    }
  }
});

test('zero-buffer agreement is a pass even for the faulty example; conclusions follow output, not its label', () => {
  const r = evaluateScenario('inventory-buffer', 'faulty', { buffer: 0 });
  assert.equal(r.assertions[0]!.status, 'PASS');
  assert.equal(r.assertions[0]!.expected, '14 expected published units; mismatch');
  assert.equal(r.assertions[0]!.observed, r.assertions[0]!.expected);
  assert.equal(r.findings[0]!.id, 'inventory.mismatch');
});

test('HTML escapes every string field, including IDs, times, coverage and full-report metadata', () => {
  const payload = '</title></summary></pre><script>alert("x")</script><img src=x onerror="alert(1)">&\'';
  const original = structuredClone(evaluateScenario('partial-shipment', 'faulty'));
  // Exercise each string separately, including nested fields not explicitly printed in tables.
  function* strings(value: unknown, path: (string | number)[] = []): Generator<(string | number)[]> {
    if (typeof value === 'string') yield path;
    else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) yield* strings(child, [...path, key]);
    }
  }
  for (const path of strings(original)) {
    const report = structuredClone(original);
    let parent: any = report;
    for (const part of path.slice(0, -1)) parent = parent[part];
    parent[path.at(-1)!] = payload;
    const html = renderHTML(report);
    assert.doesNotMatch(html, /<script\b|<img\b|onerror="alert/, path.join('.'));
    assert(!html.includes(payload), path.join('.'));
    assert(html.includes('&lt;script&gt;'), path.join('.'));
    assert.deepEqual(JSON.parse(createExport(report, 'json').content), report);
  }
  assert.equal(escapeHTML(payload).includes('<'), false);
});

// These are download lifecycle unit checks, not browser/download acceptance.
function downloadEnvironment(t: TestContext, fail?: 'create' | 'append' | 'click') {
  const calls: string[] = [];
  const callbacks: (() => void)[] = [];
  const link = {
    href: '', download: '',
    click() { calls.push('click'); if (fail === 'click') throw new Error('click rejected'); },
    remove() { calls.push('remove'); },
  };
  t.mock.method(URL, 'createObjectURL', () => { calls.push('allocate'); return 'blob:review'; });
  t.mock.method(URL, 'revokeObjectURL', (url: string) => { assert.equal(url, 'blob:review'); calls.push('revoke'); });
  t.mock.method(globalThis, 'setTimeout', (callback: () => void) => { callbacks.push(callback); return 1; });
  const oldDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement(tag: string) { assert.equal(tag, 'a'); if (fail === 'create') throw new Error('create rejected'); return link; },
    body: { append() { calls.push('append'); if (fail === 'append') throw new Error('append rejected'); } },
  } });
  t.after(() => { if (oldDocument) Object.defineProperty(globalThis, 'document', oldDocument); else Reflect.deleteProperty(globalThis, 'document'); });
  return { calls, callbacks, link };
}

test('download gives the browser time to consume the selected blob before revoking it', t => {
  const { calls, callbacks, link } = downloadEnvironment(t);
  const artifact = createExport(evaluateScenario('partial-shipment', 'faulty'), 'html');
  downloadExport(artifact);
  assert.equal(link.download, artifact.filename);
  assert.equal(link.href, 'blob:review');
  assert.deepEqual(calls, ['allocate', 'append', 'click', 'remove']);
  assert.equal(callbacks.length, 1);
  callbacks[0]!();
  assert.equal(calls.at(-1), 'revoke');
});

for (const fail of ['create', 'append', 'click'] as const) test(`download ${fail} failure propagates and leaves no blob or anchor behind`, t => {
  const { calls, callbacks } = downloadEnvironment(t, fail);
  const selected = evaluateScenario('partial-shipment', 'faulty');
  assert.throws(() => downloadExport(createExport(selected, 'json')), new RegExp(`${fail} rejected`));
  assert.equal(calls.filter(c => c === 'allocate').length, calls.filter(c => c === 'revoke').length);
  if (fail !== 'create') assert(calls.includes('remove'));
  assert.equal(callbacks.length, 0);
  assert.equal(selected.assertions[0]!.status, 'FAIL');
});
