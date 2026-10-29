import { result, sorted } from './context.ts';
import { canonical } from './validation.ts';
import type { Finding, MetaAssertion, Result } from './types.ts';

// Finding absence is supported only by the diagnostics that could produce it.
// Unknown rule IDs have no evidence prerequisite contract and remain inconclusive.
const prerequisite: Record<string, string> = {
  'order.missing': 'order.presence',
  'inventory.mismatch': 'inventory.available',
  'fulfillment.partial': 'fulfillment.quantities',
  'fulfillment.over-shipped': 'fulfillment.quantities',
  'fulfillment.deadline-missed': 'fulfillment.deadline',
  'observation.stale': 'observation.freshness'
};

export function scenarioAssertion(a: MetaAssertion, checks: Result[], findings: Finding[], integration: Result[], external: boolean): Result {
  if (a.kind === 'finding') {
    const matched = findings.filter(f => f.ruleId === a.ruleId), present = matched.length > 0;
    const entities = sorted(matched.flatMap(f => f.entities));
    const matches = present === a.present && (a.expectedEntities === undefined || canonical(entities) === canonical(sorted(a.expectedEntities)));
    const prefix = prerequisite[a.ruleId!];
    const supporting = prefix ? checks.filter(c => c.id === prefix || c.id.startsWith(prefix + ':')) : [];
    const incomplete = !supporting.length || supporting.some(c => c.status === 'INCONCLUSIVE' || c.status === 'NOT APPLICABLE');
    // A detected finding can contradict an absence expectation despite unrelated gaps.
    // An absent finding never proves absence when its diagnostic was blocked.
    const uncertain = external && incomplete && (!present || (a.present && a.expectedEntities !== undefined));
    return { ...result(a.id, uncertain ? 'INCONCLUSIVE' : matches ? 'PASS' : 'FAIL', uncertain ? 'insufficient_finding_evidence' : 'expected_finding_presence_and_entities',
      [...matched.flatMap(f => f.evidence), ...(external ? supporting.flatMap(c => c.evidence) : [])]), required: a.required,
      expected: canonical({ ruleId: a.ruleId, present: a.present, ...(a.expectedEntities ? { entities: sorted(a.expectedEntities) } : {}) }),
      observed: canonical({ ruleId: a.ruleId, present, entities }),
      details: uncertain ? { blockingChecks: supporting.filter(c => c.status === 'INCONCLUSIVE' || c.status === 'NOT APPLICABLE').map(c => `${c.id}:${c.reason}`).join(', ') || 'missing_applicable_diagnostic' } : {} };
  }
  const actual = a.kind === 'diagnostic' ? checks.find(c => c.id === a.checkId) : integration.find(c => c.details.target === a.target);
  const matches = actual && actual.status === a.expectedStatus && (a.expectedReason === undefined || actual.reason === a.expectedReason) &&
    Object.entries(a.expectedDetails ?? {}).every(([key, value]) => Object.hasOwn(actual.details, key) && actual.details[key] === value);
  const uncertain = external && actual && ['INCONCLUSIVE', 'NOT APPLICABLE'].includes(actual.status) && a.expectedStatus !== actual.status;
  return { ...result(a.id, !actual || uncertain ? 'INCONCLUSIVE' : matches ? 'PASS' : 'FAIL', !actual ? 'missing_expected_check' : uncertain ? 'insufficient_diagnostic_evidence' : 'expected_diagnostic_or_integration_result', actual?.evidence ?? []), required: a.required,
    expected: canonical({ status: a.expectedStatus, ...(a.expectedReason !== undefined ? { reason: a.expectedReason } : {}), ...(a.expectedDetails ? { details: a.expectedDetails } : {}) }),
    observed: actual ? canonical({ status: actual.status, reason: actual.reason, details: actual.details }) : 'No result' };
}
