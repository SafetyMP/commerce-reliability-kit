import { instant } from './clock.ts';
import { Context, finding, keyOf, resolveRevision, result, sorted } from './context.ts';
import { canonical } from './validation.ts';
import type { Coverage, Finding, InventoryObservation, OrderObservation, Result, ShipmentObservation } from './types.ts';

export interface RuleOutput { checks: Result[]; findings: Finding[] }
const empty = (): RuleOutput => ({ checks: [], findings: [] });
function groups<T>(values: T[], key: (value: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) { const k = key(value), group = grouped.get(k) ?? []; group.push(value); grouped.set(k, group); }
  return grouped;
}
export function freshness(ctx: Context): RuleOutput {
  const out = empty();
  const required = new Map(ctx.evidence.policy.freshness.map(f => [`${f.sourceId}/${f.resource}`, f]));
  for (const c of ctx.evidence.coverage) required.set(`${c.sourceId}/${c.resource}`, { sourceId: c.sourceId, resource: c.resource, cadenceMs: null, freshnessLimitMs: null });
  for (const [key, f] of [...required].sort(([a], [b]) => a.localeCompare(b))) {
    const scopes = groups(ctx.coverages(f.sourceId, f.resource), c => canonical(c.scope));
    if (!scopes.size) out.checks.push(result(`observation.freshness:${key}`, 'INCONCLUSIVE', 'missing_coverage', []));
    for (const [scope, records] of scopes) {
      const latest = records[records.length - 1]!;
      const simultaneous = records.filter(c => instant(c.observedAt) === instant(latest.observedAt));
      const reason = simultaneous.map(c => ctx.freshness(c)).find(Boolean);
      const status = reason === 'stale_evidence' ? 'FAIL' : reason ? 'INCONCLUSIVE' : 'PASS';
      const entity = key + '/' + latest.scope.locations.join('/') + '/' + latest.scope.filter;
      out.checks.push(result(`observation.freshness:${entity}`, status, reason ?? 'fresh', simultaneous.map(c => c.id), { ...(latest.captureInterval?.start ? { ageMs: ctx.now - instant(latest.captureInterval.start) } : {}), scope }));
      if (reason === 'stale_evidence') out.findings.push(finding('observation.stale', simultaneous.map(c => c.id), [entity], 'Required resource observation exceeds its explicit freshness limit.'));
    }
  }
  return out;
}
export function orderPresence(ctx: Context): RuleOutput {
  const out = empty();
  const orders = groups(ctx.observations.filter((o): o is OrderObservation => o.entityType === 'order'), o => keyOf(o.sourceId, o.fields.orderId));
  // Declared subjects remain in the denominator even when their source rows are absent.
  for (const m of ctx.evidence.mappings.filter(m => m.kind === 'order')) {
    const key = keyOf(m.fromRef.sourceId, m.fromRef.entityId);
    if (!orders.has(key)) orders.set(key, []);
  }
  if (!orders.size) out.checks.push(result('order.presence', 'INCONCLUSIVE', 'missing_source_orders', []));
  for (const [key, revisions] of orders) {
    const id = 'order.presence:' + key, ids = revisions.map(o => o.id);
    if (!revisions.length) {
      out.checks.push(result(id, 'INCONCLUSIVE', 'missing_source_order', ctx.coverages(key.split('/')[0]!, 'orders').map(c => c.id)));
      continue;
    }
    const sourceScope = ctx.current(revisions[0]!.sourceId, 'orders');
    if (!sourceScope.coverage || sourceScope.reason) { out.checks.push(result(id, 'INCONCLUSIVE', sourceScope.reason ?? 'missing_coverage', ids)); continue; }
    const currentRows = ctx.records(sourceScope.coverage).filter((o): o is OrderObservation => o.entityType === 'order' && o.fields.orderId === revisions[0]!.fields.orderId);
    const lines = [...groups(currentRows, o => o.fields.lineId ?? '').values()].map(resolveRevision);
    const order = lines[0]?.value;
    let issue = lines.find(l => l.reason)?.reason;
    if (!order || issue) { out.checks.push(result(id, 'INCONCLUSIVE', issue ?? 'missing_order', ids)); continue; }
    if (lines.some(l => l.value?.fields.eligible !== order.fields.eligible || l.value?.fields.releasedAt !== order.fields.releasedAt)) issue = 'contradictory_eligibility';
    issue ??= lines.map(l => l.value ? ctx.temporal(l.value) : undefined).find(Boolean) ?? ctx.usable(ctx.snapshot(order));
    if (issue) { out.checks.push(result(id, 'INCONCLUSIVE', issue, ids)); continue; }
    if (order.fields.eligible === false) { out.checks.push(result(id, 'NOT APPLICABLE', 'explicitly_ineligible', ids)); continue; }
    if (order.fields.eligible === undefined || !order.fields.releasedAt) { out.checks.push(result(id, 'INCONCLUSIVE', 'unknown_eligibility_or_release_time', ids)); continue; }
    const released = instant(order.fields.releasedAt);
    if (released > ctx.now) { out.checks.push(result(id, 'INCONCLUSIVE', 'future_release', ids)); continue; }
    const maps = ctx.evidence.mappings.filter(m => m.kind === 'order' && m.fromRef.sourceId === order.sourceId && m.fromRef.entityId === order.fields.orderId);
    const m = maps[0];
    if (maps.length !== 1 || !m || ctx.mappingIssue(m)) { out.checks.push(result(id, 'INCONCLUSIVE', m ? ctx.mappingIssue(m) ?? 'conflicting_mapping' : 'missing_mapping', ids)); continue; }
    if (!m.toRef.locationId) { out.checks.push(result(id, 'INCONCLUSIVE', 'missing_destination_scope', ids)); continue; }
    const current = ctx.current(m.toRef.sourceId, 'orders', m.toRef.locationId);
    if (!current.coverage || current.reason) { out.checks.push(result(id, 'INCONCLUSIVE', current.reason ?? 'missing_coverage', [...ids, ...(current.coverage ? [current.coverage.id] : [])])); continue; }
    const allowance = ctx.evidence.policy.synchronizationAllowanceMs;
    if (ctx.now - released < allowance) { out.checks.push(result(id, 'PASS', 'within_allowance', [...ids, current.coverage.id], { ageMs: ctx.now - released, allowanceMs: allowance, searchedScope: canonical(current.coverage.scope) })); continue; }
    let run: Coverage[] = [], latestPresent = false, lastIssue: string | undefined;
    const snapshots = ctx.coverages(m.toRef.sourceId, 'orders').filter(c => c.scope.locations.includes(m.toRef.locationId!));
    // Equal instants form a single observation; one partial/failed snapshot blocks the entire instant.
    for (const atTime of groups(snapshots, c => String(instant(c.observedAt))).values()) {
      const c = atTime[0]!;
      lastIssue = ctx.simultaneousIssue(atTime) ?? atTime.map(x => ctx.mappingIssue(m, instant(x.observedAt))).find(Boolean);
      const rows = atTime.flatMap(x => ctx.records(x));
      lastIssue ??= rows.map(o => ctx.temporal(o)).find(Boolean);
      latestPresent = rows.some(o => (o.entityType === 'presence' || o.entityType === 'order') && o.fields.orderId === m.toRef.entityId);
      if (lastIssue || latestPresent || instant(c.observedAt) - released < allowance) { run = []; continue; }
      run.push(c);
    }
    const evidence = [...ids, ...run.map(c => c.id), current.coverage.id];
    if (lastIssue) out.checks.push(result(id, 'INCONCLUSIVE', lastIssue, evidence));
    else if (latestPresent) out.checks.push(result(id, 'PASS', 'destination_present', [...evidence, ...ctx.records(current.coverage).filter(o => (o.entityType === 'order' || o.entityType === 'presence') && o.fields.orderId === m.toRef.entityId).map(o => o.id)]));
    else if (run.length >= 2 && instant(run[run.length - 1]!.observedAt) - instant(run[0]!.observedAt) >= ctx.evidence.policy.persistenceMs) {
      out.checks.push(result(id, 'FAIL', 'persistent_absence', evidence, { searchedScope: canonical(current.coverage.scope) }));
      out.findings.push(finding('order.missing', evidence, [key, keyOf(m.toRef.sourceId, m.toRef.entityId)], 'Eligible order remains absent in distinct complete post-allowance snapshots spanning the persistence interval. Searched scope: ' + canonical(current.coverage.scope)));
    } else out.checks.push(result(id, 'INCONCLUSIVE', 'insufficient_persistence', evidence));
  }
  return out;
}

