import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { evaluateScenario, scenarios } from '../src/evaluator.ts';

// Render real components in Node using the provisioned compiler and React.
// No browser, synthetic DOM, hook mocks, dependency install, or output files.
const hook = registerHooks({ load(url, context, nextLoad) {
  if (url.startsWith(new URL('../src/', import.meta.url).href) && url.endsWith('.tsx')) {
    const source = ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      fileName: new URL(url).pathname,
    }).outputText;
    return { format: 'module', source, shortCircuit: true };
  }
  return nextLoad(url, context);
} });
const { App } = await import('../src/App.tsx');
const { EvidencePanel, MetricFacts, ResultStrip, StatusBadge } = await import('../src/components.tsx');
hook.deregister();

test('initial library markup has six named scenario actions and accessible native navigation/search', () => {
  const html = renderToStaticMarkup(createElement(App));
  assert.match(html, /Synthetic demo · No connected accounts/);
  assert.match(html, /No production verification/);
  assert.match(html, /href="#main"/);
  assert.match(html, /<main id="main" tabindex="-1">/);
  assert.match(html, /<h1[^>]*>Scenario library<\/h1>/);
  assert.match(html, /<nav aria-label="Main views">/);
  assert.match(html, /aria-current="page"/);
  assert.match(html, /Search scenarios<\/span>.*?<input type="search"/);
  assert.equal((html.match(/aria-label="Open /g) ?? []).length, 6);
  for (const s of scenarios) assert(html.includes(`aria-label="Open ${s.title}"`));
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /<a[^>]+href="https?:|<img|<iframe|<script/);
});

test('insufficient report components print Unknown rather than null, undefined, or invented zero totals', () => {
  for (const id of ['partial-shipment', 'duplicate-shipment', 'inventory-buffer', 'stale-evidence'] as const) {
    const report = evaluateScenario(id, 'insufficient');
    const html = renderToStaticMarkup(createElement(MetricFacts, { report }));
    assert.match(html, /Unknown/);
    assert.doesNotMatch(html, />null<|>undefined<|>NaN</);
    if (id.endsWith('shipment')) {
      assert.match(html, /Fulfilled<\/dt><dd>Unknown/);
      assert.match(html, /Outstanding<\/dt><dd>Unknown/);
    }
    const strip = renderToStaticMarkup(createElement(ResultStrip, { report }));
    assert.match(strip, /0 passed · 0 failed · 1 inconclusive/);
  }
});

test('evidence markup distinguishes unknown event time from capture time and exposes keyboard-readable records', () => {
  const report = evaluateScenario('stale-evidence', 'corrected');
  const html = renderToStaticMarkup(createElement(EvidencePanel, {
    facts: report, selected: 'DEMO-net-sellable', onSelect: () => {}, evaluationTime: report.evaluationTime,
  }));
  assert.match(html, /Source event <b>Unknown<\/b>/);
  assert.match(html, /Observed at <b>10:15:00<\/b>/);
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /<pre tabindex="0" aria-label="Normalized record DEMO-net-sellable">/);
  assert.match(html, /&quot;quantity&quot;: 10/);
  const scope = renderToStaticMarkup(createElement(EvidencePanel, {
    facts: report, selected: 'DEMO-warehouse-stock', onSelect: () => {}, evaluationTime: report.evaluationTime,
  }));
  assert.match(scope, /&quot;completenessBasis&quot;: &quot;user-declared&quot;/);
});

test('React escapes hostile normalized records and attribute values in the inline inspector', () => {
  const report = structuredClone(evaluateScenario('partial-shipment', 'corrected'));
  const payload = '\"><img src=x onerror="alert(1)"><script>alert(1)</script>';
  report.observations[0]!.id = payload;
  report.observations[0]!.sourceRecordId = payload;
  report.coverage[0]!.id = payload + '-scope';
  for (const selected of [payload, payload + '-scope']) {
    const html = renderToStaticMarkup(createElement(EvidencePanel, {
      facts: report, selected, onSelect: () => {}, evaluationTime: report.evaluationTime,
    }));
    assert.doesNotMatch(html, /<img|<script|onerror="alert/);
    assert.match(html, /&lt;img/);
    assert.match(html, /&quot;/);
  }
});

test('every status has readable text and an icon without relying on color alone', () => {
  for (const status of ['PASS', 'FAIL', 'INCONCLUSIVE', 'NOT APPLICABLE'] as const) {
    const html = renderToStaticMarkup(createElement(StatusBadge, { status }));
    assert(html.includes(status));
    assert.match(html, /aria-hidden="true"/);
  }
});
