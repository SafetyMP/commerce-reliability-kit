import { canonical, hash, validateReport } from '../core/validation.ts';
import type { Report } from '../core/types.ts';

export function compareReports(before: Report, after: Report) {
  validateReport(before); validateReport(after);
  for (const version of ['toolVersion', 'schemaVersion', 'ruleVersion', 'importerVersion'] as const) {
    if (before.manifest[version] !== after.manifest[version]) throw new Error('Incompatible report versions');
  }
  if (before.manifest.mode !== after.manifest.mode) throw new Error('Incompatible report workflows');
  const contextChanges: string[] = [];
  for (const key of ['scenarioId', 'scenarioVersion', 'profileVersion', 'policyHash', 'inputHash', 'evaluationTime', 'mappingVersions'] as const) {
    if (canonical(before.manifest[key]) !== canonical(after.manifest[key])) contextChanges.push(key);
  }
  for (const key of ['coverage', 'transformations', 'assumptions', 'limitations'] as const) {
    const stable = (r: Report) => r[key].map(canonical).sort();
    if (hash(stable(before)) !== hash(stable(after))) contextChanges.push(key);
  }
  const changes: { layer: string; id: string; change: string; before: unknown; after: unknown }[] = [];
  for (const layer of ['checks', 'assertions', 'integrationAssertions', 'findings'] as const) {
    const entries = (report: Report): Map<string, unknown> => {
      const map = new Map<string, unknown>();
      for (const entry of report[layer]) {
        const key = 'ruleId' in entry ? canonical([entry.ruleId, [...entry.entities].sort()]) : entry.id;
        if (map.has(key)) throw new Error('Ambiguous report identity');
        // Evidence IDs and ordering may change without changing the behavior being compared.
        map.set(key, 'ruleId' in entry ? { severity: entry.severity, interpretation: entry.interpretation, uncertainty: [...entry.uncertainty].sort(), blockingPrerequisites: [...entry.blockingPrerequisites].sort() } : { status: entry.status, reason: entry.reason, required: entry.required, expected: entry.expected, observed: entry.observed, details: entry.details });
      }
      return map;
    };
    const a = entries(before), b = entries(after);
    for (const id of [...new Set([...a.keys(), ...b.keys()])].sort()) if (canonical(a.get(id) ?? null) !== canonical(b.get(id) ?? null)) {
      changes.push({ layer, id, change: !a.has(id) ? 'added' : !b.has(id) ? 'removed' : 'changed', before: a.get(id) ?? null, after: b.get(id) ?? null });
    }
  }
  return { compatible: true, contextChanges, changes, warnings: contextChanges.length ? ['Context differs; behavior changes alone do not establish a regression.'] : [] };
}
