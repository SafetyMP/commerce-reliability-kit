import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import { evaluate, validateEvidence, validateOutcome } from '../packages/core/index.ts';
import type { Evidence, OrderObservation, ShipmentObservation } from '../packages/core/types.ts';
import { fixture } from './helpers.ts';

const ajv = new Ajv({ strict: true, allowUnionTypes: true });
addFormats.default(ajv);
const portableEvidence = ajv.compile(JSON.parse(readFileSync('schemas/evidence.schema.json', 'utf8')));
const portableOutcome = ajv.compile(JSON.parse(readFileSync('schemas/outcome.schema.json', 'utf8')));

test('portable schema and runtime reject slash delimiters in normalized identity components', () => {
  const mutations: ((e: Evidence) => void)[] = [
    e => { e.sources[0]!.id = 'shop/branch'; },
    e => { e.coverage[0]!.sourceId = 'shop/branch'; },
    e => { e.coverage[0]!.scope.locations = ['main/annex']; },
    e => { (e.observations[0] as OrderObservation).fields.orderId = 'A/L1'; },
    e => { (e.observations[0] as OrderObservation).fields.lineId = 'A/L1'; },
    e => { (e.observations[1] as ShipmentObservation).fields.shipmentId = 'S1/L1'; },
    e => { (e.observations[1] as ShipmentObservation).fields.lineId = 'L1/part'; },
    e => { (e.observations[1] as ShipmentObservation).fields.reversalOf = 'S1/L1'; },
    e => { e.outcomes[0]!.orderId = 'A/L1'; },
    e => { e.outcomes[0]!.sourceId = 'shop/branch'; }
  ];
  for (const mutate of mutations) {
    const e = fixture('partial-shipment').evidence; mutate(e);
    assert.equal(portableEvidence(e), false);
    assert.throws(() => validateEvidence(e), /Invalid evidence contract/);
  }
  for (const field of ['sourceId', 'entityId', 'locationId'] as const) {
    const e = fixture('missing-order').evidence; e.mappings[0]!.toRef[field] = 'a/b';
    assert.equal(portableEvidence(e), false); assert.throws(() => validateEvidence(e));
  }
  for (const outcome of [
    { id: 'left', sourceId: 'shop/branch', orderId: 'A', completed: false },
    { id: 'right', sourceId: 'shop', orderId: 'branch/A', completed: true }
  ]) {
    assert.equal(portableOutcome(outcome), false); assert.throws(() => validateOutcome(outcome));
  }
});

test('adversarial shipment and line collision is rejected, not deduplicated or allocated', () => {
  const s = fixture('partial-shipment');
  const order = s.evidence.observations[0] as OrderObservation;
  order.fields.lineId = 'L1/L2';
  s.evidence.observations.push({ ...order, id: 'second-line', fields: { ...order.fields, lineId: 'L2' } });
  const first = s.evidence.observations[1] as ShipmentObservation, second = s.evidence.observations[2] as ShipmentObservation;
  first.fields.shipmentId = 'S1'; first.fields.lineId = 'L1/L2';
  second.fields.shipmentId = 'S1/L1'; second.fields.lineId = 'L2';
  assert.equal(`${first.fields.shipmentId}/${first.fields.lineId}`, `${second.fields.shipmentId}/${second.fields.lineId}`);
  assert.equal(portableEvidence(s.evidence), false); assert.throws(() => evaluate(s));
});

test('valid distinct shipments remain distinct and exact repeated identities deduplicate', () => {
  const s = fixture('partial-shipment');
  assert.equal(portableEvidence(s.evidence), true);
  const total = () => evaluate(s).checks.find(c => c.id === 'fulfillment.quantities:shop/A')!.details.shipped;
  assert.equal(total(), 4);
  (s.evidence.observations[2] as ShipmentObservation).fields.shipmentId = 'S1-part';
  assert.equal(total(), 8);
});
