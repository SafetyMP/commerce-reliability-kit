import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, isAbsolute, posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const excluded = /(?:^|\/)(?:node_modules|dist|\.git|\.codex|\.agents|\.aws|\.ecosystem|\.tmp|\.vite-cache|coverage|test-results|playwright-report)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|log|map|tgz|tsbuildinfo)$/i;
const internal = /(?:^|\/)(?:AGENTS\.md|node-check\.py|PROTECTED-HASHES\.json)$|^docs\/(?:.*(?:REQUEST|CONTEXT|HANDOFF|REVIEW|RECEIPT|DESIGN|RECOVERY|RESOLUTION|IMPLEMENTATION|COMPLETION|PLAN).*\.(?:md|json))$/i;
const patterns = [
  ['machine-specific path', /\/(?:Users|home)\/[^\s/"'<>]+\/|\/private\/(?:tmp|var)\/|\/var\/folders\/|[A-Z]:\\Users\\/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['cloud access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['service token', /\b(?:sk-[A-Za-z0-9_-]{32,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/],
];

export function scanText(text, artifact = false) {
  const found = patterns.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
  if (artifact && /sourceMappingURL\s*=/.test(text)) found.push('source map reference');
  if (artifact && /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?=[:/"'\s]|$)/i.test(text)) found.push('local runtime URL');
  return found;
}

function safeFile(base, file) {
  if (isAbsolute(file) || file.includes('\\') || file.split('/').some(p => !p || p === '.' || p === '..')) throw Error(`Unsafe publication path: ${file}`);
  let current = base;
  for (const part of file.split('/')) {
    current = resolve(current, part);
    if (lstatSync(current).isSymbolicLink()) throw Error(`Symlink excluded: ${file}`);
  }
  if (!lstatSync(current).isFile()) throw Error(`Expected regular file: ${file}`);
  return current;
}

export function inventory(base = root) {
  const names = JSON.parse(readFileSync(resolve(base, 'scripts/publication-files.json'), 'utf8'));
  if (!Array.isArray(names) || names.some(n => typeof n !== 'string') || JSON.stringify(names) !== JSON.stringify([...new Set(names)].sort())) throw Error('Publication inventory must be a sorted unique array of paths');
  return names.map(path => {
    if (excluded.test(path) || internal.test(path)) throw Error(`Local-only file in publication inventory: ${path}`);
    const bytes = readFileSync(safeFile(base, path));
    return { path, sha256: createHash('sha256').update(bytes).digest('hex') };
  });
}

function prose(text) { return text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, ''); }
function anchors(text) {
  const seen = new Map();
  const ids = new Set();
  for (const match of prose(text).matchAll(/^#{1,6}\s+(.+?)\s*#*$/gm)) {
    // Strip tag-like spans, including an unfinished trailing tag, for heading IDs.
    const slug = match[1].toLowerCase().replace(/<[^>]*>?/g, '').replace(/[^\p{L}\p{N}_\-\s]/gu, '').replace(/\s/g, '-');
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1); ids.add(count ? `${slug}-${count}` : slug);
  }
  for (const match of text.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) ids.add(match[1]);
  return ids;
}

export function markdownProblems(file, text, files, read) {
  const issues = [];
  const body = prose(text);
  const references = new Map([...body.matchAll(/^\s{0,3}\[([^\]]+)\]:\s*<?([^\s>]+)>?/gm)].map(m => [m[1].toLowerCase(), m[2]]));
  const targets = [...body.matchAll(/!?\[[^\]\n]*\]\(\s*<?([^\s)>]+)>?(?:\s+["'][^\n]*?["'])?\s*\)/g)].map(m => m[1]);
  for (const m of body.matchAll(/!?\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
    const target = references.get((m[2] || m[1]).toLowerCase());
    if (target) targets.push(target); else issues.push('undefined Markdown link reference');
  }
  targets.push(...references.values());
  for (const target of targets) {
    if (/^(?:https?:|mailto:|\/\/)/i.test(target)) continue;
    if (/^[a-z][a-z\d+.-]*:/i.test(target)) { issues.push('unsupported local link scheme'); continue; }
    let decoded;
    try { decoded = decodeURIComponent(target); } catch { issues.push('invalid link encoding'); continue; }
    const [pathAndQuery, anchor] = decoded.split('#');
    const path = pathAndQuery.split('?')[0];
    const resolved = path ? posix.normalize(posix.join(posix.dirname(file), path)) : file;
    if (path.startsWith('/') || !files.has(resolved)) { issues.push(`link outside public inventory: ${target}`); continue; }
    if (anchor && resolved.endsWith('.md') && !anchors(read(resolved)).has(anchor)) issues.push(`missing heading: ${target}`);
  }
  return issues;
}

export function checkRepository(base = root) {
  const items = inventory(base), files = new Set(items.map(x => x.path)), problems = [];
  const read = file => readFileSync(resolve(base, file), 'utf8');
  for (const { path } of items) {
    const text = read(path);
    for (const reason of scanText(text)) problems.push(`${path}: ${reason}`);
    if (path.endsWith('.md')) for (const reason of markdownProblems(path, text, files, read)) problems.push(`${path}: ${reason}`);
  }
  if (problems.length) throw Error(problems.join('\n'));
  return items;
}

function walk(base, prefix = '') {
  return readdirSync(resolve(base, prefix), { withFileTypes: true }).sort((a,b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0).flatMap(entry => {
    const name = prefix + entry.name;
    if (entry.isSymbolicLink()) throw Error(`Artifact symlink: ${name}`);
    if (entry.isDirectory()) return walk(base, name + '/');
    if (!entry.isFile()) throw Error(`Artifact is not a regular file: ${name}`);
    return [name];
  });
}

export function checkArtifact(directory, base) {
  if (!/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(base) || base.split('/').some(x => x === '..' || x === '.')) throw Error('Expected an absolute site base with a trailing slash');
  const artifact = resolve(directory);
  // Refuse a directory symlink as well as symlinks inside the output.
  let parent = artifact;
  while (parent !== dirname(parent)) {
    if (lstatSync(parent).isSymbolicLink()) throw Error('Artifact path contains a symlink');
    parent = dirname(parent);
  }
  const names = walk(artifact), files = new Set(names), problems = [];
  if (!files.has('index.html') || !files.has('favicon.svg') || !names.some(n => n.endsWith('.js')) || !names.some(n => n.endsWith('.css'))) throw Error('Incomplete static build');
  function assetRef(ref, from) {
    if (/^data:/.test(ref)) return;
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(ref)) { problems.push(`${from}: external asset reference`); return; }
    let target;
    if (ref.startsWith('/')) {
      if (!ref.startsWith(base)) { problems.push(`${from}: asset outside build base`); return; }
      target = ref.slice(base.length);
    } else target = posix.join(posix.dirname(from), ref);
    target = posix.normalize(target.split(/[?#]/)[0]);
    if (!files.has(target)) problems.push(`${from}: missing local asset ${target}`);
  }
  for (const name of names) {
    if (!/^(?:index\.html|favicon\.svg|assets\/[A-Za-z0-9_-]+\.(?:js|css|svg|png|jpg|jpeg|webp|woff2?))$/.test(name)) problems.push(`${name}: unexpected artifact file`);
    const text = readFileSync(safeFile(artifact, name), 'utf8');
    for (const reason of scanText(text, true)) problems.push(`${name}: ${reason}`);
    if (name.endsWith('.html')) for (const m of text.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) assetRef(m[1], name);
    if (name.endsWith('.css')) for (const m of text.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) assetRef(m[1], name);
    if (name.endsWith('.js')) for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)) assetRef(m[1], name);
  }
  if (problems.length) throw Error(problems.join('\n'));
  return names;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === '--artifact' && args.length === 4 && args[2] === '--base') {
      const directory = resolve(args[1]);
      if (!directory.startsWith(root + sep)) throw Error('Artifact must be inside the repository');
      const files = checkArtifact(directory, args[3]);
      console.log(`Static artifact check passed: ${files.length} files; base ${args[3]}. Browser acceptance remains separate.`);
    } else if (args.length === 1 && ['--check', '--list', '--json'].includes(args[0])) {
      const items = args[0] === '--check' ? checkRepository() : inventory();
      if (args[0] === '--list') console.log(items.map(x => x.path).join('\n'));
      else if (args[0] === '--json') console.log(JSON.stringify(items, null, 2));
      else console.log(`Publication check passed: ${items.length} explicitly selected files. Pattern scanning is not a full secret scan or history review.`);
    } else throw Error('Usage: node scripts/publication-check.mjs --check|--list|--json OR --artifact apps/demo/dist --base /commerce-reliability-kit/');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
