import type { Evidence } from '../packages/core/types.ts';

/** Synthetic paired point-capture example only; not a collector or general mapping engine. */
export function inventoryCapture(input: Evidence, corrected: boolean): Evidence {
  const evidence = structuredClone(input);
  evidence.outcomes = [];
  const policy = evidence.policy.inventory;
  if (!policy) throw new Error('Example requires an inventory policy');
  for (const m of evidence.mappings.filter(m => m.kind === 'inventory')) {
    if (m.aggregation || !m.factor) throw new Error('Example requires a single-location integer mapping');
    for (const target of evidence.observations) if (target.entityType === 'inventory' && target.sourceId === m.toRef.sourceId && target.fields.itemId === m.toRef.entityId) {
      const source = evidence.observations.find(o => o.entityType === 'inventory' && o.sourceId === m.fromRef.sourceId && o.fields.itemId === m.fromRef.entityId && o.observedAt === target.observedAt);
      if (!source || source.entityType !== 'inventory' || source.fields.quantity === undefined) throw new Error('Example requires paired quantities');
      const publish = Math.max(0, source.fields.quantity * m.factor - policy.buffer);
      // Deliberate bug: deduct an extra unit after applying the publication buffer.
      target.fields.quantity = corrected ? publish : Math.max(0, publish - 1);
    }
  }
  return evidence;
}

/** Synthetic delivery example: buggy implementation drops eligible mapped orders. */
export function orderCapture(input: Evidence, corrected: boolean): Evidence {
  const evidence = structuredClone(input);
  evidence.outcomes = [];
  for (const m of evidence.mappings.filter(m => m.kind === 'order')) {
    evidence.observations = evidence.observations.filter(o => !(o.sourceId === m.toRef.sourceId && (o.entityType === 'presence' || o.entityType === 'order') && o.fields.orderId === m.toRef.entityId));
    const eligible = evidence.observations.some(o => o.entityType === 'order' && o.sourceId === m.fromRef.sourceId && o.fields.orderId === m.fromRef.entityId && o.fields.eligible === true);
    if (!corrected || !eligible) continue;
    for (const c of evidence.coverage.filter(c => c.sourceId === m.toRef.sourceId && c.resource === 'orders')) {
      evidence.observations.push({ id: `delivered-${m.id}-${c.id}`, sourceId: m.toRef.sourceId, sourceRecordId: m.toRef.entityId,
        snapshotId: c.snapshotId, observedAt: c.observedAt, entityType: 'presence', fields: { orderId: m.toRef.entityId },
        evidenceRef: 'synthetic:computed-order-delivery', unmappedFields: [] });
    }
  }
  return evidence;
}
