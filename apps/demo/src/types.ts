import type { Coverage, Observation, Status } from '../../../packages/core/types.ts';
export type { Coverage, Observation, Status };
export type ScenarioId = 'partial-shipment' | 'normal-delay' | 'missing-order' | 'inventory-buffer' | 'stale-evidence' | 'duplicate-shipment';
export type Variant = 'faulty' | 'corrected' | 'insufficient';
export type Category = 'Orders' | 'Fulfillment' | 'Inventory' | 'Data coverage';
export type PolicyKey = 'buffer' | 'allowanceMinutes' | 'freshnessMinutes';
export type Policy = Partial<Record<PolicyKey, number>>;
export interface Scenario {
  id: ScenarioId; title: string; category: Category; description: string; behavior: string;
  initialConditions: string; expectedBehavior: string; evidenceRequired: string; limitations: string[];
  variants: Variant[]; defaults: Policy; evaluationTime: string;
}
export interface SourceFacts { observations: Observation[]; coverage: Coverage[] }
export interface Finding { id: string; severity: 'info' | 'warning'; title: string; detail: string; evidence: string[] }
export interface AssertionResult {
  id: string; title: string; status: Status; expected: string; observed: string; reason: string; evidence: string[];
}
export interface RunReport extends SourceFacts {
  schemaVersion: 'demo-report-1'; scenarioId: ScenarioId; scenarioName: string; scenarioVersion: string;
  variant: Variant; runMode: 'Local synthetic example'; ruleVersion: string; profileVersion: string;
  evaluationTime: string; policy: Policy; findings: Finding[]; assertions: AssertionResult[];
  metrics: Record<string, number | string | boolean | null>; evidenceIdentity: string; policyIdentity: string; limitations: string[];
}
export interface FixtureEvaluator { evaluate(id: ScenarioId, variant: Variant, policy?: Policy): RunReport }
export interface SavedRun { sequence: number; report: RunReport }
