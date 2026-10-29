import type { Evidence, Outcome } from '../packages/core/types.ts';

/** Deliberate bug: one handed-off shipment closes the whole order. Synthetic example only. */
export function faultyIntegration(evidence: Evidence): Outcome[] {
  const orders = new Map(evidence.observations.filter(o => o.entityType === 'order').map(o => [`${o.sourceId}/${o.fields.orderId}`, o]));
  return [...orders.values()].map(order => ({ id: `faulty-${order.id}`, sourceId: order.sourceId, orderId: order.fields.orderId,
    completed: evidence.observations.some(o => o.entityType === 'shipment' && o.sourceId === order.sourceId && o.fields.orderId === order.fields.orderId && ['handed_off', 'delivered'].includes(o.fields.milestone)) }));
}
/** Corrects this specific snapshot fixture's bug; not a production integration or revision/reversal engine. */
export function correctedIntegration(evidence: Evidence): Outcome[] {
  const orders = new Map<string, { sourceId: string; orderId: string; remaining: number }>();
  const lines = new Set<string>();
  for (const o of evidence.observations) if (o.entityType === 'order') {
    const f = o.fields;
    if (!f.lineId || f.ordered === undefined || f.canceled === undefined) throw new Error('Example requires normalized line quantities');
    const key = `${o.sourceId}/${f.orderId}`, line = `${key}/${f.lineId}`;
    if (lines.has(line)) throw new Error('Example accepts one revision per order line');
    lines.add(line);
    const unique = new Map<string, number>();
    for (const s of evidence.observations) if (s.entityType === 'shipment' && s.sourceId === o.sourceId && s.fields.orderId === f.orderId && s.fields.lineId === f.lineId && ['handed_off', 'delivered'].includes(s.fields.milestone)) {
      if (s.fields.quantity === undefined) throw new Error('Example requires shipment quantity');
      unique.set(s.fields.shipmentId, s.fields.quantity);
    }
    const shipped = [...unique.values()].reduce((sum, n) => sum + n, 0);
    const order = orders.get(key) ?? { sourceId: o.sourceId, orderId: f.orderId, remaining: 0 };
    order.remaining += Math.max(0, f.ordered - f.canceled - shipped); orders.set(key, order);
  }
  return [...orders.values()].map(o => ({ id: `corrected-${o.orderId}`, sourceId: o.sourceId, orderId: o.orderId, completed: o.remaining === 0 }));
}
