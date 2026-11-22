import quarantine from "../../../scenarios/damaged-quarantine.json" with { type: "json" };
import gross from "../../../scenarios/gross-versus-net.json" with { type: "json" };

export const captures = [
  { label: "Inspection hold", fixture: quarantine },
  { label: "Cycle count", fixture: gross },
];
type Capture = (typeof captures)[number];

export function latest(capture: Capture, source: string) {
  return capture.fixture.evidence.observations
    .filter((row) => row.sourceId === source)
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0]!;
}

export function replay(
  capture: Capture,
  cap: number,
  counter: number,
  online: number,
) {
  const warehouse = latest(capture, "warehouse").fields;
  const net =
    warehouse.semantics === "net_available" ? warehouse.quantity : null;
  const orders = Math.min(cap, online);
  const capacity = net === null ? null : Math.max(0, net - counter);
  return {
    counterFilled: net === null ? null : Math.min(counter, net),
    counterShort: net === null ? null : Math.max(0, counter - net),
    orders,
    turnedAway: online - orders,
    unfilled: capacity === null ? null : Math.max(0, orders - capacity),
    idle: capacity === null ? null : Math.max(0, capacity - orders),
    policy:
      net === null
        ? null
        : Math.max(0, net - capture.fixture.evidence.policy.inventory.buffer),
  };
}

export type StockPacket = "inspection" | "count";
export type Offer = 3 | 5 | 6;
export const stockCapture = (packet: StockPacket) => captures[packet === "inspection" ? 0 : 1]!;

export function StockProbe({packet, offer, selectPacket, selectOffer, lead}: {
  packet: StockPacket;
  offer: Offer | null;
  selectPacket: (p: StockPacket) => void;
  selectOffer: (n: Offer) => void;
  lead: string;
}) {
  const capture = stockCapture(packet);
  const stock = latest(capture, "warehouse").fields;
  const result = offer === null ? null : replay(capture, offer, 3, 8);
  const cafe = result?.idle == null ? null : Math.min(2, result.idle);
  return <section className="stock-scene" aria-labelledby="substitute-title">
    <p className="dispatch-kicker">At the pickup counter</p>
    <h2 id="substitute-title">Two loaner lamps for tonight</h2>
    <p>At four, Mina opens the carton and counts three lamps at the café. Two tables still need light. {lead} She can collect a pair in a different finish. The pickup counter and the website both sell that model from the same shelf.</p>
    <div className="stock-layout">
      <div>
        <label className="stock-label">Warehouse record
          <select value={packet} onChange={e => selectPacket(e.target.value as StockPacket)}>
            <option value="inspection">After inspection</option><option value="count">Before inspection</option>
          </select>
        </label>
        <p>{packet === "inspection" ? `The warehouse has cleared ${stock.quantity} lamps for sale. Four more are on an inspection shelf and already excluded.` : `Staff counted ${stock.quantity} lamps. The record does not say how many passed inspection.`}</p>
        <ol className="queue-strip" aria-label="Order of requests">
          <li><b>3</b>counter pickups</li><li><b>8</b>online requests</li><li><b>2</b>café loaners</li>
        </ol>
      </div>
      <div className="response-slip">
        <h3>How many lamps will you list online?</h3>
        <p>Honor the three pickups first. Shoppers can order up to your listing limit. The café can borrow what is left.</p>
        <div role="group" aria-label="Online listing limit" className="support-actions">
          {([3, 5, 6] as const).map(n => <button type="button" key={n} aria-pressed={offer === n} onClick={() => selectOffer(n)}>List {n}</button>)}
        </div>
        {result && <div role="status" className="allocation">
          <strong>{cafe === null ? "The café is waiting on inspection." : cafe === 2 ? "Both café tables can have a loaner." : "The café still needs two lamps."}</strong>
          <ul className="allocation-ledger" aria-label="Who can receive a lamp">
            {[
              { label: 'Counter pickups', demand: 3, filled: result.counterFilled },
              { label: 'Online shoppers', demand: 8, filled: result.unfilled === null ? null : result.orders - result.unfilled },
              { label: 'Café tables', demand: 2, filled: cafe },
            ].map(({label, demand, filled}) => <li key={label}>
              <span>{label}</span><b>{filled === null ? 'Unconfirmed' : `${filled} of ${demand}`}</b>
              <span className="allocation-marks" aria-hidden="true">{Array.from({length: demand}, (_, i) =>
                <i key={i} className={filled === null ? 'unknown' : i < filled ? 'filled' : ''}/>)}</span>
            </li>)}
          </ul>
          <p>The site accepts {result.orders} orders. {result.unfilled === null
            ? 'Fulfillment needs inspection results before confirming stock for any customer.'
            : <>{result.unfilled === 0 ? 'Each accepted order can ship.' : `Of those, ${result.unfilled} must wait.`} Another {result.turnedAway} shoppers cannot check out.</>}</p>
        </div>}
      </div>
    </div>
  </section>;
}
