"""Original synthetic, literal expectations. Never imports or executes the evaluator."""
import json
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
def time(hm): return f'2026-10-28T{hm}:00Z'
def base(name, template, purpose, assumption, limit):
    s = json.loads((ROOT / f'scenarios/{template}.json').read_text())
    s.update(id=name, purpose=purpose, initialConditions=purpose, assertions=[])
    s.pop('integrationAssertions', None)
    s['evidence']['outcomes'] = []
    s['assumptions'].append(assumption)
    s['doesNotEstablish'].append(limit)
    s['provenance']['references'].append('docs/EXPANDED-ORACLES.md')
    return s
def diagnostic(s, status, reason, details=None, check=None):
    check = check or ('inventory.available:inventory-map' if 'inventory.available' in s['requiredCapabilities'] else 'fulfillment.quantities:shop/A')
    a = dict(id='literal-'+str(len(s['assertions'])), kind='diagnostic', required=True, checkId=check, expectedStatus=status, expectedReason=reason)
    if details: a['expectedDetails'] = details
    s['assertions'].append(a)
def finding(s, rule, present):
    s['assertions'].append(dict(id='finding-'+str(len(s['assertions'])), kind='finding', required=True, ruleId=rule, present=present))
def save(s):
    for c in s['evidence']['coverage']:
        c['captureInterval'] = dict(version='1.0.0', start=c['observedAt'], end=c['observedAt'])
    finding(s, 'observation.stale', False)
    (ROOT / f'scenarios/{s["id"]}.json').write_text(json.dumps(s, indent=2)+'\n')
def inventory(name, purpose, assumption, limit): return base(name, 'publication-buffer', purpose, assumption, limit)
def shipment(name, purpose, assumption, limit): return base(name, 'partial-shipment', purpose, assumption, limit)
def qty(s, source, n):
    for o in s['evidence']['observations']:
        if o['sourceId'] == source: o['fields']['quantity'] = n
def shipments(s): return [o for o in s['evidence']['observations'] if o['entityType']=='shipment']
def quantities(s, obligation, shipped, remaining):
    diagnostic(s,'PASS','partial_fulfillment' if remaining else 'fulfilled',dict(obligation=obligation,shipped=shipped,remaining=remaining,completed=remaining==0))
    finding(s,'fulfillment.over-shipped',False)

s=shipment('duplicate-delivery','Repeated S1=4 and S2=6 deliveries fulfill ten units exactly once.','Stable shipment/line identity defines duplicates, not observation identity.','Does not establish deduplication across unrelated shipment namespaces.')
o=deepcopy(shipments(s)[0]); o['id']='second-shipment'; o['fields']['shipmentId']='S2'; o['fields']['quantity']=6
s['evidence']['observations'].extend([o,dict(deepcopy(o),id='second-retry')]); quantities(s,10,10,0); finding(s,'fulfillment.partial',False); save(s)

s=shipment('out-of-order-events','An older four-unit revision arrives after the newer six-unit revision; remaining is four.','Source event timestamps describe revisions of S1; ingestion order is irrelevant.','Does not resolve absent or contradictory source revision times.')
o=shipments(s)[1]; o['fields']['quantity']=6; o['eventTime']=time('10:08'); o['ingestedAt']=time('10:09')
shipments(s)[0]['ingestedAt']=time('10:11'); s['evidence']['observations'].reverse(); quantities(s,10,6,4); finding(s,'fulfillment.partial',True); save(s)

s=shipment('cancellation-processing','Six confirmed cancellations during warehouse processing leave four obligations, all handed off.','Cancellation quantity is confirmed, not a pending request; it does not reverse shipments.','Does not reconcile refunds or prove a warehouse accepted an unconfirmed request.')
s['evidence']['observations'][0]['fields']['canceled']=6; quantities(s,4,4,0); finding(s,'fulfillment.partial',False); save(s)

s=inventory('gross-versus-net','Twelve on-hand units cannot be compared with ten available-to-sell units.','No validated transformation from gross on-hand to sellable net is supplied.','Does not infer commitment or damage deductions.')
for o in s['evidence']['observations']:
    if o['sourceId']=='warehouse': o['fields']['semantics']='on_hand'
diagnostic(s,'INCONCLUSIVE','unknown_or_inequivalent_semantics'); finding(s,'inventory.mismatch',False); save(s)

