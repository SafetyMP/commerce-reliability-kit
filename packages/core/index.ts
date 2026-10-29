import { scenarioAssertion } from './assertions.ts';
import { Context, result, RULE_VERSION } from './context.ts';
import { VirtualClock } from './clock.ts';
import { fulfillment, freshness, inventory, orderPresence } from './rules.ts';
import { canonical, hash, validateEvidence, validateOutcome, validateReport, validateScenario } from './validation.ts';
import type { Counts, Evidence, Outcome, Report, Result, Scenario } from './types.ts';
export { VirtualClock } from './clock.ts';
export { validateEvidence, validateOutcome, validateReport, validateScenario, parseJSON, readJSON } from './validation.ts';
export type * from './types.ts';
export { importCapture, normalizeObservation, csvObservations } from '../importers/index.ts';
export { compareReports } from '../report/compare.ts';
export { renderHTML, renderJUnit } from '../report/index.ts';

export interface EvaluateOptions {
  mode?: 'demo' | 'assert' | 'analyze'; evaluationTime?: string; observed?: Outcome[]; observedEvidence?: Evidence; reproductionCommand?: string;
}
export function counts(results: Result[]): Counts {
  const c: Counts = { total: results.length, required: 0, PASS: 0, FAIL: 0, INCONCLUSIVE: 0, 'NOT APPLICABLE': 0 };
  for (const r of results) { c[r.status]++; if (r.required) c.required++; }
  return c;
}
export function exitCode(results: Result[]): number {
  const required = results.filter(r => r.required);
  if (required.some(r => r.status === 'FAIL')) return 1;
  if (!required.length || required.some(r => r.status !== 'PASS')) return 2;
  return 0;
}
/** Pure, synchronous, offline evaluation. Evidence-only calls require an explicit evaluationTime. */
export function evaluate(input: Scenario | Evidence, options: EvaluateOptions = {}): Report {
  const scenario = 'evidence' in input ? input : undefined;
  if (scenario) validateScenario(scenario); else validateEvidence(input);
  let original = scenario ? scenario.evidence : input as Evidence;
  const mode = options.mode ?? (scenario ? 'demo' : 'analyze');
  if (mode === 'assert' && !scenario) throw new Error('Assertion mode requires a scenario');
  if (options.observed !== undefined && mode !== 'assert') throw new Error('External outcomes require assertion mode');
  if (options.observedEvidence !== undefined) {
    if (mode !== 'assert') throw new Error('External observations require assertion mode');
    validateEvidence(options.observedEvidence);
    if (hash(options.observedEvidence.policy) !== hash(original.policy)) throw new Error('External evidence must preserve the scenario policy');
    for (const source of options.observedEvidence.sources) {
      const declared = original.sources.find(s => s.id === source.id);
      if (declared && declared.account !== source.account) throw new Error('External evidence must preserve scenario source account bindings');
    }
    original = options.observedEvidence;
  }
  const at = options.evaluationTime ?? scenario?.evaluationTime;
  if (!at) throw new Error('Explicit evaluation time is required');
  const clock = new VirtualClock(at);
  if (mode === 'assert' && options.observedEvidence !== undefined && options.observed !== undefined && original.outcomes.length) {
    throw new Error('Choose bundle outcomes or separate observed outcomes; bundle outcomes must be empty when observed is supplied');
  }
  const outcomes = mode === 'assert' ? (options.observed !== undefined ? options.observed : options.observedEvidence !== undefined ? original.outcomes : []) : original.outcomes;
  for (const o of outcomes) validateOutcome(o);
  const evidence: Evidence = { ...original, outcomes };
  validateEvidence(evidence);
  const ctx = new Context(evidence, clock.now());
  const rules = { 'observation.freshness': freshness, 'order.presence': orderPresence, 'fulfillment.quantities': fulfillment, 'inventory.available': inventory };
  const outputs = [...evidence.policy.checks].sort().map(name => rules[name](ctx));
  const checks = outputs.flatMap(o => o.checks).sort((a, b) => a.id.localeCompare(b.id));
  const findings = outputs.flatMap(o => o.findings).sort((a, b) => canonical(a).localeCompare(canonical(b)));
  const integrationAssertions: Result[] = [];
  for (const a of scenario?.integrationAssertions ?? []) {
    const check = checks.find(c => c.id === 'fulfillment.quantities:' + a.target);
    const supplied = outcomes.filter(o => `${o.sourceId}/${o.orderId}` === a.target);
    const observed = new Set(supplied.map(o => o.completed));
    let status: Result['status'] = 'INCONCLUSIVE', reason = 'missing_external_outcome';
    if (observed.size > 1) reason = 'conflicting_external_outcomes';
    else if (observed.size === 1) {
      if (!check || check.status === 'INCONCLUSIVE' || check.status === 'NOT APPLICABLE' || typeof check.details.completed !== 'boolean') reason = 'insufficient_fulfillment_evidence';
      else {
        const completed = supplied[0]!.completed;
        status = completed === a.expectedCompleted && completed === check.details.completed ? 'PASS' : 'FAIL';
        reason = status === 'PASS' ? 'completion_matches_obligation' : 'completion_contradicts_obligation_or_expectation';
      }
    }
    integrationAssertions.push({ ...result(a.id, status, reason, [...(check?.evidence ?? []), ...supplied.map(o => o.id)]), required: a.required,
      expected: `completed=${a.expectedCompleted}`, observed: supplied.length ? [...observed].map(v => `completed=${v}`).join(', ') : 'No outcome supplied', details: { target: a.target } });
  }
  const external = mode === 'assert' && options.observedEvidence !== undefined;
  let assertions: Result[] = [];
  if (mode === 'demo' && scenario) {
    assertions = scenario.assertions.map(a => scenarioAssertion(a, checks, findings, integrationAssertions, false));
  } else if (mode === 'assert') {
    assertions = [
      ...(external ? scenario!.assertions.filter(a => a.kind !== 'integration-status').map(a => scenarioAssertion(a, checks, findings, integrationAssertions, true)) : []),
      ...integrationAssertions
    ];
    if (!assertions.length) assertions.push(result('external.assertions', 'INCONCLUSIVE', external ? 'no_applicable_assertions_declared' : 'no_integration_assertions_declared', []));
  }
  const report: Report = {
    schemaVersion: '1.1.0',
    manifest: { toolVersion: '0.1.0', schemaVersion: '1.1.0', scenarioId: scenario?.id ?? 'capture', scenarioVersion: scenario?.version ?? '1.0.0', ruleVersion: RULE_VERSION, importerVersion: 'normalized-1.1.0', profileVersion: evidence.policy.version, mappingVersions: [...new Set(evidence.mappings.map(m => m.version))].sort(), inputHash: hash({ evidence, scenario: scenario ? { ...scenario, evidence: undefined } : null }), policyHash: hash(evidence.policy), evaluationTime: clock.now(), mode, reproductionCommand: options.reproductionCommand ?? 'Re-evaluate the same normalized inputs with the manifest evaluationTime and mode.' },
    findings, checks, assertions, integrationAssertions,
    summary: { diagnostics: counts(checks), assertions: counts(assertions), integrationAssertions: counts(integrationAssertions), coverage: { total: evidence.coverage.length, complete: evidence.coverage.filter(c => c.status === 'complete' && c.pagination === 'exhausted').length, declared: evidence.coverage.length }, exitCode: mode === 'analyze' ? (checks.length && checks.every(c => c.status !== 'INCONCLUSIVE') ? 0 : 2) : exitCode(assertions) },
    sources: [...evidence.sources].sort((a, b) => a.id.localeCompare(b.id)), policy: evidence.policy, outcomes: [...outcomes].sort((a, b) => a.id.localeCompare(b.id)),
    coverage: [...evidence.coverage].sort((a, b) => a.id.localeCompare(b.id)), observations: ctx.observations, transformations: [...evidence.mappings].sort((a, b) => a.id.localeCompare(b.id)),
    assumptions: scenario?.assumptions ?? ['Coverage and mapping declarations are supplied by the caller.'],
    limitations: [...(scenario?.doesNotEstablish ?? []), 'No provider validation, physical-stock conclusion, or general reliability certification.', 'V0.1 requires declared point captures (captureInterval start=end=observedAt) for freshness, absence and quantity conclusions. Missing, unknown or non-atomic intervals remain INCONCLUSIVE; completion/ingestion times cannot refresh earlier evidence.', 'Facility aggregation depends on declared nonoverlap; deadlines require explicit milestone times. No business calendar, bundles, live collectors or automatic corrections.']
  };
  validateReport(report);
  // A report is an evidence snapshot: later caller edits must not rewrite a previous run.
  return structuredClone(report);
}
