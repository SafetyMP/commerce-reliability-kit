import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { initialView, observeHash, skipToMain, viewFromHash } from '../src/navigation.ts';

test('former technical bookmarks resolve to the component reference', () => {
  for (const name of ['technical','library','workbench','report','compare']) assert.equal(viewFromHash('#'+name), 'technical');
  for (const hash of ['', '#case', '#unknown']) assert.equal(viewFromHash(hash), 'case');
  assert.equal(initialView(), 'case');
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
  assert.deepEqual(views, ['technical', 'technical', 'technical', 'case']);
  stop(); location.hash = '#workbench'; events.dispatchEvent(new Event('hashchange'));
  assert.equal(views.length, 4);
});

test('skip link focuses main without replacing the route used by refresh and back', () => {
  for (const view of ['case', 'technical']) {
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

test('technical bookmarks render only the short project reference', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    for (const hash of ['#technical', '#technical?packet=insufficient&response=confirm', '#workbench', '#report', '#compare', '#library']) {
      Object.defineProperty(globalThis, 'window', { configurable:true, value:{location:{hash}} });
      const html = renderToStaticMarkup(createElement(App));
      assert.match(html, /<h1>Trace the partial shipment/);
      assert.match(html, /apps\/demo\/src\/evaluator.ts/);
      assert.doesNotMatch(html, /Scenario library|The stock promise desk/);
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor); else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('selected reply opens the stock decision and carries its consequences into the pilot', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
  try {
    for (const [hash, expected, hidden] of [
      ['#case?packet=faulty', 'Packing slip', 'Can Jo trust the order status?'],
      ['#case?packet=faulty&response=follow', 'The connector would close an order with 2 lamps still open', 'The revised rule passes'],
      ['#case?packet=corrected&response=follow', 'The revised rule passes on the same records', 'The connector would close an order'],
      ['#case?packet=insufficient&response=follow', 'The missing page could contain another handoff', 'The revised rule passes'],
      ['#case?packet=faulty&response=close', 'Three pickups come first, then eight web requests', 'What would you fund?'],
      ['#case?packet=faulty&response=close&offer=3', 'Both café tables can have a loaner', 'unfilled promise'],
      ['#case?packet=corrected&response=follow&offer=6', 'Track accepted web orders that still have to wait', 'Both café tables can have a loaner'],
      ['#case?packet=insufficient&response=confirm&stock=count&offer=6', 'The café is waiting on inspection', 'Both café tables can have a loaner'],
      ['#technical?stage=stock&stock=count&offer=3', 'the café’s allocation is unknown', 'Two loaner lamps for tonight'],
    ]) {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hash } } });
      const html = renderToStaticMarkup(createElement(App));
      assert(html.includes(expected!), hash);
      assert(!html.includes(hidden!), hash);
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'window', descriptor); else Reflect.deleteProperty(globalThis, 'window');
  }
});
