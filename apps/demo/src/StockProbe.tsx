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
    <p>{lead} At four, Mina counts three lamps in her carton. She asks if she can borrow two in another finish.</p>
    <div className="stock-layout">
      <div>
        <p className="stock-reading">{packet === "inspection" ? `${stock.quantity} loaner lamps cleared for sale.` : `${stock.quantity} on the shelf. Sellable quantity unknown.`} Three pickups come first, then eight web requests, then Mina.</p>
        <h3 id="listing-question">How many lamps will you list online?</h3>
        <div role="group" aria-labelledby="listing-question" className="support-actions">
          {([3, 5, 6] as const).map(n => <button type="button" key={n} aria-pressed={offer === n} onClick={() => selectOffer(n)}>List {n}</button>)}
        </div>
        <details className="stock-alternate"><summary>Change the stock record</summary>
          <label className="stock-label">Warehouse record
            <select value={packet} onChange={e => selectPacket(e.target.value as StockPacket)}>
              <option value="inspection">After inspection</option><option value="count">Before inspection</option>
            </select>
          </label>
          <p>{packet === "inspection" ? 'Four quarantined lamps are already excluded.' : 'Staff counted all lamps together, including any awaiting inspection.'}</p>
        </details>
      </div>
      <div className="response-slip allocation" aria-live="polite" aria-atomic="true">
        <h3>{result === null ? 'Who is waiting for lamps?' : cafe === null ? 'The café is waiting on inspection.' : cafe === 2 ? 'Both café tables can have a loaner.' : 'The café still needs two lamps.'}</h3>
        <ul className="allocation-ledger" aria-label="Lamps available for each group">
          {[
            { label: 'Counter pickups', demand: 3, filled: result?.counterFilled },
            { label: 'Online shoppers', demand: 8, filled: result?.unfilled == null ? null : result.orders - result.unfilled },
            { label: 'Café tables', demand: 2, filled: cafe },
          ].map(({label, demand, filled}) => <li key={label}>
            <span>{label}</span><b>{!result ? `${demand} requested` : filled == null ? 'Unconfirmed' : `${filled} of ${demand} filled`}</b>
            <span className="allocation-marks" aria-hidden="true">{Array.from({length: demand}, (_, i) =>
              <i key={i} className={filled == null ? 'unknown' : i < filled ? 'filled' : ''}/>)}</span>
          </li>)}
        </ul>
        {result && <p>{result.orders} web orders accepted. {result.unfilled === null
          ? 'Inspection will establish how many can ship.'
          : <>{result.unfilled === 0 ? 'All can ship.' : `${result.unfilled} must wait.`} {result.turnedAway} shoppers cannot check out.</>}</p>}
      </div>
    </div>
  </section>;
}
