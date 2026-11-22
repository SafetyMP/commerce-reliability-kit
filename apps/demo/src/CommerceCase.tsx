import { useState } from "react";
import quarantine from "../../../scenarios/damaged-quarantine.json" with { type: "json" };
import gross from "../../../scenarios/gross-versus-net.json" with { type: "json" };
import buffered from "../../../scenarios/publication-buffer.json" with { type: "json" };

export const captures = [
  { label: "Inspection hold", fixture: quarantine },
  { label: "Cycle count", fixture: gross },
  { label: "Regular replenishment", fixture: buffered },
];
type Capture = (typeof captures)[number];

function latest(capture: Capture, source: string) {
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

function Shelf({ units, label }: { units: number; label: string }) {
  return (
    <figure className="shelf">
      <div aria-hidden="true">
        {Array.from({ length: units }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

type Ticket = {
  label: string;
  cap: number;
  counter: number;
  online: number;
  result: ReturnType<typeof replay>;
};

export function useStockDesk() {
  const [index, setIndex] = useState(0);
  const [cap, setCap] = useState(6);
  const [counter, setCounter] = useState(3);
  const [online, setOnline] = useState(8);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const capture = captures[index]!;
  const warehouse = latest(capture, "warehouse");
  const shop = latest(capture, "shop");
  const buffer = capture.fixture.evidence.policy.inventory.buffer;
  function selectCapture(value: number) {
    const next = captures[value]!;
    setIndex(value);
    setCap(latest(next, "shop").fields.quantity);
  }
  function run() {
    setTickets((current) =>
      [
        {
          label: capture.label,
          cap,
          counter,
          online,
          result: replay(capture, cap, counter, online),
        },
        ...current,
      ].slice(0, 2),
    );
  }
  return {
    index,
    cap,
    setCap,
    counter,
    setCounter,
    online,
    setOnline,
    tickets,
    capture,
    warehouse,
    shop,
    buffer,
    selectCapture,
    run,
  };
}

export function CommerceCase({
  desk,
}: {
  desk: ReturnType<typeof useStockDesk>;
}) {
  const {
    index,
    cap,
    setCap,
    counter,
    setCounter,
    online,
    setOnline,
    tickets,
    warehouse,
    shop,
    buffer,
    selectCapture,
    run,
  } = desk;
  return (
    <>
      <header className="lead">
        <p className="overline">Retail operations / channel inventory</p>
        <h1>The stock promise desk</h1>
        <p>
          Set the storefront limit before the next pickup rush. Two systems
          describe the same shelf. Which number would you put in front of a
          shopper?
        </p>
      </header>
      <div className="workfloor">
        <section className="evidence" aria-labelledby="source-label">
          <div className="section-title">
            <h2 id="source-label">Receiving records</h2>
            <span>Dock 01</span>
          </div>
          <label className="select-label">
            Receiving packet
            <select
              value={index}
              onChange={(e) => selectCapture(Number(e.target.value))}
            >
              {captures.map((c, i) => (
                <option key={c.label} value={i}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <article className="stockcard">
            <div className="stamp">
              Warehouse extract{" "}
              <time>{warehouse.observedAt.slice(11, 16)} UTC</time>
            </div>
            <div className="readout">
              <strong>{warehouse.fields.quantity}</strong>
              <span>
                {warehouse.fields.semantics === "net_available"
                  ? "Net sellable"
                  : "On hand"}
                <small>Each · Main location · {warehouse.fields.itemId}</small>
              </span>
            </div>
            <Shelf
              units={warehouse.fields.quantity}
              label="One carton per unit in the warehouse extract."
            />
            <p>
              {index === 0
                ? "Inspection note: four quarantined units were excluded before this extract was issued."
                : index === 1
                  ? "Count sheet includes all stock at the location. The available, committed and held quantities were not supplied."
                  : "This replenishment record reports units available after warehouse holds."}
            </p>
          </article>
          <article className="shopcard">
            <div className="stamp">
              Storefront snapshot{" "}
              <time>{shop.observedAt.slice(11, 16)} UTC</time>
            </div>
            <p>
              <strong>{shop.fields.quantity}</strong> currently offered online ·{" "}
              {shop.fields.itemId}
            </p>
          </article>
          <details>
            <summary>Check the mapping and publication rule</summary>
            <p>
              Warehouse P1 maps to storefront P2 at Main, one each for one each.
              The fixture’s policy keeps a {buffer}-unit buffer on comparable
              net sellable stock, with a floor of zero.
            </p>
          </details>
        </section>
        <section className="controls" aria-labelledby="release-label">
          <div className="section-title">
            <h2 id="release-label">Set the next offer</h2>
            <span>Storefront</span>
          </div>
          <label className="cap" htmlFor="online-limit">
            Online listing limit <span aria-hidden="true">{cap} units</span>
            <input
              id="online-limit"
              type="range"
              min="0"
              max="16"
              value={cap}
              onChange={(e) => setCap(Number(e.target.value))}
            />
          </label>
          <div className="scale">
            <span>Pause online · 0</span>
            <span>16 units</span>
          </div>
          <fieldset>
            <legend>Replay a rush</legend>
            <p>
              The counter draws first. Online checkout then accepts orders up to
              your listing limit.
            </p>
            <div className="demands">
              {[
                {
                  label: "Counter pickups",
                  value: counter,
                  update: setCounter,
                },
                { label: "Online requests", value: online, update: setOnline },
              ].map(({ label, value, update }) => (
                <label key={label}>
                  {label}
                  <select
                    value={value}
                    onChange={(e) => update(Number(e.target.value))}
                  >
                    {Array.from({ length: 17 }, (_, n) => (
                      <option key={n} value={n}>
                        {n} units
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
          <button className="publish" type="button" onClick={run}>
            Run this offer <span aria-hidden="true">→</span>
          </button>
          <p className="caption">
            Illustrative demand replay. No inventory or orders are written.
          </p>
        </section>
      </div>
      <section className="tape" aria-labelledby="tape-label">
        <div className="section-title">
          <h2 id="tape-label">Dispatch tape</h2>
          <span>Last two runs</span>
        </div>
        <div aria-live="polite">
          {tickets.length === 0 ? (
            <p>
              Run an offer to print its dispatch record. Change one setting and
              run again to compare.
            </p>
          ) : (
            tickets.map((t, i) => (
              <article className="receipt" key={i}>
                <div>
                  <b>
                    {i === 0 ? "Latest run" : "Previous run"} · {t.label}
                  </b>
                  <p>
                    Limit {t.cap} · Counter {t.counter} · Online {t.online}
                  </p>
                </div>
                <dl>
                  {[
                    ["Orders accepted", t.result.orders],
                    ["Demand turned away", t.result.turnedAway],
                    ["Unfilled promises", t.result.unfilled],
                    ["Sellable units left", t.result.idle],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <dt>{label}</dt>
                      <dd>{value ?? "Unknown"}</dd>
                    </div>
                  ))}
                </dl>
                <p>
                  {t.result.policy === null
                    ? "Reconciliation open. Request a net sellable extract before confirming what can ship."
                    : "The fixture’s publication rule supports " +
                      t.result.policy +
                      " units before pickups. Your offer is " +
                      (t.cap === t.result.policy
                        ? "at that limit."
                        : Math.abs(t.cap - t.result.policy) +
                          " units " +
                          (t.cap > t.result.policy ? "above" : "below") +
                          " it.")}
                </p>
              </article>
            ))
          )}
        </div>
      </section>
    </>
  );
}
