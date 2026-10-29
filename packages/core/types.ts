export type Status = 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'NOT APPLICABLE';
export type Resource = 'orders' | 'shipments' | 'inventory';
export type CheckName = 'order.presence' | 'fulfillment.quantities' | 'inventory.available' | 'observation.freshness';
export interface Source { id: string; account: string; provider: string; apiVersion: string }
/** Inclusive capture boundaries. Null or absent interval means unknown, never a point capture. */
export interface CaptureInterval { version: '1.0.0'; start: string | null; end: string | null }
export interface Coverage {
  id: string; sourceId: string; resource: Resource;
  scope: { account: string; locations: string[]; filter: string };
  snapshotId: string; observedAt: string; status: 'complete' | 'partial' | 'unknown' | 'failed';
  captureInterval?: CaptureInterval;
  pagination: 'exhausted' | 'remaining' | 'unknown'; completenessBasis: 'importer-declared' | 'user-declared'; limitations: string[];
}
export interface OrderFields { orderId: string; lineId?: string; productId?: string; ordered?: number; canceled?: number; eligible?: boolean; releasedAt?: string }
export interface ShipmentFields { shipmentId: string; orderId: string; lineId?: string; quantity?: number; milestone: 'label' | 'handed_off' | 'delivered' | 'voided'; milestoneTime?: string; reversalOf?: string }
export interface InventoryFields { itemId: string; locationId: string; quantity?: number; unit: string; semantics: 'net_available' | 'available_to_sell' | 'on_hand' | 'unknown'; stockScope: string }
export interface ObservationBase {
  id: string; sourceId: string; sourceRecordId: string; snapshotId: string; observedAt: string;
  eventTime?: string; updatedTime?: string; ingestedAt?: string; evidenceRef: string; unmappedFields: string[];
}
export type Observation = ObservationBase & (
  { entityType: 'order'; fields: OrderFields } | { entityType: 'presence'; fields: { orderId: string } } |
  { entityType: 'shipment'; fields: ShipmentFields } | { entityType: 'inventory'; fields: InventoryFields }
);
export type OrderObservation = Observation & { entityType: 'order' };
export type ShipmentObservation = Observation & { entityType: 'shipment' };
export type InventoryObservation = Observation & { entityType: 'inventory' };
export interface EntityRef { sourceId: string; account: string; entityId: string; locationId?: string }
export interface Mapping {
  id: string; version: string; kind: 'order' | 'inventory'; validFrom: string; validTo?: string; ambiguous: boolean;
  fromRef: EntityRef; toRef: EntityRef; factor?: number; fromUnit?: string; toUnit?: string; stockScope?: string;
  aggregation?: { locations: string[]; nonOverlapping: boolean };
}
export interface Outcome { id: string; sourceId: string; orderId: string; completed: boolean }
export interface Policy {
  version: string; checks: CheckName[]; synchronizationAllowanceMs: number; persistenceMs: number;
  freshness: { sourceId: string; resource: Resource; cadenceMs: number | null; freshnessLimitMs: number | null }[];
  inventory?: { mode: 'net' | 'fixed-buffer'; buffer: number; tolerance: number; maxAlignmentMs: number; floorAtZero: true };
  deadlines?: { sourceId: string; orderId: string; at: string; milestone: 'handed_off' | 'delivered' }[];
}
export interface Evidence { schemaVersion: '1.1.0'; sources: Source[]; coverage: Coverage[]; observations: Observation[]; mappings: Mapping[]; outcomes: Outcome[]; policy: Policy }
export interface MetaAssertion { id: string; kind: 'diagnostic' | 'finding' | 'integration-status'; required: boolean; checkId?: string; ruleId?: string; target?: string; expectedStatus?: Status; present?: boolean; expectedReason?: string; expectedDetails?: Record<string, string | number | boolean>; expectedEntities?: string[] }
export interface IntegrationAssertion { id: string; target: string; expectedCompleted: boolean; required: boolean }
export interface Scenario {
  schemaVersion: '1.1.0'; id: string; version: string; purpose: string; initialConditions: string; inputOrder: 'ordered' | 'unordered';
  requiredCapabilities: CheckName[]; assumptions: string[]; provenance: { kind: 'synthetic'; license: string; references: string[] };
  doesNotEstablish: string[]; evaluationTime: string; evidence: Evidence; assertions: MetaAssertion[]; integrationAssertions?: IntegrationAssertion[];
}
export interface Finding {
  ruleId: string; ruleVersion: string; evidence: string[]; entities: string[]; severity: 'info' | 'warning' | 'error';
  interpretation: string; uncertainty: string[]; blockingPrerequisites: string[];
}
export interface Result {
  id: string; status: Status; required: boolean; reason: string; evidence: string[];
  expected: string; observed: string; details: Record<string, string | number | boolean>;
}
export interface Counts { total: number; required: number; PASS: number; FAIL: number; INCONCLUSIVE: number; 'NOT APPLICABLE': number }
export interface Report {
  schemaVersion: '1.1.0';
  manifest: { toolVersion: string; schemaVersion: string; scenarioId: string; scenarioVersion: string; ruleVersion: string; importerVersion: string; profileVersion: string; mappingVersions: string[]; inputHash: string; policyHash: string; evaluationTime: string; mode: 'demo' | 'assert' | 'analyze'; reproductionCommand: string };
  findings: Finding[]; checks: Result[]; assertions: Result[]; integrationAssertions: Result[];
  summary: { diagnostics: Counts; assertions: Counts; integrationAssertions: Counts; coverage: { total: number; complete: number; declared: number }; exitCode: number };
  sources: Source[]; policy: Policy; outcomes: Outcome[];
  coverage: Coverage[]; observations: Observation[]; transformations: Mapping[]; assumptions: string[]; limitations: string[];
}