s=inventory('damaged-quarantine','Eight already-net sellable units exclude four quarantined units; a buffer of two publishes six.','Warehouse net excludes damaged/quarantined stock; do not deduct the four units again.','Does not independently verify quarantine classifications or physical stock.')
qty(s,'warehouse',8); qty(s,'shop',6); diagnostic(s,'PASS','within_tolerance',dict(expectedQuantity=6,observedQuantity=6,difference=0)); finding(s,'inventory.mismatch',False); save(s)

s=inventory('facility-aggregation','Disjoint east=5 and west=7 facilities publish ten after one two-unit buffer.','Both facilities share units and net semantics; nonoverlap is an explicit caller declaration.','Does not establish actual nonoverlap or allocate stock among facilities.')
m=s['evidence']['mappings'][0]; m['aggregation']=dict(locations=['east','west'],nonOverlapping=True)
for c in s['evidence']['coverage']:
    if c['sourceId']=='warehouse': c['scope']['locations']=['east','west']
for o in list(s['evidence']['observations']):
    if o['sourceId']=='warehouse':
        o['fields'].update(locationId='east',quantity=5)
        west=deepcopy(o); west['id']+='-west'; west['sourceRecordId']+='-west'; west['fields'].update(locationId='west',quantity=7); s['evidence']['observations'].append(west)
diagnostic(s,'PASS','within_tolerance',dict(expectedQuantity=10,observedQuantity=10,difference=0)); finding(s,'inventory.mismatch',False); save(s)

t=deepcopy(s); t.update(id='overlapping-transfers',purpose='An in-flight transfer appears in both facility groups; summation is unsupported.',initialConditions='East and west groups overlap while a transfer remains unsettled.',assertions=[])
t['evidence']['mappings'][0]['aggregation']['nonOverlapping']=False
t['assumptions'][-1]='Transfer positions overlap; the caller explicitly denies nonoverlap.'
t['doesNotEstablish'].append('No transfer settlement or double-count correction is inferred.')
diagnostic(t,'INCONCLUSIVE','overlapping_location_group'); finding(t,'inventory.mismatch',False); save(t)

s=inventory('duplicate-skus','Two catalogue identities share a display SKU; item correspondence is declared ambiguous.','SKU is not an identity key; the ambiguous mapping must block conclusions.','Does not select one of the duplicate catalogue products.')
s['evidence']['mappings'][0]['ambiguous']=True; diagnostic(s,'INCONCLUSIVE','ambiguous_mapping'); finding(s,'inventory.mismatch',False); save(s)

s=inventory('product-merge','A product was merged at 10:10; its old mapping expires before evaluation.','The old P1-to-P2 mapping is valid only before 10:10; no replacement is asserted.','Does not guess replacement identity or carry persistence across an identifier change.')
s['evidence']['mappings'][0]['validTo']=time('10:10'); diagnostic(s,'INCONCLUSIVE','mapping_outside_effective_interval'); finding(s,'inventory.mismatch',False); save(s)

s=shipment('label-deadline','A ten-unit label exists, but no carrier handoff occurred by the explicit 10:10 deadline.','Complete fresh shipment scope includes labels and all handoffs; deadline requires handed_off.','Does not implement a business calendar or infer carrier pickup from label generation.')
for o in shipments(s): o['fields'].update(quantity=10,milestone='label',milestoneTime=time('10:06'))
s['evidence']['policy']['deadlines']=[dict(sourceId='shop',orderId='A',at=time('10:10'),milestone='handed_off')]
quantities(s,10,0,10); diagnostic(s,'FAIL','deadline_missed',check='fulfillment.deadline:shop/A'); finding(s,'fulfillment.deadline-missed',True); finding(s,'fulfillment.partial',False); save(s)

s=inventory('recurrence-after-agreement','Mismatch at 10:06, agreement at 10:09, recurrence at 10:12; recurrence has insufficient persistence.','Agreement resets the persistence window. All three snapshots are complete and aligned.','Does not establish a persistent recurrence from a single new mismatch.')
qty(s,'shop',9)
for source in ['warehouse','shop']:
    c=deepcopy(next(c for c in s['evidence']['coverage'] if c['sourceId']==source)); c.update(id=source+'-middle',snapshotId=source+'-middle',observedAt=time('10:09')); s['evidence']['coverage'].append(c)
    o=deepcopy(next(o for o in s['evidence']['observations'] if o['sourceId']==source)); o.update(id=source+'-middle-row',snapshotId=c['snapshotId'],observedAt=c['observedAt']); o['fields']['quantity']=12 if source=='warehouse' else 10; s['evidence']['observations'].append(o)
