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
  values: Assumptions;
  onValues: (values: Assumptions) => void;
  onInspect: (report: RunReport) => void;
}

export function CommerceCase({heading, variant, onVariant, values, onValues, onInspect}: Props) {
  const report = evaluateScenario('partial-shipment', variant);
  const assertion = report.assertions[0]!;
  const { ordered, fulfilled, outstanding } = report.metrics;
  const result = pilotValue(values);
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
        <p className="ticket-title">Shipment reconciliation</p>
        <dl className="ticket-totals">
          <div><dt>Ordered</dt><dd>{ordered}</dd></div>
          <div><dt>Handed off</dt><dd>{fulfilled ?? 'Unknown'}</dd></div>
          <div><dt>Outstanding</dt><dd>{outstanding ?? 'Unknown'}</dd></div>
        </dl>
        <p className="ticket-scope">Shop shipment snapshot · {report.coverage.find(c => c.resource === 'shipments')?.status}</p>
        <p><strong>Selected example’s output</strong><br/>{assertion.observed}</p>
        <div className="ticket-verdict"><StatusBadge status={assertion.status}/><span>{variant === 'faulty' ? 'Keep the order open. Two units still need a handoff.' : variant === 'corrected' ? 'Keep the order open and follow up on the remaining two units.' : 'Request the remaining shipment records before quoting a balance.'}</span></div>
        <button type="button" className="secondary" onClick={() => onInspect(report)}>Inspect this run’s records</button>
      </div>
    </section>

    <section className="case-investment" aria-labelledby="pilot-heading">
      <div className="case-context">
        <p className="dispatch-kicker">Decision for the ecommerce operations manager</p>
        <h2 id="pilot-heading">Would a reconciliation pilot pay for the review time it saves?</h2>
        <p>The support agent needs an accurate answer for this customer. The fulfillment lead can check warehouse handoff records if the shop feed is incomplete. The integration engineer can reproduce the closure and add a quantity assertion to the connector’s tests.</p>
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
