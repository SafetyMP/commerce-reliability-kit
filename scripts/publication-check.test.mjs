import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkArtifact, inventory, markdownProblems, scanText } from './publication-check.mjs';

test('pattern findings do not print secrets and recognize host paths', () => {
  const token = 'ghp_' + 'A'.repeat(36);
  const found = scanText(token + ' ' + '/' + ['Users', 'private-person', 'work'].join('/'));
  assert.deepEqual(found, ['machine-specific path', 'GitHub token']);
  assert(!JSON.stringify(found).includes(token));
  assert.deepEqual(scanText('synthetic fixture DEMO-1042'), []);
});

test('Markdown validation requires public targets and valid headings, ignores fenced examples', () => {
  const files = new Set(['README.md', 'docs/guide.md']);
  const read = () => '# First steps\n';
  assert.deepEqual(markdownProblems('README.md', '[Guide](docs/guide.md#first-steps)', files, read), []);
  assert.equal(markdownProblems('README.md', '[Private](docs/local.md)', files, read).length, 1);
  assert.equal(markdownProblems('README.md', '[Heading](docs/guide.md#absent)', files, read).length, 1);
  assert.deepEqual(markdownProblems('README.md', '```md\n[Sample](missing.md)\n```', files, read), []);
});

function fixture(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'publication-test-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<link href="/project/favicon.svg"><link href="/project/assets/app.css"><script src="/project/assets/app.js"></script>');
  writeFileSync(join(dir, 'favicon.svg'), '<svg/>');
  writeFileSync(join(dir, 'assets/app.css'), 'body{color:black}');
  writeFileSync(join(dir, 'assets/app.js'), 'console.log("synthetic")');
  return dir;
}

test('artifact checks reject wrong base, missing assets, source maps, external assets, and symlinks', t => {
  const dir = fixture(t);
  assert.equal(checkArtifact(dir, '/project/').length, 4);
  assert.throws(() => checkArtifact(dir, '/wrong/'), /outside build base/);
  writeFileSync(join(dir, 'assets/app.js.map'), '{}');
  assert.throws(() => checkArtifact(dir, '/project/'), /unexpected artifact/);
  rmSync(join(dir, 'assets/app.js.map'));
  writeFileSync(join(dir, 'assets/app.css'), 'body{background:url(https://example.invalid/image.png)}');
  assert.throws(() => checkArtifact(dir, '/project/'), /external asset/);
  writeFileSync(join(dir, 'assets/app.css'), 'body{background:url(missing.png)}');
  assert.throws(() => checkArtifact(dir, '/project/'), /missing local asset/);
  rmSync(join(dir, 'assets/app.css'));
  symlinkSync('app.js', join(dir, 'assets/app.css'));
  assert.throws(() => checkArtifact(dir, '/project/'), /symlink/i);
});

test('inventory rejects local-only files and symlinked publication inputs', t => {
  const dir = fixture(t);
  mkdirSync(join(dir, 'scripts'));
  const manifest = join(dir, 'scripts/publication-files.json');
  writeFileSync(manifest, JSON.stringify(['acceptance/node-check.py']));
  assert.throws(() => inventory(dir), /Local-only/);
  symlinkSync('index.html', join(dir, 'README.md'));
  writeFileSync(manifest, JSON.stringify(['README.md']));
  assert.throws(() => inventory(dir), /Symlink/);
});
