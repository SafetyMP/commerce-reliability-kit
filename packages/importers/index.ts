import { parseJSON, readJSON, readText, validateEvidence } from '../core/validation.ts';
import type { Evidence } from '../core/types.ts';

const base = ['id', 'sourceId', 'sourceRecordId', 'snapshotId', 'observedAt', 'eventTime', 'updatedTime', 'ingestedAt', 'evidenceRef', 'unmappedFields', 'entityType', 'fields'];
const fields: Record<string, string[]> = {
  order: ['orderId', 'lineId', 'productId', 'ordered', 'canceled', 'eligible', 'releasedAt'],
  presence: ['orderId'],
  shipment: ['shipmentId', 'orderId', 'lineId', 'quantity', 'milestone', 'milestoneTime', 'reversalOf'],
  inventory: ['itemId', 'locationId', 'quantity', 'unit', 'semantics', 'stockScope']
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected normalized object');
  return value as Record<string, unknown>;
}
/** Whitelist only normalized observation fields. Never retain dropped values or arbitrary field names. */
export function normalizeObservation(value: unknown): unknown {
  const row = object(value), allowed = fields[String(row.entityType)];
  if (!allowed) throw new Error('Unknown normalized entity type');
  const normalized: Record<string, unknown> = {}, normalizedFields: Record<string, unknown> = {};
  const losses: string[] = [];
  let dropped = 0;
  for (const [key, v] of Object.entries(row)) {
    if (base.includes(key)) normalized[key] = v;
    else losses.push(`excluded-field-${++dropped}`);
  }
  for (const [key, v] of Object.entries(object(row.fields))) {
    if (allowed.includes(key)) normalizedFields[key] = v;
    else losses.push(`excluded-field-${++dropped}`);
  }
  if (row.unmappedFields !== undefined && (!Array.isArray(row.unmappedFields) || row.unmappedFields.some(v => typeof v !== 'string' || !/^[A-Za-z0-9_.:-]{1,160}$/.test(v)))) throw new Error('Invalid import loss declaration');
  normalized.fields = normalizedFields;
  normalized.unmappedFields = [...new Set([...(row.unmappedFields as string[] | undefined ?? []), ...losses])].sort();
  return normalized;
}

/** RFC4180-style bounded normalized CSV. No formula evaluation or CSV export. */
export function parseCSV(text: string): string[][] {
  if (Buffer.byteLength(text) > 32 * 1024 * 1024) throw new Error('CSV exceeds size limit');
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false, closed = false;
  const cell = (): void => { row.push(field); field = ''; closed = false; if (row.length > 128) throw new Error('Too many CSV columns'); };
  const record = (): void => { cell(); rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; } }
      else field += c;
    } else if (c === ',') cell();
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; record(); }
    else if (c === '"' && !field && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error('Malformed CSV quoting'); field += c; }
  }
  if (quoted) throw new Error('Unterminated CSV field');
  if (field || row.length || closed) record();
  return rows;
}
export function csvObservations(text: string): unknown[] {
  const [headers, ...rows] = parseCSV(text);
  if (!headers || new Set(headers).size !== headers.length || headers.some(h => !/^[A-Za-z][A-Za-z0-9_]{0,159}$/.test(h))) throw new Error('Invalid CSV headers');
  return rows.map(values => {
    if (values.length !== headers.length) throw new Error('Inconsistent CSV row width');
    const row: Record<string, unknown> = { fields: {} }, payload = row.fields as Record<string, unknown>;
    headers.forEach((header, i) => {
      const value = values[i]!;
      if (!value) return; // Missing numeric cells stay absent, never zero.
      if (base.includes(header) && !['fields', 'unmappedFields'].includes(header)) row[header] = value;
      else if (['quantity', 'ordered', 'canceled'].includes(header)) {
        if (!/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error('Invalid CSV quantity');
        payload[header] = Number(value);
      } else if (header === 'eligible') {
        if (!['true', 'false'].includes(value)) throw new Error('Invalid CSV boolean');
        payload[header] = value === 'true';
      } else payload[header] = value;
    });
    return normalizeObservation(row);
  });
}

/** JSON is an evidence envelope; streams/CSV require an explicit envelope profile with empty observations. */
export function importCapture(path: string, profilePath?: string): Evidence {
  let envelope: Record<string, unknown>;
  let observations: unknown[];
  if (path.endsWith('.jsonl') || path.endsWith('.csv')) {
    if (!profilePath) throw new Error('Observation streams require --profile evidence envelope');
    const profile = readJSON(profilePath); validateEvidence(profile);
    if (profile.observations.length) throw new Error('Stream profile observations must be empty');
    envelope = { ...profile };
    const text = readText(path);
    observations = path.endsWith('.csv') ? csvObservations(text) : text.split(/\r?\n/).filter(s => s.trim()).map(s => normalizeObservation(parseJSON(s)));
  } else {
    envelope = object(readJSON(path));
    if (!Array.isArray(envelope.observations)) throw new Error('Missing observations');
    observations = envelope.observations.map(normalizeObservation);
    if (profilePath) {
      const profile = readJSON(profilePath); validateEvidence(profile);
      envelope = { ...envelope, policy: profile.policy };
    }
  }
  const evidence = { ...envelope, observations }; validateEvidence(evidence); return evidence;
}