diagnostic(s,'INCONCLUSIVE','insufficient_persistence',dict(expectedQuantity=10,observedQuantity=9,difference=-1)); finding(s,'inventory.mismatch',False); save(s)

s=shipment('unsupported-bundles','A shipment for a bundle lacks an explicit component-to-order-line allocation.','Bundle allocation is outside v0.1; no component formula or inferred line is allowed.','Does not establish kit availability or bundle fulfillment correctness.')
for o in shipments(s): o['fields'].pop('lineId'); o['unmappedFields']=['bundle_components']
diagnostic(s,'INCONCLUSIVE','ambiguous_line_allocation_or_quantity'); finding(s,'fulfillment.partial',False); finding(s,'fulfillment.over-shipped',False); save(s)

s=inventory('unknown-semantics','An export quantity has unknown semantics even though its number happens to match.','Numeric agreement cannot replace a documented net-quantity contract.','Does not infer available-to-sell from a field named quantity.')
for o in s['evidence']['observations']:
    if o['sourceId']=='warehouse': o['fields']['semantics']='unknown'
diagnostic(s,'INCONCLUSIVE','unknown_or_inequivalent_semantics'); finding(s,'inventory.mismatch',False); save(s)

s=inventory('unit-conversion','Two cases of six become twelve each; subtract two target units to publish ten.','Positive integer factor six is declared; buffer is in target units after conversion.','Does not support fractional units, weights, rounding, or inferred case sizes.')
qty(s,'warehouse',2); s['evidence']['mappings'][0].update(factor=6,fromUnit='case')
for o in s['evidence']['observations']:
    if o['sourceId']=='warehouse': o['fields']['unit']='case'
diagnostic(s,'PASS','within_tolerance',dict(expectedQuantity=10,observedQuantity=10,factor=6)); finding(s,'inventory.mismatch',False); save(s)

s=inventory('conversion-boundary','MAX_SAFE_INTEGER source units multiplied by two cannot yield an exact JavaScript integer.','Inputs are individually safe integers; derived arithmetic must also be safe.','Does not approximate, round, or certify an unsafe converted quantity.')
qty(s,'warehouse',9007199254740991); s['evidence']['mappings'][0]['factor']=2
diagnostic(s,'INCONCLUSIVE','unsafe_arithmetic'); finding(s,'inventory.mismatch',False); save(s)

s=shipment('shipment-reversal','A later explicit void references the four-unit handoff; ten obligations remain.','The void matches S1 line and quantity with a later source event time.','Does not imply a cancellation, refund, or reversal of other shipments.')
o=deepcopy(shipments(s)[0]); o.update(id='void-event',eventTime=time('10:09')); o['fields'].update(shipmentId='VOID1',milestone='voided',reversalOf='S1'); s['evidence']['observations'].append(o)
quantities(s,10,0,10); finding(s,'fulfillment.partial',False); save(s)

s=inventory('buffer-floor','A twenty-unit buffer exceeds twelve net units; publication floors explicitly at zero.','Floor at zero is declared policy, not a missing quantity substitution.','Does not prove stock is physically absent.')
s['evidence']['policy']['inventory']['buffer']=20; qty(s,'shop',0)
diagnostic(s,'PASS','within_tolerance',dict(expectedQuantity=0,observedQuantity=0,difference=0)); finding(s,'inventory.mismatch',False); save(s)

s=inventory('persistent-mismatch','Twelve net units minus buffer two should publish ten, but two distinct snapshots show nine.','Aligned complete snapshots are six minutes apart, exceeding five-minute persistence.','Does not identify root cause, physical stock, or authorize a correction.')
qty(s,'shop',9); diagnostic(s,'FAIL','persistent_mismatch',dict(expectedQuantity=10,observedQuantity=9,difference=-1)); finding(s,'inventory.mismatch',True); save(s)
print('Authored 18 additional scenarios with literal, non-generated oracles (24 total).')
