import type { RefObject } from 'react';
import { evaluateScenario } from './evaluator.ts';
import { StatusBadge } from './components.tsx';
import type { RunReport, Variant } from './types.ts';

const fields = [
  { key: 'cases', label: 'Cases reviewed per month' },
  { key: 'minutes', label: 'Minutes saved per review' },
  { key: 'rate', label: 'Loaded labor cost (USD/hour)' },
  { key: 'cost', label: 'First-year pilot cost (USD)' },
] as const;
type Field = typeof fields[number]['key'];
export type Assumptions = Record<Field, string>;
export const initialAssumptions: Assumptions = { cases: '40', minutes: '15', rate: '48', cost: '4800' };
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const labels: Record<Variant, string> = {
  faulty: 'Close on first shipment',
  corrected: 'Reconcile line quantities',
  insufficient: 'Try a partial capture',
};

const actionLabels = {
  close: 'Close the case as complete',
  follow: 'Keep open and follow up',
  confirm: 'Request warehouse confirmation',
} as const;
export type SupportAction = keyof typeof actionLabels;

export function supportDecision(report: RunReport, action: SupportAction) {
  const remaining = report.metrics.outstanding;
  const known = typeof remaining === 'number';
  if (action === 'close') return {
    assessment: known ? 'Closure contradicts the shop records' : 'Closure lacks sufficient evidence',
    reply: 'We have marked your order complete and closed this support case.',
    work: known ? `No follow-up assigned. The shop still shows ${remaining} outstanding units.` : 'No follow-up assigned. The partial feed leaves the outstanding balance unresolved.',
  };
  if (action === 'confirm') return {
    assessment: known ? 'Independent confirmation requested' : 'Evidence gap escalated',
    reply: 'We are keeping your case open and asking fulfillment to check the warehouse handoff records.',
    work: known ? `Ask fulfillment to verify the warehouse records for the ${remaining} units still open in the shop.` : 'Ask fulfillment for a complete shipment record matched to this order line. Reconcile it before quoting a balance.',
  };
  return {
    assessment: known ? 'Open balance retained for follow-up' : 'Case held pending complete evidence',
    reply: known ? `The shop shows ${remaining} units still open. We will follow up on their shipment status.` : 'We are keeping your case open while we check its shipment status.',
    work: known ? `Assign fulfillment to trace the ${remaining} open units and return an update to support.` : 'Keep the ticket in the pending queue. Support still needs a complete shipment capture to establish the balance.',
  };
}

export function pilotValue(values: Assumptions) {
  const numbers = fields.map(({key}) => Number(values[key]));
  if (fields.some(({key}) => values[key].trim() === '') ||
      numbers.some(n => !Number.isFinite(n) || n < 0) || !Number.isSafeInteger(numbers[0])) return null;
  const [cases, minutes, rate, cost] = numbers as [number, number, number, number];
  const hours = 12 * cases * minutes / 60;
  const net = hours * rate - cost;
  const threshold = cases > 0 && rate > 0 ? cost * 60 / (12 * cases * rate) : cost === 0 ? 0 : null;
  if (!Number.isFinite(hours) || !Number.isFinite(net) || (threshold !== null && !Number.isFinite(threshold))) return null;
  return { hours, net, threshold };
}

interface Props {
  heading: RefObject<HTMLHeadingElement | null>;
  variant: Variant;
  onVariant: (variant: Variant) => void;
  action: SupportAction | null;
  onAction: (action: SupportAction | null) => void;
  values: Assumptions;
  onValues: (values: Assumptions) => void;
  onInspect: (report: RunReport) => void;
}

