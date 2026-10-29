import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync, readdirSync} from 'node:fs';

const cli = (...args) => spawnSync(process.execPath, ['--experimental-strip-types', 'packages/cli/index.ts', ...args], {encoding:'utf8', timeout:30000, maxBuffer:8*1024*1024});
const names = ['normal-delay','missing-order','incomplete-pagination','partial-shipment','publication-buffer','stale-observations'];
for (const name of names) test(`protected design gate: ${name}`, () => {
  const run = cli('demo', name, '--format', 'json');
  assert.equal(run.status, 0, run.stderr);
  const r = JSON.parse(run.stdout);
  assert.ok(r.manifest && r.summary);
  assert.ok(Array.isArray(r.findings));
  assert.ok(r.assertions.length > 0);
  assert.ok(r.assertions.every(a => a.id && typeof a.required === 'boolean' && ['PASS','FAIL','INCONCLUSIVE','NOT APPLICABLE'].includes(a.status)));
  assert.ok(r.assertions.filter(a => a.required).every(a => a.status === 'PASS'));
  for (const f of r.findings) {
    for (const key of ['ruleId','ruleVersion','evidence','entities','severity','interpretation','uncertainty','blockingPrerequisites']) assert.ok(key in f, key);
    assert.ok(f.evidence.length > 0);
  }
  const ids = r.findings.map(f => f.ruleId);
  if (name === 'missing-order') assert.ok(ids.includes('order.missing'));
  if (['normal-delay','incomplete-pagination'].includes(name)) assert.ok(!ids.includes('order.missing'));
  if (name === 'publication-buffer' || name === 'stale-observations') assert.ok(!ids.includes('inventory.mismatch'));
  if (name === 'stale-observations') assert.ok(ids.includes('observation.stale'));
  const again = JSON.parse(cli('demo', name, '--format', 'json').stdout);
  assert.deepEqual(r.findings, again.findings);
  assert.deepEqual(r.assertions, again.assertions);
});
test('invalid CLI fails with runner exit 3 without dumping raw data', () => {
  assert.equal(cli('unknown-command').status, 3);
  assert.equal(cli('demo', '../not-a-scenario').status, 3);
});
test('public versioned corpus has at least twenty JSON scenarios', () => {
  const scenarios = readdirSync('scenarios').filter(n => n.endsWith('.json'));
  assert.ok(scenarios.length >= 20);
  for (const file of scenarios) {
    const scenario = JSON.parse(readFileSync(`scenarios/${file}`, 'utf8'));
    assert.ok(scenario.id && scenario.version && scenario.purpose);
    assert.ok(scenario.provenance);
    assert.ok(scenario.assertions.length);
  }
});
test('library and portable contracts exist', async () => {
  const api = await import('../packages/core/index.ts');
  assert.equal(typeof api.evaluate, 'function');
  assert.equal(typeof api.VirtualClock, 'function');
  const schemas = readdirSync('schemas').filter(n => n.endsWith('.json'));
  assert.ok(schemas.length >= 2);
  for (const file of schemas) assert.ok(JSON.parse(readFileSync(`schemas/${file}`,'utf8')).$schema);
});