export function fulfillment(ctx: Context): RuleOutput {
  const out = empty();
  const orders = groups(ctx.observations.filter((o): o is OrderObservation => o.entityType === 'order'), o => keyOf(o.sourceId, o.fields.orderId));
  for (const subject of [...ctx.observations.filter(o => o.entityType === 'shipment').map(o => ({ sourceId: o.sourceId, orderId: o.fields.orderId })), ...(ctx.evidence.policy.deadlines ?? [])]) {
    const key = keyOf(subject.sourceId, subject.orderId);
    if (!orders.has(key)) orders.set(key, []);
  }
  if (!orders.size) out.checks.push(result('fulfillment.quantities', 'INCONCLUSIVE', 'missing_source_orders', []));
  for (const [key, allOrders] of orders) {
    if (!allOrders.length) {
      const source = key.split('/')[0]!;
      const evidence = ctx.observations.filter(o => o.entityType === 'shipment' && keyOf(o.sourceId, o.fields.orderId) === key).map(o => o.id);
      out.checks.push(result('fulfillment.quantities:' + key, 'INCONCLUSIVE', 'missing_source_order', [...evidence, ...ctx.coverages(source, 'orders').map(c => c.id)]));
      continue;
    }
    const source = allOrders[0]!.sourceId, orderId = allOrders[0]!.fields.orderId, id = 'fulfillment.quantities:' + key;
    const orderScope = ctx.current(source, 'orders'), shipmentScope = ctx.current(source, 'shipments');
    const evidence = [...allOrders.map(o => o.id), ...[orderScope.coverage, shipmentScope.coverage].filter(c => c !== undefined).map(c => c.id)];
    let issue = orderScope.reason ?? shipmentScope.reason;
    if (!orderScope.coverage || !shipmentScope.coverage || issue) { out.checks.push(result(id, 'INCONCLUSIVE', issue ?? 'missing_coverage', evidence)); continue; }
    if (canonical(sorted(orderScope.coverage.scope.locations)) !== canonical(sorted(shipmentScope.coverage.scope.locations))) {
      out.checks.push(result(id, 'INCONCLUSIVE', 'incompatible_resource_scopes', evidence)); continue;
    }
    const orderLines = groups(ctx.records(orderScope.coverage).filter((o): o is OrderObservation => o.entityType === 'order' && o.fields.orderId === orderId), o => o.fields.lineId ?? '');
    if (!orderLines.size || orderLines.has('')) issue = 'ambiguous_line_allocation';
    const obligations = new Map<string, number>();
    for (const [line, revisions] of orderLines) {
      const selected = resolveRevision(revisions); issue ??= selected.reason;
      const o = selected.value;
      if (!o) continue;
      issue ??= ctx.temporal(o);
      if (o.fields.ordered === undefined || o.fields.canceled === undefined || o.fields.canceled > o.fields.ordered) { issue ??= 'unknown_or_invalid_quantities'; continue; }
      obligations.set(line, o.fields.ordered - o.fields.canceled);
    }
    const shipments = ctx.records(shipmentScope.coverage).filter((o): o is ShipmentObservation => o.entityType === 'shipment' && o.fields.orderId === orderId);
    evidence.push(...shipments.map(o => o.id));
    const unique = new Map<string, ShipmentObservation>();
    for (const [shipmentKey, revisions] of groups(shipments, o => `${o.fields.shipmentId}/${o.fields.lineId ?? ''}`)) {
      const selected = resolveRevision(revisions); issue ??= selected.reason;
      if (selected.value) { unique.set(shipmentKey, selected.value); issue ??= ctx.temporal(selected.value); }
    }
    const reversed = new Set<string>();
    for (const o of unique.values()) if (o.fields.milestone === 'voided') {
      const priorKey = `${o.fields.reversalOf ?? ''}/${o.fields.lineId ?? ''}`;
      const prior = unique.get(priorKey);
      // A same-ID void can reference the prior revision in this complete snapshot.
      const previous = prior === o ? resolveRevision(shipments.filter(s => s.fields.shipmentId === o.fields.reversalOf && s.fields.lineId === o.fields.lineId && (s.updatedTime ?? s.eventTime) && (o.updatedTime ?? o.eventTime) && instant((s.updatedTime ?? s.eventTime)!) < instant((o.updatedTime ?? o.eventTime)!))).value : prior;
      if (!o.fields.reversalOf || !previous || o.fields.quantity !== previous.fields.quantity || !['handed_off', 'delivered'].includes(previous.fields.milestone) || !(o.updatedTime ?? o.eventTime) || !(previous.updatedTime ?? previous.eventTime) || instant((o.updatedTime ?? o.eventTime)!) <= instant((previous.updatedTime ?? previous.eventTime)!)) issue ??= 'unsupported_reversal';
      else reversed.add(priorKey);
    }
    const shippedByLine = new Map<string, number>();
    for (const [shipmentKey, o] of unique) {
      const f = o.fields;
      if (!f.lineId || !obligations.has(f.lineId) || f.quantity === undefined) { issue ??= 'ambiguous_line_allocation_or_quantity'; continue; }
      if (!['handed_off', 'delivered'].includes(f.milestone) || reversed.has(shipmentKey)) continue;
      const sum = (shippedByLine.get(f.lineId) ?? 0) + f.quantity;
      if (!Number.isSafeInteger(sum)) issue ??= 'unsafe_arithmetic';
      shippedByLine.set(f.lineId, sum);
    }
    let orderedObligation = 0, shipped = 0, remaining = 0, overShipped = 0;
    for (const [line, obligation] of obligations) {
      const delivered = shippedByLine.get(line) ?? 0;
      orderedObligation += obligation; shipped += delivered;
      remaining += Math.max(0, obligation - delivered); overShipped += Math.max(0, delivered - obligation);
      if (![orderedObligation, shipped, remaining, overShipped].every(Number.isSafeInteger)) issue ??= 'unsafe_arithmetic';
    }
    if (issue) { out.checks.push(result(id, 'INCONCLUSIVE', issue, evidence)); continue; }
    for (const [line, obligation] of obligations) {
      const delivered = shippedByLine.get(line) ?? 0, surplus = Math.max(0, delivered - obligation), outstanding = Math.max(0, obligation - delivered);
      out.checks.push(result('fulfillment.line:' + key + '/' + line, surplus ? 'FAIL' : 'PASS', surplus ? 'over_shipment' : outstanding ? 'partial_fulfillment' : 'fulfilled', evidence,
        { obligation, shipped: delivered, remaining: outstanding, overShipped: surplus, completed: outstanding === 0 }));
    }
    const complete = remaining === 0;
    out.checks.push(result(id, overShipped ? 'FAIL' : 'PASS', overShipped ? 'over_shipment' : remaining ? 'partial_fulfillment' : 'fulfilled', evidence, { obligation: orderedObligation, shipped, remaining, overShipped, completed: complete }));
    if (overShipped) out.findings.push(finding('fulfillment.over-shipped', evidence, [key], `Handed-off quantities exceed line obligations by ${overShipped}.`, 'error'));
    if (remaining && shipped) out.findings.push(finding('fulfillment.partial', evidence, [key], `${shipped} units handed off; ${remaining} units remain outstanding.`, 'info'));
    for (const deadline of ctx.evidence.policy.deadlines ?? []) {
      if (deadline.sourceId !== source || deadline.orderId !== orderId) continue;
      const deadlineId = 'fulfillment.deadline:' + key;
      if (ctx.now < instant(deadline.at)) { out.checks.push(result(deadlineId, 'PASS', 'within_deadline', evidence)); continue; }
      let unknownTime = false;
      const onTime = new Map<string, number>();
      for (const [shipmentKey, o] of unique) {
        if (reversed.has(shipmentKey) || !['handed_off', 'delivered'].includes(o.fields.milestone)) continue;
        // A delivered timestamp cannot establish an earlier handoff timestamp.
        if (o.fields.milestone !== deadline.milestone) { unknownTime = true; continue; }
        if (!o.fields.milestoneTime || instant(o.fields.milestoneTime) > ctx.now) { unknownTime = true; continue; }
        if (instant(o.fields.milestoneTime) <= instant(deadline.at)) onTime.set(o.fields.lineId!, (onTime.get(o.fields.lineId!) ?? 0) + o.fields.quantity!);
      }
      const met = [...obligations].every(([line, quantity]) => (onTime.get(line) ?? 0) >= quantity);
      const beforeDeadline = instant(shipmentScope.coverage.observedAt) < instant(deadline.at);
      const status = met ? 'PASS' : unknownTime || beforeDeadline ? 'INCONCLUSIVE' : 'FAIL';
      out.checks.push(result(deadlineId, status, met ? 'deadline_met' : beforeDeadline ? 'coverage_before_deadline' : unknownTime ? 'unknown_milestone_time' : 'deadline_missed', evidence));
      if (status === 'FAIL') out.findings.push(finding('fulfillment.deadline-missed', evidence, [key], 'Declared milestone quantity was not established by the explicit deadline. No business calendar is inferred.'));
    }
  }
  // Early quantity/scope failures must not silently remove a declared deadline.
  for (const deadline of ctx.evidence.policy.deadlines ?? []) {
    const key = keyOf(deadline.sourceId, deadline.orderId), id = 'fulfillment.deadline:' + key;
    if (out.checks.some(c => c.id === id)) continue;
    const blocked = out.checks.find(c => c.id === 'fulfillment.quantities:' + key);
    out.checks.push(result(id, 'INCONCLUSIVE', blocked?.reason ?? 'missing_source_order', blocked?.evidence ?? []));
  }
  return out;
}

