import { identity, freezeDeep } from './identity.ts';
import type { RunReport, SavedRun, Status } from './types.ts';
export const HISTORY_LIMIT = 12;
export const statuses: Status[] = ['PASS', 'FAIL', 'INCONCLUSIVE', 'NOT APPLICABLE'];
export function totals(report: RunReport): Record<Status, number> {
  const result = { PASS: 0, FAIL: 0, INCONCLUSIVE: 0, 'NOT APPLICABLE': 0 };
  report.assertions.forEach(a => result[a.status]++);
  return result;
}
export function totalText(report: RunReport): string {
  const t = totals(report);
  return `${t.PASS} passed · ${t.FAIL} failed · ${t.INCONCLUSIVE} inconclusive · ${t['NOT APPLICABLE']} not applicable`;
}
export function saveRun(history: SavedRun[], report: RunReport, sequence: number): SavedRun[] {
  return [...history, freezeDeep({ sequence, report: structuredClone(report) })].slice(-HISTORY_LIMIT);
}
export function compareRuns(before: RunReport, after: RunReport) {
  if (before.scenarioId !== after.scenarioId || before.scenarioVersion !== after.scenarioVersion || before.ruleVersion !== after.ruleVersion || before.profileVersion !== after.profileVersion) {
    return { compatible: false as const, reason: 'Choose runs of the same scenario, scenario version, rule version and profile version. Unrelated reports cannot establish a fix.' };
  }
  // Recompute from actual snapshots; never trust a cached key or include example output in evidence equality.
  const sameEvidence = identity({ observations: before.observations, coverage: before.coverage }) === identity({ observations: after.observations, coverage: after.coverage });
  const samePolicy = identity(before.policy) === identity(after.policy);
  const sameTime = before.evaluationTime === after.evaluationTime;
  const ids = [...new Set([...before.assertions, ...after.assertions].map(a => a.id))];
  const statusFor = (report: RunReport, id: string): Status | 'NOT PRESENT' => report.assertions.find(a => a.id === id)?.status ?? 'NOT PRESENT';
  return {
    compatible: true as const, sameEvidence, samePolicy, sameTime,
    warning: [
      !sameEvidence || !samePolicy ? 'These runs use different policies or evidence. Result changes may reflect those differences.' : '',
      !sameTime ? 'These runs use different evaluation times. Time-dependent conclusions may change even with identical policies and evidence.' : '',
    ].filter(Boolean).join(' '),
    transitions: ids.map(id => ({ id, title: after.assertions.find(a => a.id === id)?.title ?? before.assertions.find(a => a.id === id)!.title,
      before: statusFor(before, id), after: statusFor(after, id) })),
    policyDifferences: [...new Set([...Object.keys(before.policy), ...Object.keys(after.policy)])].filter(k => identity(before.policy[k as keyof typeof before.policy]) !== identity(after.policy[k as keyof typeof after.policy])),
    addedFindings: after.findings.filter(a => !before.findings.some(b => identity(b) === identity(a))),
    removedFindings: before.findings.filter(b => !after.findings.some(a => identity(a) === identity(b))),
    sameCoverage: identity(before.coverage) === identity(after.coverage),
  };
}