export function CommerceCase({heading, variant, onVariant, action, onAction, values, onValues, onInspect}: Props) {
  const report = evaluateScenario('partial-shipment', variant);
  const assertion = report.assertions[0]!;
  const decision = action ? supportDecision(report, action) : null;
  const { ordered, canceled, outstanding } = report.metrics;
  const result = pilotValue(values);
  const shipment = report.observations.find(o => o.entityType === 'shipment');
  const recorded = shipment?.entityType === 'shipment' ? shipment.fields.quantity ?? 0 : 0;
  const coverage = report.coverage.find(c => c.resource === 'shipments')?.status;
  const recordedUnits = Number(ordered);
  const comparison = result ? [
    { label: 'Recovered labor capacity', value: result.hours * Number(values.rate) },
    { label: 'First-year pilot cost', value: Number(values.cost) },
  ] : [];
  const scale = Math.max(1, ...comparison.map(row => row.value));
  return <div className="commerce-case">
    <section className="dispatch" aria-labelledby="case-heading">
      <div className="dispatch-brief">
        <p className="dispatch-kicker">Fulfillment desk · Order {report.metrics.order}</p>
        <h1 id="case-heading" ref={heading} tabIndex={-1}>Can the desk close this order?</h1>
        <p>The shop’s order lists five units. Its shipment feed records one handoff of three. The original connector closed the order on that first shipment. What should support tell the customer?</p>
        <fieldset className="case-modes">
          <legend>Test the connector decision</legend>
          {(Object.keys(labels) as Variant[]).map(v => <label key={v}>
            <input type="radio" name="dispatch-rule" checked={variant === v} onChange={() => onVariant(v)}/>
            {labels[v]}
          </label>)}
        </fieldset>
      </div>
      <div className="dispatch-ticket" aria-live="polite">
        <p className="ticket-title">Shop records for this order</p>
        <figure className="unit-ledger">
          <div className="parcel-row" aria-hidden="true">
            {Array.from({length: recordedUnits}, (_, index) => {
              const state = index < recorded ? 'recorded' : coverage === 'complete' ? 'open' : 'uncertain';
              return <span key={index} className={`parcel ${state}`}><b>{state === 'recorded' ? '✓' : state === 'open' ? '–' : '?'}</b></span>;
            })}
          </div>
          <figcaption>Each parcel represents one ordered unit. A check marks a unit in the recorded handoff{coverage === 'complete' ? '.' : '. Question marks indicate incomplete coverage.'}</figcaption>
        </figure>
        <dl className="ticket-totals">
          <div><dt>Ordered</dt><dd>{ordered}</dd></div>
          <div><dt>In this handoff</dt><dd>{recorded}</dd></div>
          <div><dt>Canceled</dt><dd>{canceled}</dd></div>
        </dl>
        <p className="ticket-scope">Shop shipment snapshot · {coverage}</p>
        <button type="button" className="secondary" onClick={() => onInspect(report)}>Inspect this run’s records in the technical workspace</button>
      </div>
    </section>

    <section className="support-decision" aria-labelledby="support-heading">
      <div>
        <p className="dispatch-kicker">Support desk · Simulated response</p>
        <h2 id="support-heading">What will you tell the customer?</h2>
        <div role="group" aria-label="Choose a support action" className="support-actions">
          {(Object.keys(actionLabels) as SupportAction[]).map(key => <button key={key} type="button"
            className={action === key ? 'primary' : 'secondary'} aria-pressed={action === key}
            onClick={() => onAction(key)}>{actionLabels[key]}</button>)}
        </div>
      </div>
      <div className="response-slip" aria-live="polite">{decision ? <>
        <h3>{decision.assessment}</h3>
        <p><strong>Customer reply</strong><br/>{decision.reply}</p>
        <p><strong>Fulfillment follow-up</strong><br/>{decision.work}</p>
        <p><strong>Connector check</strong><br/>The selected example reports “{assertion.observed}”. The outstanding balance is {outstanding ?? 'unknown'}.</p>
        <div className="ticket-verdict"><StatusBadge status={assertion.status}/><span>{assertion.reason}</span></div>
        <button className="text-button" type="button" onClick={() => onAction(null)}>Clear response and try again</button>
      </> : <p>Your choice opens a draft customer reply and shows who owns the next step.</p>}</div>
    </section>

    <section className="case-investment" aria-labelledby="pilot-heading">
      <div className="case-context">
        <p className="dispatch-kicker">Decision for the ecommerce operations manager</p>
        <h2 id="pilot-heading">Would a reconciliation pilot pay for the review time it saves?</h2>
        <ul className="review-trail" aria-label="Who resolves this exception">
          <li><strong>Support agent</strong><span>Use the available shipment evidence to answer the customer.</span></li>
          <li><strong>Fulfillment lead</strong><span>Supply warehouse handoff records when the shop feed is incomplete.</span></li>
          <li><strong>Integration engineer</strong><span>Reproduce the closure and test the connector against the ordered quantity.</span></li>
        </ul>
        <p>As pilot sponsor, the ecommerce operations manager can keep manual review, fund a connector test alone, or trial shared reports for four weeks. Time comparable tickets with and without a report. Track reopened cases and missing records before expanding.</p>
      </div>
      <div className="pilot-sheet">
        <h3>First-year worksheet</h3>
        <p>The defaults are illustrative. Estimate the capacity your team could recover. Use support’s ticket counts and time study, and engineering’s estimate for setup and maintenance.</p>
        <div className="case-inputs">{fields.map(({key, label}) => <label key={key}>{label}
          <input type="number" min="0" step={key === 'cases' ? 1 : 'any'} value={values[key]}
            onChange={e => onValues({...values, [key]: e.currentTarget.value})}/>
        </label>)}</div>
        <div className="pilot-result" aria-live="polite">{result ? <>
          <figure className="pilot-chart">
            <figcaption>First-year comparison in USD</figcaption>
            {comparison.map(({label, value}) => <div className="pilot-bar" key={label}>
              <div><span>{label}</span><b>{currency.format(value)}</b></div>
              <span className="bar-track" aria-hidden="true"><i style={{width: (value / scale * 100) + '%'}}/></span>
            </div>)}
          </figure>
          <strong>{currency.format(result.net)} first-year net labor value</strong>
          <p>{result.hours.toLocaleString('en-US', {maximumFractionDigits: 2})} hours of modeled capacity across 12 months. {result.threshold === null ? 'Positive cost cannot be recovered at this volume and rate.' : 'Break-even requires ' + (Math.ceil(result.threshold * 100) / 100).toLocaleString('en-US', {maximumFractionDigits: 2}) + ' minutes saved per review.'}</p>
        </> : <p>Enter a nonnegative number in each field and a whole monthly case count.</p>}</div>
        <details><summary>Calculation and decision criteria</summary><p>Monthly reviews × 12 × minutes saved ÷ 60 × hourly cost, less first-year cost. Count only eligible cases. Confirm that the team can use the released time, and expand only if observed savings cover cost without increasing erroneous closures. Refunds and retained sales are outside this estimate.</p></details>
      </div>
    </section>
    <details className="case-sources"><summary>Evidence behind the case</summary>
      <p>Both the order line and shipment record come from the synthetic shop feed. The handoff is a recorded shipping milestone. Independent confirmation from the warehouse or proof of customer delivery would require separate records.</p>
      <p>Shopify models total and remaining quantities for each fulfillment-order line. Its guidance also describes out-of-order or missed webhook deliveries and periodic reconciliation. These sources inform the business problem. The example uses the kit’s own records. <a href="https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrderLineItem">Line quantities</a> · <a href="https://shopify.dev/docs/apps/build/webhooks">Webhook behavior</a></p>
      <p>Shopify places order access with customer support and picking, packing and shipping with fulfillment staff. Its developer guide covers fulfillment integrations. We propose the ecommerce operations manager as sponsor because that role coordinates fulfillment and customer service. <a href="https://help.shopify.com/en/manual/your-account/users/roles/predefined-roles">Support roles</a> · <a href="https://help.shopify.com/en/manual/your-account/users/roles/role-examples">Fulfillment roles</a> · <a href="https://shopify.dev/docs/apps/build/orders-fulfillment/fulfillment-service-apps/build-for-fulfillment-services">Integration guide</a> · <a href="https://www.shopify.com/enterprise/blog/how-to-overcome-your-daily-operational-frustrations-to-focus-on-future-growth">Ecommerce operations responsibilities</a></p>
    </details>
  </div>;
}
