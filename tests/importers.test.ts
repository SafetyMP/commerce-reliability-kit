import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { csvObservations, importCapture, normalizeObservation, parseCSV } from '../packages/importers/index.ts';
import { evaluate, readJSON } from '../packages/core/index.ts';
import { fixture } from './helpers.ts';

test('normalized JSON, JSONL and CSV agree and excluded values never reach reports', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'commerce-import-')));
  try {
    const s = fixture('publication-buffer'), e = s.evidence;
    const profile = join(dir, 'profile.json'); writeFileSync(profile, JSON.stringify({ ...e, observations: [] }));
    const rows = e.observations.map(o => ({ ...o, customerName: 'SECRET', accessToken: 'TOKEN', fields: { ...o.fields, customerNotes: 'PRIVATE' } }));
    const json = join(dir, 'capture.json'); writeFileSync(json, JSON.stringify({ ...e, observations: rows }));
    const jsonl = join(dir, 'capture.jsonl'); writeFileSync(jsonl, rows.map(o => JSON.stringify(o)).join('\n'));
    const headers = ['id','sourceId','sourceRecordId','snapshotId','observedAt','evidenceRef','entityType','itemId','locationId','quantity','unit','semantics','stockScope','customerName'];
    const csv = join(dir, 'capture.csv');
    writeFileSync(csv, [headers.join(','), ...e.observations.map(o => headers.map(h => ({ ...o, ...o.fields, customerName: '=HYPERLINK("secret")' } as Record<string, unknown>)[h]).map(v => '"'+String(v).replaceAll('"','""')+'"').join(','))].join('\r\n'));
    for (const path of [json, jsonl, csv]) {
      const imported = importCapture(path, path === json ? undefined : profile);
      const r = evaluate(imported, { evaluationTime: s.evaluationTime });
      assert.equal(r.checks.find(c => c.id === 'inventory.available:inventory-map')!.details.expectedQuantity, 10);
      assert.ok(r.observations.every(o => o.unmappedFields.length > 0));
      assert.doesNotMatch(JSON.stringify(r), /SECRET|TOKEN|PRIVATE|HYPERLINK/);
    }
    assert.throws(() => importCapture(jsonl));
    writeFileSync(jsonl, ''); assert.equal(importCapture(jsonl, profile).observations.length, 0);
    const link = join(dir, 'linked.json'); symlinkSync(json, link); assert.throws(() => readJSON(link));
    assert.throws(() => readJSON(join(dir, 'x') + '/../capture.json'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('CSV quoting is exact; malformed records, formulas in quantities and missing quantities are distinct', () => {
  assert.deepEqual(parseCSV('a,b\r\n"line\nvalue","a""b"\r\n'), [['a','b'],['line\nvalue','a"b']]);
  for (const text of ['a,a\n1,2', 'a,b\n1', 'a\n"unterminated', 'a\n"closed"bad']) assert.throws(() => csvObservations(text));
  assert.throws(() => csvObservations('entityType,quantity\ninventory,=1+1'));
  const row = csvObservations('entityType,quantity\ninventory,')[0] as { fields: object };
  assert.equal('quantity' in row.fields, false);
  assert.throws(() => normalizeObservation({ entityType: 'inventory', fields: {}, unmappedFields: ['<secret>'] }));
});
