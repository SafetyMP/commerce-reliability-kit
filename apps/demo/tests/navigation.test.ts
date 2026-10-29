import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { initialView, observeHash, skipToMain, viewFromHash } from '../src/navigation.ts';

test('four hash views and invalid/empty fallback are deterministic', () => {
  for (const view of ['library', 'workbench', 'report', 'compare']) assert.equal(viewFromHash(`#${view}`), view);
  for (const hash of ['', '#unknown', '#REPORT', '#/report', '#report/1', '#%72eport']) assert.equal(viewFromHash(hash), 'library');
  assert.equal(initialView(), 'library');
});

test('hash changes support navigation and cleanup without hijacking the skip link', () => {
  const events = new EventTarget();
  const location = { hash: '#workbench' };
  const target = { location, addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events) };
  const views: string[] = [];
  const stop = observeHash(target as unknown as Window, view => views.push(view));
  for (const hash of ['#report', '#compare', '#report', '#main', '#invalid']) {
    location.hash = hash; events.dispatchEvent(new Event('hashchange'));
  }
  assert.deepEqual(views, ['report', 'compare', 'report', 'library']);
  stop(); location.hash = '#workbench'; events.dispatchEvent(new Event('hashchange'));
  assert.equal(views.length, 4);
});

test('skip link focuses main without replacing the route used by refresh and back', () => {
  for (const view of ['library', 'workbench', 'report', 'compare']) {
    const history = [`#${view}`];
    let focused = false;
    const main = { focus() { focused = true; } };
    const target = { getElementById(id: string) {
      assert.equal(id, 'main');
      return main as unknown as HTMLElement;
    } };
    const click = new Event('click', { cancelable: true });
    skipToMain(click, target);
    // Model the anchor's default action; it must not add a #main entry.
    if (!click.defaultPrevented) history.push('#main');
    assert(focused);
    assert(click.defaultPrevented);
    assert.equal(history.length, 1);
    assert.equal(viewFromHash(history.at(-1)!), view, 'refresh retains the current view');
    history.push(view === 'compare' ? '#report' : '#compare');
    history.pop();
    assert.equal(viewFromHash(history.at(-1)!), view, 'back returns to the prior view');
  }
  const missing = new Event('click', { cancelable: true });
  skipToMain(missing, { getElementById: () => null });
  assert.equal(missing.defaultPrevented, false, 'keep native fallback when main is unavailable');
});

const hook = registerHooks({ load(url, context, nextLoad) {
  if (url.startsWith(new URL('../src/', import.meta.url).href) && url.endsWith('.tsx')) {
    return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText };
  }
  return nextLoad(url, context);
} });
const { App } = await import('../src/App.tsx');
hook.deregister();

test('direct report and comparison views honestly render empty after a fresh session', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    for (const [hash, heading, empty] of [
      ['#report', 'Run report', 'No saved run yet'],
      ['#compare', 'Compare runs', 'Two runs make a comparison'],
      ['#workbench', 'Partial shipment', 'No run yet'],
      ['#invalid', 'Scenario library', '06 / LOCAL SCENARIOS'],
    ]) {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hash } } });
      const html = renderToStaticMarkup(createElement(App));
      assert(html.toLowerCase().includes(heading.toLowerCase()));
      assert(html.includes(empty));
      assert(html.includes('Synthetic demo · No connected accounts'));
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor); else Reflect.deleteProperty(globalThis, 'window');
  }
});
