import { readFileSync, lstatSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import type { Coverage, Evidence, Outcome, Report, Scenario } from './types.ts';
import { instant } from './clock.ts';

const ajv = new Ajv({ allErrors: false, strict: true, allowUnionTypes: true });
addFormats.default(ajv);
for (const name of ['evidence', 'scenario', 'report', 'outcome']) {
  ajv.addSchema(JSON.parse(readFileSync(new URL(`../../schemas/${name}.schema.json`, import.meta.url), 'utf8')));
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export function hash(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
function guard(value: unknown, depth = 0): void {
  if (depth > 32) throw new Error('Input exceeds nesting limit');
  if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Unsafe input key');
    guard(item, depth + 1);
  }
}
function validate(name: string, value: unknown): void {
  guard(value);
  if (!ajv.getSchema(`${name}-${name === 'outcome' ? '1.0.0' : '1.1.0'}`)!(value)) throw new Error(`Invalid ${name} contract`);
}
export function parseJSON(text: string): unknown {
  if (Buffer.byteLength(text) > 32 * 1024 * 1024) throw new Error('Input exceeds 32 MiB limit');
  // Scan depth before parsing; quoted brackets do not contribute.
  let depth = 0, quoted = false, escaped = false;
  for (const c of text) {
    if (quoted) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') quoted = false; }
    else if (c === '"') quoted = true;
    else if (c === '{' || c === '[') { if (++depth > 32) throw new Error('Input exceeds nesting limit'); }
    else if (c === '}' || c === ']') depth--;
  }
  try { const value: unknown = JSON.parse(text); guard(value); return value; } catch { throw new Error('Invalid JSON input'); }
}
export function readText(path: string): string {
  if (path.includes('\0') || path.split(/[\\/]/).includes('..') || /^[a-z]+:\/\//i.test(path)) throw new Error('Only safe local files are supported');
  // Reject symlink files and directory components; never follow user input outside its declared path.
  // macOS /tmp and /var are system aliases, so compare below the canonical scratch root in callers.
  let component = resolve(path);
  while (dirname(component) !== component) {
    if (lstatSync(component).isSymbolicLink()) throw new Error('Symlink input is unsupported');
    component = dirname(component);
  }
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error('Input must be a regular file of at most 32 MiB');
  return readFileSync(path, 'utf8');
}
export function readJSON(path: string): unknown { return parseJSON(readText(path)); }
export function validateOutcome(value: unknown): asserts value is Outcome { validate('outcome', value); }
export function validateReport(value: unknown): asserts value is Report {
  validate('report', value);
  for (const c of (value as Report).coverage) validateCaptureInterval(c);
}
function validateCaptureInterval(c: Coverage): void {
  const observed = instant(c.observedAt), interval = c.captureInterval;
  if (!interval) return;
  const start = interval.start === null ? undefined : instant(interval.start);
  const end = interval.end === null ? undefined : instant(interval.end);
  if (start !== undefined && end !== undefined && start > end) throw new Error('Reversed capture interval');
  if ((start !== undefined && observed < start) || (end !== undefined && observed > end)) throw new Error('Observation time outside capture interval');
}
function unique<T extends { id: string }>(values: T[], exactAllowed = false): void {
  const seen = new Map<string, string>();
  for (const value of values) {
    const previous = seen.get(value.id), current = canonical(value);
    if (previous !== undefined && (!exactAllowed || previous !== current)) throw new Error('Duplicate or conflicting stable ID');
    seen.set(value.id, current);
  }
}
export function validateEvidence(value: unknown): asserts value is Evidence {
  validate('evidence', value);
  const e = value as Evidence;
  unique(e.sources); unique(e.coverage); unique(e.observations, true); unique(e.mappings); unique(e.outcomes, true);
  const sources = new Map(e.sources.map(s => [s.id, s]));
  if (e.sources.some(s => s.id.includes('/'))) throw new Error('Normalized source IDs cannot contain slash separators');
  const snapshots = new Map<string, typeof e.coverage[number]>();
  const allEvidenceIds = new Set(e.coverage.map(c => c.id));
  for (const c of e.coverage) {
    validateCaptureInterval(c);
    if (sources.get(c.sourceId)?.account !== c.scope.account) throw new Error('Coverage account mismatch');
    const key = `${c.sourceId}/${c.resource}/${c.snapshotId}`;
    if (snapshots.has(key)) throw new Error('Duplicate snapshot');
    snapshots.set(key, c);
  }
  for (const o of e.observations) {
    if (Object.entries(o.fields).some(([key, value]) => key.endsWith('Id') && typeof value === 'string' && value.includes('/'))) throw new Error('Normalized entity IDs cannot contain slash separators');
    for (const time of [o.observedAt, o.eventTime, o.updatedTime, o.ingestedAt]) if (time !== undefined) instant(time);
    if (o.entityType === 'order' && o.fields.releasedAt) instant(o.fields.releasedAt);
    if (o.entityType === 'shipment' && o.fields.milestoneTime) instant(o.fields.milestoneTime);
    if (allEvidenceIds.has(o.id)) throw new Error('Evidence ID collision');
    const resource = o.entityType === 'order' || o.entityType === 'presence' ? 'orders' : o.entityType === 'shipment' ? 'shipments' : 'inventory';
    const c = snapshots.get(`${o.sourceId}/${resource}/${o.snapshotId}`);
    if (!c || c.observedAt !== o.observedAt) throw new Error('Observation requires matching scoped snapshot');
    if (o.entityType === 'inventory' && !c.scope.locations.includes(o.fields.locationId)) throw new Error('Inventory location outside coverage');
  }
  for (const m of e.mappings) {
    instant(m.validFrom); if (m.validTo && instant(m.validTo) <= instant(m.validFrom)) throw new Error('Invalid mapping effective interval');
    for (const r of [m.fromRef, m.toRef]) {
      if (r.entityId.includes('/') || r.locationId?.includes('/')) throw new Error('Normalized entity IDs cannot contain slash separators');
      if (sources.get(r.sourceId)?.account !== r.account) throw new Error('Mapping account mismatch');
    }
  }
  const freshnessKeys = new Set<string>();
  const deadlines = new Set<string>();
  for (const deadline of e.policy.deadlines ?? []) {
    instant(deadline.at);
    const key = `${deadline.sourceId}/${deadline.orderId}`;
    if (!sources.has(deadline.sourceId) || deadlines.has(key)) throw new Error('Invalid deadline declaration');
    deadlines.add(key);
  }
  for (const f of e.policy.freshness) {
    const key = `${f.sourceId}/${f.resource}`;
    if (!sources.has(f.sourceId) || freshnessKeys.has(key)) throw new Error('Invalid freshness declaration');
    freshnessKeys.add(key);
  }
  const observationIds = new Set(e.observations.map(o => o.id));
  for (const o of e.outcomes) {
    if (!sources.has(o.sourceId)) throw new Error('Unknown outcome source');
    if (allEvidenceIds.has(o.id) || observationIds.has(o.id)) throw new Error('Outcome evidence ID collision');
  }
}
export function validateScenario(value: unknown): asserts value is Scenario {
  validate('scenario', value);
  const s = value as Scenario;
  validateEvidence(s.evidence); unique(s.assertions); unique(s.integrationAssertions ?? []);
  unique([...s.assertions, ...(s.integrationAssertions ?? [])]);
  instant(s.evaluationTime);
  if (s.requiredCapabilities.some(c => !s.evidence.policy.checks.includes(c))) throw new Error('Scenario requires a disabled capability');
}
