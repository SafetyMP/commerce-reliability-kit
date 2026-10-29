import { VirtualClock, instant } from '../../../packages/core/clock.ts';
import { getScenario, scenarios, sourceFacts } from './fixtures.ts';
import { freezeDeep, identity } from './identity.ts';
import type { AssertionResult, Finding, FixtureEvaluator, Policy, PolicyKey, RunReport, ScenarioId, Variant } from './types.ts';
export { scenarios };
export const RULE_VERSION = 'local-fixtures-1.0.0';
export const PROFILE_VERSION = 'demo-policy-1.0.0';

export function resolvePolicy(id: ScenarioId, overrides: Policy = {}): Policy {
  const defaults = getScenario(id).defaults;
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) throw new Error('Policy must be an object.');
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.hasOwn(defaults, key)) throw new Error(`Policy ${key} does not apply to this scenario.`);
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error(`${key} must be a finite, nonnegative whole number.`);
  }
  return { ...defaults, ...overrides };
}

/** Closed-fixture oracle and example behavior are deliberately separate.
 * No outcome is a function of wall time, randomness, or a network response. */
export function evaluateScenario(id: ScenarioId, variant: Variant, policyOverrides: Policy = {}): RunReport {
  const scenario = getScenario(id);
  if (!scenario.variants.includes(variant)) throw new Error('Unknown example variant.');
  const policy = resolvePolicy(id, policyOverrides);
  const facts = sourceFacts(id, variant);
  const evaluationTime = new VirtualClock(scenario.evaluationTime).now();
  const evidence = [...facts.observations.map(o => o.id), ...facts.coverage.map(c => c.id)];
  const assertions: AssertionResult[] = [], findings: Finding[] = [];
  const metrics: RunReport['metrics'] = {};
  const fullCoverage = facts.coverage.every(c => c.status === 'complete' && c.pagination === 'exhausted');
  const faulty = variant === 'faulty';
  const assertion = (key: string, title: string, expected: string, observed: string, sufficient: boolean, reason: string) => {
    assertions.push({ id: key, title, expected, observed, status: sufficient ? expected === observed ? 'PASS' : 'FAIL' : 'INCONCLUSIVE', reason, evidence });
  };
  const finding = (key: string, title: string, detail: string, severity: Finding['severity'] = 'warning') => {
    findings.push({ id: key, title, detail, severity, evidence });
  };

  if (id === 'partial-shipment' || id === 'duplicate-shipment') {
    const order = facts.observations.find(o => o.entityType === 'order');
    const shipments = facts.observations.filter(o => o.entityType === 'shipment');
    const ordered = order?.entityType === 'order' ? order.fields.ordered ?? null : null;
    const canceled = order?.entityType === 'order' ? order.fields.canceled ?? null : null;
    const unique = [...new Map(shipments.map(s => [`${s.sourceId}/${s.fields.shipmentId}/${s.fields.lineId}`, s])).values()];
    const known = fullCoverage && ordered !== null && canceled !== null && unique.every(s => s.fields.quantity !== undefined);
    const fulfilled = known ? unique.reduce((n, s) => n + s.fields.quantity!, 0) : null;
    const outstanding = fulfilled !== null && ordered !== null && canceled !== null ? Math.max(0, ordered - canceled - fulfilled) : null;
    Object.assign(metrics, { order: order?.entityType === 'order' ? order.fields.orderId : null, ordered, canceled, fulfilled, outstanding,
      eventDeliveries: shipments.length, uniqueShipments: known ? unique.length : null });
    if (id === 'partial-shipment') {
      const expected = outstanding === null ? 'Unknown — incomplete shipment scope' : outstanding > 0 ? 'Partially fulfilled' : 'Complete';
      const observed = faulty ? 'Complete' : expected;
      assertion('fulfillment.state', 'Partial fulfillment state', expected, observed, known,
        !known ? 'Complete shipment coverage is required; exact fulfilled and outstanding quantities are unknown.' : faulty ? 'Outstanding quantity was incorrectly treated as fulfilled.' : 'The completion state preserves two outstanding units.');
      if (known && outstanding! > 0) finding('fulfillment.partial', 'Order is partially fulfilled', `${fulfilled} units handed off; ${outstanding} units remain outstanding.`, 'info');
    } else {
      const expected = fulfilled === null ? 'Unknown — incomplete shipment scope' : `${fulfilled} fulfilled units`;
      const observed = faulty ? `${shipments.reduce((n, s) => n + s.fields.quantity!, 0)} fulfilled units` : expected;
      metrics.exampleFulfilled = faulty ? 9 : fulfilled;
      assertion('shipment.deduplication', 'Shipment event counted once', expected, observed, known,
        !known ? 'Partial shipment coverage cannot establish the exact total.' : faulty ? 'Three deliveries of one shipment were added together, inflating the example output to nine.' : 'Source, shipment and line identity collapse three identical deliveries into one three-unit handoff.');
      if (known) finding('shipment.repeated-delivery', 'Repeated event delivery', 'Three deliveries share DEMO-SHIP-02 / DEMO-L1. The source supports one handoff, not three shipments.', 'info');
    }
  } else if (id === 'normal-delay') {
    const order = facts.observations.find(o => o.entityType === 'order');
    const receipt = facts.observations.find(o => o.entityType === 'presence');
    const released = order?.entityType === 'order' ? order.fields.releasedAt : undefined;
    const delay = released && receipt?.eventTime ? (instant(receipt.eventTime) - instant(released)) / 60000 : null;
    const known = fullCoverage && delay !== null;
    const late = known && delay! > policy.allowanceMinutes!;
    const expected = !known ? 'Unknown — receipt evidence incomplete' : late ? 'Received after allowance' : 'Received within allowance';
    const observed = faulty ? 'Order missing' : expected;
    metrics.delayMinutes = delay;
    assertion('order.synchronization', 'Synchronization allowance respected', expected, observed, known,
      !known ? 'A missing receipt in a partial scope cannot establish order absence or arrival time.' : faulty ? 'The example flags a missing order despite the recorded receipt.' : `${delay}-minute arrival compared with a ${policy.allowanceMinutes}-minute allowance.`);
    if (late) finding('order.late-arrival', 'Order received after allowance', `Arrival took ${delay} minutes; policy allows ${policy.allowanceMinutes}. The order is present, not persistently missing.`);
  } else if (id === 'missing-order') {
    const order = facts.observations.find(o => o.entityType === 'order');
    const release = order?.entityType === 'order' ? order.fields.releasedAt : undefined;
    const age = release ? (instant(evaluationTime) - instant(release)) / 60000 : null;
    const eligible = order?.entityType === 'order' ? order.fields.eligible : undefined;
    const scopes = facts.coverage.filter(c => c.sourceId === 'warehouse');
    const after = release ? scopes.filter(c => (instant(c.observedAt) - instant(release)) / 60000 >= policy.allowanceMinutes!) : [];
    const span = after.length >= 2 ? (instant(after.at(-1)!.observedAt) - instant(after[0]!.observedAt)) / 60000 : null;
    const persistent = fullCoverage && span !== null && span >= 10;
    const withinAllowance = age !== null && age < policy.allowanceMinutes!;
    const known = fullCoverage && eligible === true && (persistent || withinAllowance);
    const expected = persistent ? 'Persistent absence identified' : withinAllowance ? 'Within synchronization allowance' : 'Unknown — insufficient post-allowance observations';
    const observed = faulty ? 'No missing-order diagnosis' : expected;
    Object.assign(metrics, { orderAgeMinutes: age, postAllowanceObservations: after.length, persistenceMinutes: span });
    assertion('order.absence', 'Persistent absence diagnosis', expected, observed, known,
      !known ? 'Need two complete post-allowance observations spanning at least 10 minutes. Unknown is not absence.' : persistent ? faulty ? 'The example missed a supported absence finding.' : 'Persistent absence was correctly identified. A passing assertion does not repair the missing order.' : 'The current policy still allows synchronization time.');
    if (persistent) finding('order.missing', 'Order absent beyond allowed synchronization delay', `DEMO-1044 is absent in two complete warehouse scopes, ${span} minutes apart. Both captures follow the ${policy.allowanceMinutes}-minute allowance.`);
  } else {
    const warehouse = facts.observations.find(o => o.entityType === 'inventory' && o.sourceId === 'warehouse');
    const storefront = facts.observations.find(o => o.entityType === 'inventory' && o.sourceId === 'shop');
    const warehouseQuantity = warehouse?.entityType === 'inventory' ? warehouse.fields.quantity ?? null : null;
    const storefrontQuantity = storefront?.entityType === 'inventory' ? storefront.fields.quantity ?? null : null;
    const age = warehouse ? (instant(evaluationTime) - instant(warehouse.observedAt)) / 60000 : null;
    const stale = id === 'stale-evidence' && (age === null || age > policy.freshnessMinutes!);
    const known = fullCoverage && warehouseQuantity !== null && storefrontQuantity !== null && !stale;
    const expectedQuantity = known ? Math.max(0, warehouseQuantity! - (policy.buffer ?? 0)) : null;
    const mismatch = known && expectedQuantity !== storefrontQuantity;
    Object.assign(metrics, { capturedWarehouseQuantity: warehouseQuantity, storefrontQuantity, warehouseAgeMinutes: age,
      comparableWarehouseQuantity: known ? warehouseQuantity : null, expectedPublished: expectedQuantity });
    if (id === 'inventory-buffer') {
      const expected = expectedQuantity === null ? 'Unknown — warehouse quantity missing' : `${expectedQuantity} expected published units; ${mismatch ? 'mismatch' : 'no mismatch'}`;
      const observed = faulty ? `${warehouseQuantity} expected published units; mismatch` : expected;
      assertion('inventory.publication', 'Publication buffer applied', expected, observed, known,
        !known ? 'A missing net sellable quantity is unknown, never zero.' : faulty ? 'The example ignores the approved buffer when predicting publication.' : `max(0, ${warehouseQuantity} − ${policy.buffer}) = ${expectedQuantity}; storefront reports ${storefrontQuantity}.`);
    } else {
      const expected = !known ? 'Unknown — current inventory comparison unavailable' : mismatch ? 'Inventory mismatch' : 'Quantities match under selected freshness policy';
      const observed = faulty ? 'Current inventory confirmed equal' : expected;
      assertion('inventory.freshness', 'Fresh evidence required for comparison', expected, observed, known,
        warehouseQuantity === null ? 'Warehouse quantity is missing; zero cannot be substituted.' : stale ? `Warehouse evidence is ${age} minutes old, exceeding the ${policy.freshnessMinutes}-minute limit. ${faulty ? 'The faulty example claims current equality without sufficient evidence.' : 'Corrected behavior recognizes uncertainty; the inventory assertion stays INCONCLUSIVE.'}` : `The ${age}-minute-old capture is accepted by the ${policy.freshnessMinutes}-minute policy. This does not make it a current physical count.`);
      if (stale) finding('observation.stale', 'Warehouse evidence is stale', `Capture age: ${age} minutes. Freshness limit: ${policy.freshnessMinutes} minutes. Current comparable inventory remains unknown.`);
    }
    if (mismatch) finding('inventory.mismatch', 'Published quantity differs from policy', `Expected ${expectedQuantity} each; storefront reports ${storefrontQuantity} each. This is a publication mismatch, not a physical stock conclusion.`);
  }
  return freezeDeep(structuredClone({
    schemaVersion: 'demo-report-1', scenarioId: id, scenarioName: scenario.title, scenarioVersion: '1.0.0',
    variant, runMode: 'Local synthetic example', ruleVersion: RULE_VERSION, profileVersion: PROFILE_VERSION,
    evaluationTime, policy, ...facts, findings, assertions, metrics,
    evidenceIdentity: identity(facts), policyIdentity: identity(policy),
    limitations: [
      'Synthetic demo · No connected accounts',
      'A six-fixture local evaluator produced this report, not the full Commerce Reliability Kit engine. No production integration has been tested.',
      'Matching records does not establish physical stock accuracy. Completeness and mappings are synthetic declarations.',
      'Operational findings describe supported source facts. Assertion verdicts judge the selected example output against the fixture expectation.',
      ...scenario.limitations,
      ...(variant === 'insufficient' ? ['This variant changes the evidence: a scope is partial or a required quantity is missing.'] : []),
    ],
  } as RunReport));
}
export const localFixtureEvaluator: FixtureEvaluator = { evaluate: evaluateScenario };

export const policyLabels: Record<PolicyKey, string> = {
  buffer: 'Publication buffer (units)', allowanceMinutes: 'Synchronization allowance (minutes)', freshnessMinutes: 'Freshness limit (minutes)',
};