export function inventory(ctx: Context): RuleOutput {
  const out = empty(), policy = ctx.evidence.policy.inventory;
  const mappings = ctx.evidence.mappings.filter(m => m.kind === 'inventory');
  if (!mappings.length) out.checks.push(result('inventory.available', 'INCONCLUSIVE', 'missing_inventory_mapping', []));
  for (const m of mappings) {
    const id = 'inventory.available:' + m.id;
    const locations = m.aggregation?.locations ?? [m.fromRef.locationId!];
    const from = ctx.current(m.fromRef.sourceId, 'inventory', locations[0]), to = ctx.current(m.toRef.sourceId, 'inventory', m.toRef.locationId);
    const ids = [from.coverage, to.coverage].filter(c => c !== undefined).map(c => c.id);
    let issue = ctx.mappingIssue(m) ?? from.reason ?? to.reason;
    if (m.aggregation && (!m.aggregation.nonOverlapping || new Set(locations).size !== locations.length)) issue ??= 'overlapping_location_group';
    if (!policy || (policy.mode === 'net' && policy.buffer !== 0)) issue ??= 'missing_or_invalid_publication_policy';
    if (!m.factor || !m.fromUnit || !m.toUnit || !m.stockScope || !m.fromRef.locationId || !m.toRef.locationId) issue ??= 'incomplete_inventory_mapping';
    if (from.coverage && to.coverage && instant(from.coverage.observedAt) > instant(to.coverage.observedAt)) issue ??= 'unpaired_latest_source';
    if (issue || !policy || !from.coverage || !to.coverage) { out.checks.push(result(id, 'INCONCLUSIVE', issue ?? 'missing_coverage', ids)); continue; }
    const sourceSnapshots = ctx.coverages(m.fromRef.sourceId, 'inventory').filter(c => c.scope.locations.includes(locations[0]!));
    const targetSnapshots = ctx.coverages(m.toRef.sourceId, 'inventory').filter(c => c.scope.locations.includes(m.toRef.locationId!));
    // Pair each target instant with the latest source instant no later than it. Never reuse a source instant for persistence.
    let sourceIndex = -1, first: { at: number; sourceAt: number } | undefined, lastSourceAt: number | undefined, runEvidence: string[] = [];
    let latestDifference = 0, latestExpected = 0, latestActual = 0, latestReason = 'missing_aligned_observations', supported = false;
    for (const targetGroup of groups(targetSnapshots, c => String(instant(c.observedAt))).values()) {
      const target = targetGroup[0]!, at = instant(target.observedAt);
      const priorIndex = sourceIndex;
      while (sourceIndex + 1 < sourceSnapshots.length && instant(sourceSnapshots[sourceIndex + 1]!.observedAt) <= at) sourceIndex++;
      const source = sourceSnapshots[sourceIndex];
      issue = ctx.simultaneousIssue(targetGroup) ?? ctx.mappingIssue(m, at);
      if (!source) issue ??= 'missing_aligned_observations';
      if (source) {
        issue ??= ctx.usable(source) ?? ctx.mappingIssue(m, instant(source.observedAt));
        if (at - instant(source.observedAt) > policy.maxAlignmentMs) issue ??= 'unaligned_observations';
        // An unpaired intervening source instant cannot establish uninterrupted mismatch.
        // Reset conservatively: its quantities may be missing, conflicting, or in agreement.
        if (sourceSnapshots.slice(priorIndex + 1, sourceIndex + 1).some(c => ctx.usable(c) || instant(c.observedAt) < instant(source.observedAt))) { first = undefined; runEvidence = []; lastSourceAt = undefined; }
      }
      const sourceGroup = source ? sourceSnapshots.filter(c => instant(c.observedAt) === instant(source.observedAt)) : [];
      issue ??= ctx.simultaneousIssue(sourceGroup);
      if (source && locations.some(location => !source.scope.locations.includes(location))) issue ??= 'incomplete_aggregation_scope';
      const sourceRows = sourceGroup.flatMap(c => ctx.records(c)).filter((o): o is InventoryObservation => o.entityType === 'inventory' && o.fields.itemId === m.fromRef.entityId && locations.includes(o.fields.locationId));
      const targetRows = targetGroup.flatMap(c => ctx.records(c)).filter((o): o is InventoryObservation => o.entityType === 'inventory' && o.fields.itemId === m.toRef.entityId && o.fields.locationId === m.toRef.locationId);
      const members = locations.map(location => resolveRevision(sourceRows.filter(o => o.fields.locationId === location)));
      issue ??= members.find(member => member.reason)?.reason;
      const a = members[0]!, b = resolveRevision(targetRows);
      issue ??= a.reason ?? b.reason;
      const left = a.value, right = b.value;
      if (left && right) {
        for (const member of members) if (member.value) {
          issue ??= ctx.temporal(member.value);
          if (!['net_available', 'available_to_sell'].includes(member.value.fields.semantics)) issue ??= 'unknown_or_inequivalent_semantics';
          if (member.value.fields.unit !== m.fromUnit || member.value.fields.stockScope !== m.stockScope) issue ??= 'inequivalent_units_or_stock_scope';
          if (member.value.fields.quantity === undefined) issue ??= 'missing_quantity';
        }
        issue ??= ctx.temporal(left) ?? ctx.temporal(right);
        if (!['net_available', 'available_to_sell'].includes(left.fields.semantics) || !['net_available', 'available_to_sell'].includes(right.fields.semantics)) issue ??= 'unknown_or_inequivalent_semantics';
        if (left.fields.unit !== m.fromUnit || right.fields.unit !== m.toUnit || left.fields.stockScope !== m.stockScope || right.fields.stockScope !== m.stockScope) issue ??= 'inequivalent_units_or_stock_scope';
        if (left.fields.quantity === undefined || right.fields.quantity === undefined) issue ??= 'missing_quantity';
      }
      if (!issue && left && right && source) {
        const total = members.reduce((sum, member) => sum + member.value!.fields.quantity!, 0);
        const converted = total * m.factor!;
        if (!Number.isSafeInteger(total) || !Number.isSafeInteger(converted)) issue = 'unsafe_arithmetic';
        else {
          latestExpected = Math.max(0, converted - policy.buffer); latestActual = right.fields.quantity!;
          latestDifference = latestActual - latestExpected;
          const ev = [...targetGroup.map(c => c.id), source.id, ...sourceRows.map(o => o.id), ...targetRows.map(o => o.id)];
          if (Math.abs(latestDifference) <= policy.tolerance) { first = undefined; runEvidence = ev; lastSourceAt = undefined; latestReason = 'within_tolerance'; supported = false; continue; }
          const sourceAt = instant(source.observedAt);
          if (!first) { first = { at, sourceAt }; runEvidence = []; }
          runEvidence.push(...ev);
          supported = lastSourceAt !== undefined && sourceAt > first.sourceAt && at > first.at && at - first.at >= ctx.evidence.policy.persistenceMs && sourceAt - first.sourceAt >= ctx.evidence.policy.persistenceMs;
          lastSourceAt = sourceAt; latestReason = supported ? 'persistent_mismatch' : 'insufficient_persistence';
        }
      }
      if (issue) { first = undefined; lastSourceAt = undefined; runEvidence = [...ids, ...sourceRows.map(o => o.id), ...targetRows.map(o => o.id)]; latestReason = issue; supported = false; }
    }
    const evidence = sorted([...ids, ...runEvidence]);
    const status = latestReason === 'within_tolerance' ? 'PASS' : supported ? 'FAIL' : 'INCONCLUSIVE';
    const quantitiesKnown = ['within_tolerance', 'persistent_mismatch', 'insufficient_persistence'].includes(latestReason);
    out.checks.push(result(id, status, latestReason, evidence, { ...(quantitiesKnown ? { expectedQuantity: latestExpected, observedQuantity: latestActual, difference: latestDifference } : {}), buffer: policy.buffer, factor: m.factor! }));
    if (supported) out.findings.push(finding('inventory.mismatch', evidence, [keyOf(m.fromRef.sourceId, m.fromRef.entityId) + '/' + [...locations].sort().join('/'), keyOf(m.toRef.sourceId, m.toRef.entityId) + '/' + m.toRef.locationId], `Published quantity differs by ${latestDifference} target units after declared conversion and buffer, across distinct aligned observations spanning persistence.`));
  }
  return out;
}
