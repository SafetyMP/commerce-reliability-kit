import { instant } from './clock.ts';
import { canonical } from './validation.ts';
import type { Coverage, Evidence, Finding, Mapping, Observation, Resource, Result, Status } from './types.ts';

export const sorted = (values: string[]): string[] => [...new Set(values)].sort();
export const RULE_VERSION = '1.1.1';
export const keyOf = (source: string, entity: string): string => `${source}/${entity}`;
export function result(id: string, status: Status, reason: string, evidence: string[], details: Result['details'] = {}): Result {
  return { id, status, required: true, reason, evidence: sorted(evidence), expected: 'Sufficient evidence for the declared check', observed: reason, details };
}
export function finding(ruleId: string, evidence: string[], entities: string[], interpretation: string, severity: Finding['severity'] = 'warning'): Finding {
  return { ruleId, ruleVersion: RULE_VERSION, evidence: sorted(evidence), entities: sorted(entities), severity, interpretation,
    uncertainty: ['Coverage completeness and mappings are supplied declarations, not independently established.'], blockingPrerequisites: [] };
}
export function resourceOf(o: Observation): Resource { return o.entityType === 'order' || o.entityType === 'presence' ? 'orders' : o.entityType === 'shipment' ? 'shipments' : 'inventory'; }
export function revisionTime(o: Observation): number | undefined { const t = o.updatedTime ?? o.eventTime; return t ? instant(t) : undefined; }
export function resolveRevision<T extends Observation>(records: T[]): { value?: T; reason?: string } {
  if (!records.length) return { reason: 'missing_record' };
  const payloads = new Set(records.map(o => canonical(o.fields)));
  if (payloads.size === 1) return { value: [...records].sort((a, b) => instant(b.observedAt) - instant(a.observedAt) || a.id.localeCompare(b.id))[0]! };
  if (records.some(o => revisionTime(o) === undefined)) return { reason: 'unknown_revision_order' };
  const latest = records.reduce((latest, o) => Math.max(latest, revisionTime(o)!), -Infinity);
  const atLatest = records.filter(o => revisionTime(o) === latest);
  if (new Set(atLatest.map(o => canonical(o.fields))).size > 1) return { reason: 'contradictory_revision' };
  return { value: [...atLatest].sort((a, b) => a.id.localeCompare(b.id))[0]! };
}
export class Context {
  readonly evidence: Evidence;
  readonly now: number;
  readonly observations: Observation[];
  readonly snapshots: Map<string, Observation[]> = new Map();
  readonly coverageByResource: Map<string, Coverage[]> = new Map();
  constructor(evidence: Evidence, at: string) {
    this.evidence = evidence; this.now = instant(at);
    this.observations = [...new Map(evidence.observations.map(o => [o.id, o])).values()].sort((a, b) => a.id.localeCompare(b.id));
    for (const o of this.observations) {
      const key = `${o.sourceId}/${resourceOf(o)}/${o.snapshotId}`;
      const group = this.snapshots.get(key) ?? []; group.push(o); this.snapshots.set(key, group);
    }
    for (const c of evidence.coverage) {
      const key = `${c.sourceId}/${c.resource}`, group = this.coverageByResource.get(key) ?? [];
      group.push(c); this.coverageByResource.set(key, group);
    }
    for (const group of this.coverageByResource.values()) group.sort((a, b) => instant(a.observedAt) - instant(b.observedAt) || a.id.localeCompare(b.id));
  }
  records(c: Coverage): Observation[] { return this.snapshots.get(`${c.sourceId}/${c.resource}/${c.snapshotId}`) ?? []; }
  coverages(sourceId: string, resource: Resource): Coverage[] { return this.coverageByResource.get(`${sourceId}/${resource}`) ?? []; }
  snapshot(o: Observation): Coverage { return this.coverages(o.sourceId, resourceOf(o)).find(c => c.snapshotId === o.snapshotId)!; }
  temporal(o: Observation): string | undefined {
    if ([o.observedAt, o.eventTime, o.updatedTime, ...(o.entityType === 'shipment' ? [o.fields.milestoneTime] : [])].some(t => t !== undefined && instant(t) > this.now)) return 'future_evidence';
    return undefined;
  }
  freshness(c: Coverage): string | undefined {
    const interval = c.captureInterval;
    if ([c.observedAt, interval?.start, interval?.end].some(t => t != null && instant(t) > this.now)) return 'future_evidence';
    if (!interval || interval.start === null || interval.end === null) return 'unknown_capture_interval';
    // V0.1 only reasons about atomic snapshots. A completed scan is not fresh evidence
    // that all of its rows coexisted, even if its last page was read recently.
    if (instant(interval.start) !== instant(interval.end)) return 'non_atomic_capture_interval';
    const age = this.now - instant(interval.start);
    const f = this.evidence.policy.freshness.find(p => p.sourceId === c.sourceId && p.resource === c.resource);
    if (!f || f.cadenceMs === null || f.freshnessLimitMs === null) return 'unknown_cadence';
    if (age > f.freshnessLimitMs) return 'stale_evidence';
    return undefined;
  }
  usable(c: Coverage): string | undefined {
    return this.freshness(c) ?? (c.status !== 'complete' || c.pagination !== 'exhausted' ? 'incomplete_coverage' : undefined);
  }
  simultaneousIssue(snapshots: Coverage[]): string | undefined {
    const issue = snapshots.map(c => this.usable(c)).find(Boolean);
    if (issue) return issue;
    const contents = snapshots.map(c => canonical([...new Set(this.records(c).map(o => canonical({ entityType: o.entityType, fields: o.fields, eventTime: o.eventTime, updatedTime: o.updatedTime })))].sort()));
    return new Set(contents).size > 1 ? 'contradictory_simultaneous_snapshots' : undefined;
  }
  current(sourceId: string, resource: Resource, location?: string): { coverage?: Coverage; reason?: string } {
    const all = this.coverages(sourceId, resource).filter(c => !location || c.scope.locations.includes(location));
    if (!all.length) return { reason: 'missing_coverage' };
    const latest = all[all.length - 1]!;
    const simultaneous = all.filter(c => instant(c.observedAt) === instant(latest.observedAt));
    const issue = this.simultaneousIssue(simultaneous);
    if (issue) return { coverage: latest, reason: issue };
    if (new Set(all.map(c => canonical(c.scope))).size !== 1 || latest.scope.filter !== 'all') return { coverage: latest, reason: 'ambiguous_scope' };
    return { coverage: latest, ...(this.usable(latest) ? { reason: this.usable(latest)! } : {}) };
  }
  mappingIssue(m: Mapping, at = this.now): string | undefined {
    if (m.ambiguous) return 'ambiguous_mapping';
    if (at < instant(m.validFrom) || (m.validTo && at >= instant(m.validTo))) return 'mapping_outside_effective_interval';
    if (this.evidence.mappings.some(other => other !== m && other.kind === m.kind &&
      (canonical(other.fromRef) === canonical(m.fromRef) || canonical(other.toRef) === canonical(m.toRef)) &&
      instant(other.validFrom) <= at && (!other.validTo || instant(other.validTo) > at))) return 'conflicting_mapping';
    return undefined;
  }
}
