import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateScenario } from '../src/evaluator.ts';
import { compareRuns, HISTORY_LIMIT, saveRun, totals } from '../src/reports.ts';
import { createExport, escapeHTML, renderHTML } from '../src/export.ts';
import type { RunReport, SavedRun } from '../src/types.ts';

test('same-evidence comparison isolates a FAIL → PASS transition', () => {
  const before = evaluateScenario('partial-shipment', 'faulty'), after = evaluateScenario('partial-shipment', 'corrected');
  const result = compareRuns(before, after); assert(result.compatible);
  assert(result.sameEvidence); assert(result.samePolicy); assert(result.sameTime); assert.equal(result.warning, '');
  assert.equal(result.transitions[0]!.before, 'FAIL'); assert.equal(result.transitions[0]!.after, 'PASS');
  assert.equal(result.addedFindings.length, 0); assert.equal(result.removedFindings.length, 0);
  assert.deepEqual(totals(before), { PASS: 0, FAIL: 1, INCONCLUSIVE: 0, 'NOT APPLICABLE': 0 });
});
test('comparison identifies changed policy, coverage, observations and evaluation time', () => {
  const base = evaluateScenario('inventory-buffer', 'corrected');
  const policy = compareRuns(base, evaluateScenario('inventory-buffer', 'corrected', { buffer: 0 }));
  assert(policy.compatible); assert(policy.sameEvidence); assert(!policy.samePolicy); assert(policy.warning);
  assert.deepEqual(policy.policyDifferences, ['buffer']); assert.equal(policy.addedFindings[0]!.id, 'inventory.mismatch');
  const evidence = compareRuns(base, evaluateScenario('inventory-buffer', 'insufficient'));
  assert(evidence.compatible); assert(!evidence.sameEvidence); assert(evidence.sameCoverage); assert(evidence.warning);
  const full = evaluateScenario('partial-shipment', 'corrected');
  const partial = compareRuns(full, evaluateScenario('partial-shipment', 'insufficient'));
  assert(partial.compatible); assert(!partial.sameCoverage); assert(partial.warning);
  const changed = structuredClone(base); changed.evaluationTime = '2026-10-28T12:00:00Z';
  const time = compareRuns(base, changed); assert(time.compatible); assert(!time.sameTime); assert(time.warning);
  // Cached identity deliberately left unchanged. Compare must inspect actual records.
  changed.observations[0]!.sourceRecordId = 'different-record';
  const actual = compareRuns(base, changed); assert(actual.compatible); assert(!actual.sameEvidence);
});
test('unrelated scenarios and incompatible versions are blocked', () => {
  const a = evaluateScenario('partial-shipment', 'faulty');
  assert(!compareRuns(a, evaluateScenario('duplicate-shipment', 'corrected')).compatible);
  for (const key of ['scenarioVersion', 'ruleVersion', 'profileVersion'] as const) {
    const b = structuredClone(a); b[key] = 'different'; assert(!compareRuns(a, b).compatible);
  }
});
test('history bounds and deep copies prevent later edits from rewriting reports', () => {
  let history: SavedRun[] = [];
  const mutable = structuredClone(evaluateScenario('partial-shipment', 'faulty'));
  history = saveRun(history, mutable, 1);
  mutable.metrics.ordered = 900;
  assert.equal(history[0]!.report.metrics.ordered, 5);
  for (let n = 2; n <= 20; n++) history = saveRun(history, evaluateScenario('partial-shipment', n % 2 ? 'faulty' : 'corrected'), n);
  assert.equal(history.length, HISTORY_LIMIT); assert.equal(history[0]!.sequence, 9); assert.equal(history.at(-1)!.sequence, 20);
  assert.throws(() => { history[0]!.report.policy.buffer = 7; }, TypeError);
});
test('exports use the actual selected immutable report, including context and records', () => {
  const first = evaluateScenario('partial-shipment', 'faulty');
  evaluateScenario('inventory-buffer', 'corrected', { buffer: 8 });
  const json = createExport(first, 'json');
  assert.deepEqual(JSON.parse(json.content), first); assert.match(json.filename, /partial-shipment-faulty.json$/);
  const html = createExport(first, 'html');
  for (const expected of ['DEMO-1042', 'Partially fulfilled', 'Complete', 'FAIL', '0 passed', '1 failed', 'local-fixtures-1.0.0', first.evaluationTime, 'Evidence coverage', 'Source event', 'Observed at', 'No connected accounts']) assert(html.content.includes(expected));
  assert.match(html.content, /name="viewport"/); assert.match(html.content, /@media\(max-width:600px\)/);
  assert(!/<script\b|<link\b|<iframe\b|<img\b/.test(html.content));
  assert.equal(renderHTML(first), html.content);
  assert.throws(() => createExport({ assertions: [] } as unknown as RunReport, 'html'), /incomplete/);
});
test('HTML escapes all dynamic text, nested records, quotes, findings and policy keys', () => {
  const payload = '</pre><script>alert("x")</script><img src=x onerror=alert(1)>&\'"';
  const r = structuredClone(evaluateScenario('partial-shipment', 'faulty'));
  r.scenarioName = payload; r.limitations.push(payload); r.observations[0]!.sourceRecordId = payload;
  r.assertions[0]!.expected = payload; r.assertions[0]!.observed = payload; r.assertions[0]!.reason = payload;
  r.findings[0]!.title = payload; r.findings[0]!.detail = payload; r.findings[0]!.evidence.push(payload);
  Object.assign(r.policy, { [payload]: 4 });
  const html = renderHTML(r);
  assert(!html.includes('<script>')); assert(!html.includes('<img src=x')); assert(!html.includes(payload));
  assert(html.includes('&lt;script&gt;')); assert(html.includes('&quot;')); assert(html.includes('&#39;'));
  assert.equal(escapeHTML('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
  assert.equal(JSON.parse(createExport(r, 'json').content).scenarioName, payload);
});
