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
    <section className="support-decision record-section" aria-labelledby="evidence-heading">
      <div>
        <p className="dispatch-kicker">Morning shift · Order {report.metrics.order}</p>
        <h2 id="evidence-heading" ref={evidenceHeading} tabIndex={-1}>Inside Jo’s order file</h2>
        <p>Mina’s message is waiting. On Jo’s screen are the original order line and the shop’s record of a carrier pickup. What do those two entries tell you about her lamps?</p>
      </div>
      <div className="dispatch-ticket" aria-live="polite">
        <p className="ticket-title">Packing slip · {report.metrics.order}</p>
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

      </div>
    </section>

    <section className="support-decision" aria-labelledby="support-heading">
      <div>
        <p className="dispatch-kicker">Support desk · Simulated response</p>
        <h2 id="support-heading">What will you tell Mina?</h2>
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

    {action && <>
    <StockProbe packet={stock} offer={offer} selectPacket={selectStock} selectOffer={selectOffer}
      lead={action === 'close' ? 'With her ticket closed, Mina calls the desk again.' : action === 'confirm' ? 'Mina gives Jo that update while fulfillment checks the earlier handoff.' : 'Jo gets the update on their scheduled follow-up.'} />
    <details className="replay-options"><summary>Replay the order with a different connector or an incomplete shipment feed</summary>
      <fieldset className="case-modes"><legend>Choose the records and rule for Jo’s next reply</legend>
        {(Object.keys(labels) as Variant[]).map(v => <label key={v}>
          <input type="radio" name="dispatch-rule" checked={variant === v} onChange={() => {
            onVariant(v);
            requestAnimationFrame(() => evidenceHeading.current?.focus());
          }}/>{labels[v]}
        </label>)}
      </fieldset>
    </details>
    <section className="case-investment" aria-labelledby="pilot-heading">
      <div className="case-context">
        <p className="dispatch-kicker">Decision for the ecommerce operations manager</p>
        <h2 id="pilot-heading">Would a reconciliation pilot pay for the review time it saves?</h2>
        <p>{action === 'close' ? 'On this shift, closing the ticket sent Mina back through the queue. Count that second contact when timing manual reviews.' : action === 'confirm' ? 'On this shift, fulfillment had to check the warehouse record. Include the time of both teams in the comparison.' : 'On this shift, Jo kept ownership of the follow-up. Time the work through the callback as well as the first reply.'}</p>
        {allocation && <p>{allocation.unfilled === null ? 'Your listing took orders with sellable stock still unknown. Track how long customers wait for confirmation.' : allocation.unfilled > 0 ? 'Your listing accepted an online order the counter could not fill. Track those promises alongside time saved.' : (allocation.idle ?? 0) >= 2 ? 'Your listing protected both café loaners. Track the online requests that could not check out alongside successful pickups.' : 'Your listing filled the web orders but left no café loaners. Track whether customers find an alternative in time.'}</p>}
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
        <div role="group" className="support-actions" aria-label="Try a measured time saving">
          {[10, 15].map(n => <button type="button" key={n} aria-pressed={values.minutes === String(n)} onClick={() => onValues({...values, minutes: String(n)})}>{n} minutes saved</button>)}
        </div>
        <details><summary>Edit the pilot assumptions</summary><div className="case-inputs">{fields.map(({key, label}) => <label key={key}>{label}
          <input type="number" min="0" step={key === 'cases' ? 1 : 'any'} value={values[key]}
            onChange={e => onValues({...values, [key]: e.currentTarget.value})}/>
        </label>)}</div></details>
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
        <section className="sponsor-choice" aria-labelledby="sponsor-choice">
      <p className="dispatch-kicker">Pilot recommendation</p><h2 id="sponsor-choice">What would you fund?</h2>
      <p>Use the ticket and your worksheet to choose the next step for the operations manager.</p>
      <div role="group" aria-label="Sponsor decision" className="support-actions">
        {['Keep manual review', 'Fund a connector test', 'Trial shared reports'].map(option =>
          <button key={option} type="button" className={investment === option ? 'primary' : 'secondary'} aria-pressed={investment === option} onClick={() => onInvestment(option)}>{option}</button>)}
      </div>
      {investment && <p role="status">{investment === 'Keep manual review' ? 'Keep the queue with support. Sample reopened tickets and time the next manual reconciliations to establish a baseline.' : investment === 'Fund a connector test' ? 'Ask integration engineering to test a partial handoff and an incomplete feed. Support still owns the customer follow-up.' : 'Pilot with support and fulfillment for four weeks. Compare time per review and reopened cases against the manual baseline.'}
        {investment === 'Trial shared reports' && result && <> Your worksheet models {currency.format(result.net)} in first-year net labor value. {result.net < 0 ? 'At this saving, the pilot falls short of its cost. Reduce scope or stop if measured reviews bear that out.' : 'Expand only if timed reviews cover the cost and reopened cases do not increase.'}</>}</p>}
    </section>
    <details><summary>Calculation and decision criteria</summary><p>Monthly reviews × 12 × minutes saved ÷ 60 × hourly cost, less first-year cost. Count only eligible cases. Confirm that the team can use the released time, and expand only if observed savings cover cost without increasing erroneous closures. Refunds and retained sales are outside this estimate.</p></details>
      </div>
    </section>
    </>}
    <a className="secondary technical-cta" href={technicalHref}>Trace this order in the technical workspace</a>
    <details className="case-sources"><summary>Evidence behind the case</summary>
      <p>Both the order line and shipment record come from the synthetic shop feed. The handoff is a recorded shipping milestone. Independent confirmation from the warehouse or proof of customer delivery would require separate records.</p>
      <p>The café, lamps, deadline and demand sequence are fictional. The substitute uses a separate inventory fixture. Shopify distinguishes stock on hand from stock available to sell. <a href="https://help.shopify.com/en/manual/inventory-and-locations/fundamentals/inventory-states">Inventory states</a></p>
      <p>Shopify models total and remaining quantities for each fulfillment-order line. Its guidance also describes out-of-order or missed webhook deliveries and periodic reconciliation. These sources inform the business problem. The example uses the kit’s own records. <a href="https://shopify.dev/docs/api/admin-graphql/latest/objects/FulfillmentOrderLineItem">Line quantities</a> · <a href="https://shopify.dev/docs/apps/build/webhooks">Webhook behavior</a></p>
      <p>Shopify places order access with customer support and picking, packing and shipping with fulfillment staff. Its developer guide covers fulfillment integrations. We propose the ecommerce operations manager as sponsor because that role coordinates fulfillment and customer service. <a href="https://help.shopify.com/en/manual/your-account/users/roles/predefined-roles">Support roles</a> · <a href="https://help.shopify.com/en/manual/your-account/users/roles/role-examples">Fulfillment roles</a> · <a href="https://shopify.dev/docs/apps/build/orders-fulfillment/fulfillment-service-apps/build-for-fulfillment-services">Integration guide</a> · <a href="https://www.shopify.com/enterprise/blog/how-to-overcome-your-daily-operational-frustrations-to-focus-on-future-growth">Ecommerce operations responsibilities</a></p>
    </details>
    </>}
  </div>;
}
