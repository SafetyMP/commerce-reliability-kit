import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, exitCode } from '../packages/core/index.ts';
import { renderHTML, renderJUnit } from '../packages/report/index.ts';
import { correctedIntegration, faultyIntegration } from '../examples/integrations.ts';
import { fixture } from './helpers.ts';
test('HTML and JUnit retain separate inconclusive diagnostics and passing meta assertions', () => {
  const r = evaluate(fixture('incomplete-pagination')), html = renderHTML(r), xml = renderJUnit(r);
  assert.equal(r.summary.assertions.PASS, r.assertions.length); assert.ok(r.summary.diagnostics.INCONCLUSIVE > 0);
  assert.match(html, /Diagnostic checks/); assert.match(html, /INCONCLUSIVE/); assert.match(html, /Counts and denominators/);
  assert.match(xml, /name="diagnostics.INCONCLUSIVE" value="1"/); assert.match(xml, /&quot;status&quot;: &quot;INCONCLUSIVE&quot;/);
  assert.match(xml, /name="scenario-or-external-assertions"/); assert.doesNotMatch(xml, /<skipped|<failure/);
});
test('demo JUnit tests only meta assertions and retains raw failure layers and every denominator', () => {
  for (const name of ['missing-order', 'partial-shipment', 'stale-observations']) {
    const r = evaluate(fixture(name)), xml = renderJUnit(r);
    assert.equal(r.summary.exitCode, 0); assert.doesNotMatch(xml, /<failure|<skipped/);
    assert.equal((xml.match(/<testcase /g) ?? []).length, r.assertions.length);
    assert.match(xml, /failures="0"/); assert.match(xml, /&quot;status&quot;: &quot;FAIL&quot;/);
    for (const layer of ['diagnostics', 'assertions', 'integrationAssertions', 'coverage'] as const) {
      for (const [key, count] of Object.entries(r.summary[layer])) assert.ok(xml.includes(`name="${layer}.${key}" value="${count}"`));
    }
  }
});
test('external JUnit fails faulty integration, passes corrected integration, and skips missing outcomes', () => {
  const s = fixture('partial-shipment');
  for (const [observed, failures, skipped] of [[faultyIntegration(s.evidence), 1, 0], [correctedIntegration(s.evidence), 0, 0], [[], 0, 1]] as const) {
    const r = evaluate(s, { mode: 'assert', observed: [...observed] }), xml = renderJUnit(r);
    assert.ok(xml.includes(`tests="1" failures="${failures}" skipped="${skipped}"`));
    assert.equal((xml.match(/<failure /g) ?? []).length, failures);
    assert.equal((xml.match(/<skipped /g) ?? []).length, skipped);
    if (skipped) assert.match(xml, /type="INCONCLUSIVE"/);
  }
});
test('analyze JUnit retains operational failures without inventing passing testcases', () => {
  const s = fixture('missing-order'), r = evaluate(s.evidence, { evaluationTime: s.evaluationTime });
  const xml = renderJUnit(r);
  assert.match(xml, /tests="0" failures="0" skipped="0"/); assert.doesNotMatch(xml, /<testcase /);
  assert.match(xml, /name="diagnostics.FAIL" value="1"/); assert.match(xml, /&quot;status&quot;: &quot;FAIL&quot;/);
});
test('hostile strings are escaped in HTML text, XML text and XML attributes', () => {
  const r = evaluate(fixture('normal-delay'));
  const hostile = '<script>alert("x")</script>&\'"';
  r.assumptions.push(hostile); r.assertions[0]!.reason = hostile; r.assertions[0]!.status = 'FAIL';
  assert.equal(renderHTML(r).includes('<script>'), false); assert.equal(renderJUnit(r).includes('<script>'), false);
  assert.match(renderHTML(r), /&lt;script&gt;/); assert.match(renderJUnit(r), /&quot;/);
  assert.equal(/<script|<link|<iframe|<img/.test(renderHTML(r)), false);
  r.assumptions.push('\u0001\ud800');
  assert.equal(renderHTML(r).includes('\u0001'), false);
});
test('exit precedence is failure before uncertainty; required NA is not a pass', () => {
  const result = evaluate(fixture('normal-delay')).assertions[0]!;
  assert.equal(exitCode([{ ...result, status: 'FAIL' }, { ...result, status: 'INCONCLUSIVE' }]), 1);
  assert.equal(exitCode([{ ...result, status: 'INCONCLUSIVE' }]), 2);
  assert.equal(exitCode([{ ...result, status: 'NOT APPLICABLE' }]), 2);
  assert.equal(exitCode([]), 2);
});
