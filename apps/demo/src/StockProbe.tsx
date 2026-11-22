import { useState } from "react";
import quarantine from "../../../scenarios/damaged-quarantine.json" with { type: "json" };
import gross from "../../../scenarios/gross-versus-net.json" with { type: "json" };

export const captures = [
  { label: "Inspection hold", fixture: quarantine },
  { label: "Cycle count", fixture: gross },
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

export function StockProbe() {
  const [packet, setPacket] = useState(0);
  const [cap, setCap] = useState(6);
  const capture = captures[packet]!;
  const result = replay(capture, cap, 3, 8);
  const stock = latest(capture, "warehouse").fields;
  return (
    <details className="stock-probe">
      <summary>Before promising a replacement, test the stock evidence</summary>
      <p>
        The order feed establishes handoffs. A separate warehouse capture is
        needed to offer replacement stock. Try the kit’s inspection-hold or
        cycle-count fixture with three counter pickups and eight online
        requests. These captures illustrate a different item, not inventory
        evidence for DEMO-1042.
      </p>
      <div className="controls-row">
        <label>
          Warehouse capture
          <select
            value={packet}
            onChange={(e) => setPacket(Number(e.target.value))}
          >
            {captures.map((c, i) => (
              <option key={c.label} value={i}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Online offer
          <select value={cap} onChange={(e) => setCap(Number(e.target.value))}>
            {[0, 4, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n} units
              </option>
            ))}
          </select>
        </label>
      </div>
      <p role="status">
        {stock.quantity}{" "}
        {stock.semantics === "net_available" ? "net sellable" : "on hand"} ·{" "}
        {result.orders} online accepted · {result.unfilled ?? "Unknown"}{" "}
        unfilled · {result.idle ?? "Unknown"} sellable units left.
      </p>
      <a
        href={
          "https://github.com/SafetyMP/commerce-reliability-kit/blob/main/scenarios/" +
          capture.fixture.id +
          ".json"
        }
      >
        Inspect the stock fixture
      </a>
    </details>
  );
}
