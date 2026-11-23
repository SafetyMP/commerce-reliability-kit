import { useRef, type RefObject } from 'react';
import { evaluateScenario } from './evaluator.ts';
import { StockProbe, type Offer, type StockPacket, replay, stockCapture } from './StockProbe.tsx';
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
  faulty: 'First shipment',
  corrected: 'Line quantities',
  insufficient: 'Line quantities · missing page',
};

const actionLabels = {
  close: 'Close as complete',
  follow: 'Schedule a callback',
  confirm: 'Ask the packing team',
} as const;
export type SupportAction = keyof typeof actionLabels;

export function supportDecision(report: RunReport, action: SupportAction) {
  const remaining = report.metrics.outstanding;
  const known = typeof remaining === 'number';
  if (action === 'close') return {
    assessment: known ? 'Closure contradicts the shop records' : 'Closure lacks sufficient evidence',
    reply: 'We’ve marked your order complete.',
    work: known ? `No follow-up assigned. The shop still shows ${remaining} outstanding units.` : 'No follow-up assigned. The partial feed leaves the outstanding balance unresolved.',
  };
  if (action === 'confirm') return {
    assessment: known ? 'Independent confirmation requested' : 'Evidence gap escalated',
    reply: 'I’ll ask our packing team what left the bench.',
    work: known ? `Packing checks the handoff for the ${remaining} units still open.` : 'Packing must match a complete handoff record to this order.',
  };
  return {
    assessment: known ? 'Open balance retained for follow-up' : 'Case held pending complete evidence',
    reply: known ? `I’ll call you back about the ${remaining} lamps still open.` : 'I’ll call back when I can confirm how many shipped.',
    work: known ? `Jo owns the callback on the ${remaining} open units.` : 'Jo owns the callback. The remaining quantity is unknown.',
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
  opened: boolean;
  onOpen: () => void;
  stock: StockPacket;
  offer: Offer | null;
  selectStock: (p: StockPacket) => void;
  selectOffer: (n: Offer) => void;
  heading: RefObject<HTMLHeadingElement | null>;
  variant: Variant;
  onVariant: (variant: Variant) => void;
  action: SupportAction | null;
  onAction: (action: SupportAction | null) => void;
  values: Assumptions;
  onValues: (values: Assumptions) => void;
  technicalHref: string;
  investment: string;
  onInvestment: (choice: string) => void;
}

export function CommerceCase({opened, onOpen, stock, offer, selectStock, selectOffer, heading, variant, onVariant, action, onAction, values, onValues, technicalHref, investment, onInvestment}: Props) {
  const evidenceHeading = useRef<HTMLHeadingElement>(null);
  const allocation = offer === null ? null : replay(stockCapture(stock), offer, 3, 8);
  const report = evaluateScenario('partial-shipment', variant);
  const assertion = report.assertions[0]!;
  const decision = action ? supportDecision(report, action) : null;
  const { ordered, canceled } = report.metrics;
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
        <p className="dispatch-kicker">North Quay Lighting · A fictional merchant case</p>
        <h1 id="case-heading" ref={heading} tabIndex={-1}>Five tables before the doors open</h1>
        <p>North Quay Lighting sells lamps online and from a pickup counter. One packing crew serves both. Jo runs the service desk, where a question from an online customer lands even when the answer is tucked inside a carton.</p>
        <p>At six tonight, Mina opens her neighborhood café for its first dinner service. She ordered a rechargeable lamp for each of five tables. This morning North Quay sent her one shipping notice.</p>
      </div>
      <figure className="cafe-note">
        <figcaption>Dinner service · Opening night</figcaption>
        <div className="floor-plan" aria-hidden="true">{Array.from({length: 5}, (_, i) => <span className="cafe-table" key={i}><i /></span>)}</div>
        <blockquote>“I have five tables to set. Does that shipping notice cover all five lamps, or should I arrange a pickup?”</blockquote>
        <p>Mina · Café owner</p>
      </figure>
    </section>
    <section className="merchant-handoffs" aria-labelledby="merchant-flow">
      <h2 id="merchant-flow">How an order moves through North Quay</h2>
      <ol className="handoff-steps">
        <li><h3>Checkout</h3><p>A customer pays online. The shop records the items and quantities on one order and sends a pick list to the packing bench.</p></li>
        <li><h3>Packing</h3><p>A packer works from that list and records what goes into each carton. Cartons from one order can leave on different carrier pickups.</p></li>
        <li><h3>Support</h3><p>When a customer calls, Jo opens the order and sees the shipping notice. It tells her a carton left. To find out what was inside, she has to look up the packing entry.</p></li>
      </ol>
      <div className="handoff-cost">
        <div>
          <h3>When a customer needs an answer</h3>
          <p>If Jo can’t match the notice to a packing entry, she calls the bench. A packer puts down the next order to check. While they look, the pickup queue grows and the customer waits for a callback.</p>
        </div>
        <div className="shift-example">
          <h4>What ten inquiries can cost</h4>
          <p>At 10 minutes of Jo’s time and 8 minutes of a packer’s time per inquiry, ten inquiries use <strong>3 staff-hours</strong>. That’s an illustrative shift, before counting any second calls.</p>
        </div>
      </div>
      <button type="button" className="primary" onClick={() => {
        onOpen();
        requestAnimationFrame(() => evidenceHeading.current?.focus());
      }}>Read Jo’s order file <span aria-hidden="true">↓</span></button>
    </section>
    {opened && <>
    <section className="record-section" aria-labelledby="evidence-heading">
      <p className="dispatch-kicker">Morning shift · Order {report.metrics.order}</p>
      <h2 id="evidence-heading" ref={evidenceHeading} tabIndex={-1}>Inside Jo’s order file</h2>
      <div className="support-decision">
      <div className="dispatch-ticket" aria-live="polite">
        <p className="ticket-title">Packing slip · {report.metrics.order}</p>
        <figure className="unit-ledger">
          <div className="parcel-row" aria-hidden="true">
            {Array.from({length: recordedUnits}, (_, index) => {
              const state = index < recorded ? 'recorded' : coverage === 'complete' ? 'open' : 'uncertain';
              return <span key={index} className={`parcel ${state}`}><b>{state === 'recorded' ? '✓' : state === 'open' ? '–' : '?'}</b></span>;
            })}
          </div>
          <figcaption>One box per lamp. ✓ means recorded at carrier pickup.{coverage !== 'complete' && ' ? means the feed is incomplete.'}</figcaption>
        </figure>
        <dl className="ticket-totals">
          <div><dt>Ordered</dt><dd>{ordered}</dd></div>
          <div><dt>In this handoff</dt><dd>{recorded}</dd></div>
          <div><dt>Canceled</dt><dd>{canceled}</dd></div>
        </dl>
        <p className="ticket-scope">Shop shipment snapshot · {coverage}</p>

      </div>
      <div className="reply-choice">
        <h3 id="support-heading">What will you tell Mina?</h3>
        <div role="group" aria-labelledby="support-heading" className="support-actions">
          {(Object.keys(actionLabels) as SupportAction[]).map(key => <button key={key} type="button"
            aria-pressed={action === key} onClick={() => onAction(key)}>{actionLabels[key]}</button>)}
        </div>
        <div className="reply-result" aria-live="polite" aria-atomic="true">{decision && <>
          <blockquote>“{decision.reply}”</blockquote>
          <p>{decision.work}</p>
        </>}</div>
        {action && <button type="button" className="text-button" onClick={() => {
          onAction(null);
          requestAnimationFrame(() => evidenceHeading.current?.focus());
        }}>Clear reply</button>}
      </div>
      </div>
    </section>

    {action && <>
    <section className="scenario-check" aria-labelledby="scenario-heading">
      <p className="dispatch-kicker">Commerce Reliability Kit · Scenario-based integration testing</p>
      <h2 id="scenario-heading">Can Jo trust the order status?</h2>
      <p>A connector turns shipment updates into an order status for Jo. The kit replays Mina’s order, works out which status the records support, and tests the connector’s answer against it.</p>
      <fieldset className="scenario-replays">
        <legend>Replay the connector</legend>
        {(Object.keys(labels) as Variant[]).map(v =>
          <button type="button" key={v} aria-pressed={variant === v} onClick={() => onVariant(v)}>{labels[v]}</button>)}
      </fieldset>
      <div aria-live="polite" aria-atomic="true" className="scenario-result">
        <dl className="scenario-facts">
          <div><dt>Shop evidence</dt><dd>{ordered} ordered · {recorded} handed off<small>{coverage === 'complete' ? 'All shipment pages captured' : 'A shipment page is missing'}</small></dd></div>
          <div><dt>Status the evidence supports</dt><dd>{assertion.expected}</dd></div>
          <div><dt>Status the connector returns</dt><dd>{assertion.observed}</dd></div>
        </dl>
        <p className="scenario-verdict"><StatusBadge status={assertion.status}/><span>{assertion.status === 'FAIL'
          ? `The connector would close an order with ${report.metrics.outstanding} lamps still open. Engineering can use this case to reproduce the error.`
          : assertion.status === 'PASS'
            ? `The revised rule passes on the same records. Jo can see the ${report.metrics.outstanding} lamps that still need follow-up.`
            : 'The missing page could contain another handoff. Jo needs the rest of the shipment record before quoting a balance.'}</span></p>
      </div>
      <a href={technicalHref}>Trace this check in the technical workspace</a>
    </section>
    <StockProbe packet={stock} offer={offer} selectPacket={selectStock} selectOffer={selectOffer}
      lead={action === 'close' ? 'Mina calls back after her ticket closes.' : action === 'confirm' ? 'Mina calls while packing checks the handoff.' : 'Jo calls Mina as promised.'} />
    {offer !== null && <section className="case-investment" aria-labelledby="pilot-heading">
      <div className="case-context">
        <p className="dispatch-kicker">The operations manager’s pilot</p>
        <h2 id="pilot-heading">Is a shared order report worth the cost?</h2>
        <p>For four weeks, Jo and packing could share the kit’s report on repeat inquiries. Engineering can rerun the same cases after connector changes. Time comparable tickets and count how often customers have to call back.</p>
        <p>{action === 'close' ? 'Count Mina’s second call in the manual baseline.' : action === 'confirm' ? 'Include the packer’s time checking the handoff.' : 'Include Jo’s callback in the time per ticket.'}
        {' '}{allocation?.unfilled == null ? 'Track promises made before inspection.' : allocation.unfilled > 0 ? 'Track accepted web orders that still have to wait.' : (allocation.idle ?? 0) >= 2 ? 'Count the web shoppers turned away to protect café loaners.' : 'Track café pickups the shop could not fill.'}</p>
      </div>
      <div className="pilot-sheet">
        <h3>Minutes saved per review</h3>
        <div role="group" className="support-actions" aria-label="Try a measured time saving">
          {[10, 15].map(n => <button type="button" key={n} aria-pressed={values.minutes === String(n)} onClick={() => onValues({...values, minutes: String(n)})}>{n} minutes saved</button>)}
        </div>
        <div className="pilot-result" aria-live="polite">{result ? <>
          <strong>{currency.format(result.net)} first-year net labor value</strong>
          <p>{result.hours.toLocaleString('en-US', {maximumFractionDigits: 2})} hours of modeled capacity across 12 months. {result.threshold === null ? 'Positive cost cannot be recovered at this volume and rate.' : 'Break-even requires ' + (Math.ceil(result.threshold * 100) / 100).toLocaleString('en-US', {maximumFractionDigits: 2}) + ' minutes saved per review.'}</p>
        </> : <p>Enter a nonnegative number in each field and a whole monthly case count.</p>}</div>
        <details><summary>Assumptions and calculation</summary><div className="case-inputs">{fields.map(({key, label}) => <label key={key}>{label}
          <input type="number" min="0" step={key === 'cases' ? 1 : 'any'} value={values[key]}
            onChange={e => onValues({...values, [key]: e.currentTarget.value})}/>
        </label>)}</div>
        <p>Monthly reviews × 12 × minutes saved ÷ 60 × hourly cost, less first-year cost. These figures model labor capacity.</p>
        {result && <>
          <figure className="pilot-chart">
            <figcaption>First-year comparison in USD</figcaption>
            {comparison.map(({label, value}) => <div className="pilot-bar" key={label}>
              <div><span>{label}</span><b>{currency.format(value)}</b></div>
              <span className="bar-track" aria-hidden="true"><i style={{width: (value / scale * 100) + '%'}}/></span>
            </div>)}
          </figure>
        </>}</details>
        <section className="sponsor-choice" aria-labelledby="sponsor-choice">
      <h2 id="sponsor-choice">What would you fund?</h2>
      <div role="group" aria-label="Sponsor decision" className="support-actions">
        {['Keep manual review', 'Fund a connector test', 'Trial shared reports'].map(option =>
          <button key={option} type="button" className={investment === option ? 'primary' : 'secondary'} aria-pressed={investment === option} onClick={() => onInvestment(option)}>{option}</button>)}
      </div>
      {investment && <p role="status">{investment === 'Keep manual review'
        ? 'Jo keeps the queue. Time repeat contacts to establish the baseline.'
        : investment === 'Fund a connector test'
          ? 'Engineering tests partial shipments. Jo still handles the follow-up.'
          : !result ? 'Complete the worksheet to estimate the pilot’s first-year value.'
          : result.net < 0 ? 'The pilot falls short at this saving. Check the measured time before funding it.'
          : 'Trial the report for four weeks. Expand if measured savings cover cost and reopened cases hold steady.'}</p>}
    </section>
      </div>
    </section>}
    </>}
    {!action && <a className="secondary technical-cta" href={technicalHref}>Trace this order in the technical workspace</a>}
    <details className="case-sources"><summary>Evidence behind the case</summary>
      <p>Both the order line and shipment record come from the synthetic shop feed. The handoff is a recorded shipping milestone. Independent confirmation from the warehouse or proof of customer delivery would require separate records.</p>
      <p>The café, lamps, deadline and demand sequence are fictional. The substitute uses a separate inventory fixture. Shopify distinguishes stock on hand from stock available to sell. <a href="https://help.shopify.com/en/manual/inventory-and-locations/fundamentals/inventory-states">Inventory states</a></p>
      <p>Shopify models total and remaining quantities for each fulfillment-order line. Its guidance also describes out-of-order or missed webhook deliveries and periodic reconciliation. These sources inform the business problem. The example uses the kit’s own records. <a href="https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrderLineItem">Line quantities</a> · <a href="https://shopify.dev/docs/apps/build/webhooks">Webhook behavior</a></p>
      <p>Shopify places order access with customer support and picking, packing and shipping with fulfillment staff. Its developer guide covers fulfillment integrations. We propose the ecommerce operations manager as sponsor because that role coordinates fulfillment and customer service. <a href="https://help.shopify.com/en/manual/your-account/users/roles/predefined-roles">Support roles</a> · <a href="https://help.shopify.com/en/manual/your-account/users/roles/role-examples">Fulfillment roles</a> · <a href="https://shopify.dev/docs/apps/build/orders-fulfillment/fulfillment-service-apps/build-for-fulfillment-services">Integration guide</a> · <a href="https://www.shopify.com/enterprise/blog/how-to-overcome-your-daily-operational-frustrations-to-focus-on-future-growth">Ecommerce operations responsibilities</a></p>
    </details>
    </>}
  </div>;
}
