import { useRef } from 'react';
import type { ReactNode } from 'react';
import { policyLabels } from './evaluator.ts';
import { totalText } from './reports.ts';
import type { Policy, PolicyKey, RunReport, SourceFacts, Status } from './types.ts';

export type IconName = 'library' | 'workbench' | 'report' | 'compare' | 'arrow' | 'play' | 'download' | 'search' | 'check' | 'box' | 'reset';
const paths: Record<IconName, ReactNode> = {
  library: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  workbench: <><path d="m4 7 5 5-5 5m9 0h7"/></>,
  report: <><path d="M14 3H5v18h14V8zM14 3v5h5M8 12h8m-8 4h6"/></>,
  compare: <><path d="M8 3v18m8-18v18M4 7l4-4 4 4m0 10 4 4 4-4"/></>,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6"/>, play: <path d="m8 4 12 8-12 8z"/>,
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  box: <><path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5"/></>,
  reset: <path d="M3 10a9 9 0 1 1 2 8M3 3v7h7"/>,
};
export function Icon({ name }: { name: IconName }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
export function StatusBadge({ status }: { status: Status }) {
  const symbols: Record<Status, string> = { PASS: '✓', FAIL: '×', INCONCLUSIVE: '?', 'NOT APPLICABLE': '–' };
  return <span className={`status ${status.toLowerCase().replaceAll(' ', '-')}`}><span aria-hidden="true">{symbols[status]}</span> {status}</span>;
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <section className="empty"><Icon name="box"/><h2>{title}</h2>{children}</section>;
}
export function PolicyFacts({ policy }: { policy: Policy }) {
  return Object.keys(policy).length ? <dl className="facts-list">{Object.entries(policy).map(([key, value]) => <div key={key}><dt>{policyLabels[key as PolicyKey]}</dt><dd>{value}</dd></div>)}</dl> : <p className="muted">Fixed quantity rules. No editable policy applies.</p>;
}
export function MetricFacts({ report }: { report: RunReport }) {
  const fulfillment = report.scenarioId === 'partial-shipment' || report.scenarioId === 'duplicate-shipment';
  const keys = fulfillment ? ['ordered', 'canceled', 'fulfilled', 'outstanding'] : Object.keys(report.metrics);
  const labels: Record<string, string> = { ordered: 'Ordered', canceled: 'Canceled', fulfilled: 'Fulfilled', outstanding: 'Outstanding',
    delayMinutes: 'Arrival delay / min', orderAgeMinutes: 'Order age / min', postAllowanceObservations: 'Post-allowance scopes', persistenceMinutes: 'Persistence / min',
    capturedWarehouseQuantity: 'Captured warehouse', storefrontQuantity: 'Storefront', warehouseAgeMinutes: 'Warehouse age / min', comparableWarehouseQuantity: 'Comparable warehouse', expectedPublished: 'Expected publication' };
  return <div className="quantity-panel">{fulfillment && <p className="mono order-id">Order {report.metrics.order}</p>}<dl className="quantities">{keys.map(k => <div key={k}><dt>{labels[k] ?? k}</dt><dd>{report.metrics[k] === null ? 'Unknown' : String(report.metrics[k])}</dd></div>)}</dl></div>;
}
export function ResultStrip({ report }: { report: RunReport }) {
  return <div className="result-strip"><div><span className="eyebrow">Assertion verdicts</span><p>{totalText(report)}</p></div><div><span className="eyebrow">Operational findings</span><p>{report.findings.length} supported {report.findings.length === 1 ? 'finding' : 'findings'}</p></div><div><span className="eyebrow">Evidence coverage</span><p>{report.coverage.filter(c => c.status === 'complete').length}/{report.coverage.length} scopes declared complete</p></div></div>;
}
export function EvidencePanel({ facts, selected, onSelect, evaluationTime }: { facts: SourceFacts; selected: string | null; onSelect: (id: string | null) => void; evaluationTime: string }) {
  const inspectorRef = useRef<HTMLHeadingElement>(null);
  const record = facts.observations.find(o => o.id === selected) ?? facts.coverage.find(c => c.id === selected);
  function inspect(id: string) {
    onSelect(id);
    // Keep the user's context in the inline inspector; no modal or keyboard trap.
    requestAnimationFrame(() => inspectorRef.current?.focus());
  }
  return <section className="panel evidence-section" aria-labelledby="evidence-title">
    <div className="section-heading"><div><span className="eyebrow">Source facts</span><h2 id="evidence-title" tabIndex={-1}>Evidence timeline</h2></div><span className="quiet-tag">All times UTC</span></div>
    <p className="muted">Source events describe when something happened. Observations describe when it was captured. Evaluation: <span className="mono">{evaluationTime}</span>.</p>
    <div className={`evidence-layout ${record ? 'has-inspector' : ''}`}>
      <div className="timeline">
        {facts.observations.map(o => <button type="button" className={`timeline-item ${selected === o.id ? 'selected' : ''}`} aria-pressed={selected === o.id} key={o.id} onClick={() => inspect(o.id)}>
          <span className="timeline-dot" aria-hidden="true"/><span className="timeline-body"><span className="timeline-title">{o.entityType} <span className="muted">/ {o.sourceId}</span></span><span className="mono record-id">{o.id}</span><span className="time-pair"><span>Source event <b>{o.eventTime?.slice(11, 19) ?? 'Unknown'}</b></span><span>Observed at <b>{o.observedAt.slice(11, 19)}</b></span></span></span><span aria-hidden="true">↗</span>
        </button>)}
        <h3 className="coverage-label">Coverage declarations</h3>
        {facts.coverage.map(c => <button type="button" className={`scope-item ${selected === c.id ? 'selected' : ''}`} key={c.id} aria-pressed={selected === c.id} onClick={() => inspect(c.id)}>
          <span><strong>{c.sourceId} / {c.resource}</strong><span className="mono record-id">{c.id}</span><span className="mono">Captured {c.observedAt.slice(11, 19)} UTC</span></span><span className={`coverage-status ${c.status !== 'complete' ? 'warning-text' : ''}`}>{c.status === 'complete' ? '✓' : '?'} {c.status}<small>{c.pagination === 'exhausted' ? 'Pages exhausted' : 'Pages remaining'}</small></span>
        </button>)}
      </div>
      {record ? <aside className="inspector" aria-label="Normalized evidence inspector"><div className="section-heading"><h3 ref={inspectorRef} tabIndex={-1}>Normalized record</h3><button className="text-button" type="button" onClick={() => { onSelect(null); document.getElementById('evidence-title')?.focus(); }}>Close</button></div><p className="mono">{record.id}</p><p className="muted">Exact synthetic record supplied to this example.</p><pre tabIndex={0} aria-label={`Normalized record ${record.id}`}>{JSON.stringify(record, null, 2)}</pre></aside> : <aside className="inspector-placeholder"><Icon name="report"/><h3>Follow the evidence</h3><p>Select a record or coverage declaration to inspect its normalized fields here.</p></aside>}
    </div>
  </section>;
}
