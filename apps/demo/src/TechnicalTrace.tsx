import baseline from "../examples/partial-shipment-faulty.json" with { type: "json" };
import reconciled from "../examples/partial-shipment-corrected.json" with { type: "json" };
import { evaluateScenario } from "./evaluator.ts";
import type { Variant } from "./types.ts";
import { supportDecision, type SupportAction } from "./CommerceCase.tsx";
import { stockCapture, latest, replay, type StockPacket, type Offer } from "./StockProbe.tsx";

export const trials = { original: baseline, reconciled };
export type Trial = keyof typeof trials;
export type Stage = "capture" | "balance" | "handoff" | "stock";
const source =
  "https://github.com/SafetyMP/commerce-reliability-kit/blob/main/";
const stages: Record<Stage, string> = {
  capture: "Capture the records",
  balance: "Reconcile the line",
  handoff: "Hand off the exception",
  stock: "Trace the loaner stock",
};

export function TechnicalTrace({
  variant,
  action,
  stage,
  trial,
  stock, offer, selectVariant, selectStock, selectOffer,
  selectStage,
  selectTrial,
  permalink,
}: {
  variant: Variant;
  action: SupportAction | null;
  stage: Stage;
  trial: Trial;
  stock: StockPacket;
  offer: Offer | null;
  selectVariant: (v: Variant) => void;
  selectStock: (p: StockPacket) => void;
  selectOffer: (n: Offer | null) => void;
  selectStage: (s: Stage) => void;
  selectTrial: (t: Trial) => void;
  permalink: string;
}) {
  const selected = evaluateScenario("partial-shipment", variant);
  const archive = trials[trial];
  const current = selected.assertions[0]!;
  const recorded = archive.assertions[0]!;
  const shipment = selected.observations.find(
    (row) => row.entityType === "shipment",
  );
  const coverage = selected.coverage.find(
    (row) => row.resource === "shipments",
  );
  const inventory = stockCapture(stock);
  const warehouse = latest(inventory, "warehouse");
  const listing = latest(inventory, "shop");
  const allocation = offer === null ? null : replay(inventory, offer, 3, 8);
  const disposition = action ? supportDecision(selected, action) : null;
  return (
    <article className="trace">
      <p className="dispatch-kicker">Technical workspace · DEMO-1042</p>
      <h1>Trace the partial shipment</h1>
      <p>
        Follow Jo’s order through the browser evaluator. Change the input and watch which conclusions the same rule can support. The loaner trace uses the separate warehouse record from Mina’s pickup scenario.
      </p>
      <section aria-labelledby="path-title">
        <h2 id="path-title">From shop record to support queue</h2>
        <div className="choices" role="group" aria-label="Trace stage">
          {(Object.keys(stages) as Stage[]).map((key) => (
            <button
              type="button"
              aria-pressed={stage === key}
              onClick={() => selectStage(key)}
              key={key}
            >
              {stages[key]}
            </button>
          ))}
        </div>
        <div className="trace-slip" aria-live="polite">
          {stage !== "stock" && <label className="stock-label">Order replay
            <select value={variant} onChange={e => selectVariant(e.target.value as Variant)}>
              <option value="faulty">First-handoff rule · full feed</option>
              <option value="corrected">Line reconciliation · full feed</option>
              <option value="insufficient">Line reconciliation · partial feed</option>
            </select>
          </label>}
          {stage === "capture" ? (
            <>
              <h3>Shop capture · {coverage?.status}</h3>
              <p>
                The order lists {selected.metrics.ordered} units. The capture
                contains{" "}
                {shipment?.entityType === "shipment"
                  ? shipment.fields.quantity
                  : 0}{" "}
                in the handoff. Shipment coverage is {coverage?.status}.
              </p>
              <p>
                Order and shipment come from the same shop feed. Neither is an
                independent warehouse confirmation.
              </p>
              <dl className="record-facts">
                <div><dt>Shop record</dt><dd>{shipment?.sourceRecordId}</dd></div>
                <div><dt>Snapshot</dt><dd>{coverage?.snapshotId}</dd></div>
                <div><dt>Pagination</dt><dd>{coverage?.pagination}</dd></div>
                <div><dt>Coverage declared by</dt><dd>{coverage?.completenessBasis}</dd></div>
              </dl>
            </>
          ) : stage === "balance" ? (
            <>
              <h3>
                Line balance · {selected.metrics.outstanding ?? "Unknown"}
              </h3>
              <p>
                {selected.metrics.outstanding === null
                  ? "A handoff is visible, but the capture is partial. A defensible remaining quantity needs complete shipment coverage."
                  : `${selected.metrics.ordered} ordered − ${selected.metrics.canceled} canceled − ${selected.metrics.fulfilled} uniquely handed off = ${selected.metrics.outstanding} outstanding.`}
              </p>
              <p>The evaluator groups shipment observations by source, shipment ID and order line. A retry with the same key counts once. It releases a balance only when the captures declare full coverage and all pages have been read.</p>
              {shipment?.entityType === "shipment" && <code>{[shipment.sourceId, shipment.fields.shipmentId, shipment.fields.lineId].join(" / ")}</code>}
            </>
          ) : stage === "stock" ? (
            <>
              <h3>Mina’s substitute · inventory mapping</h3>
              <div className="controls-row">
                <label>Warehouse record<select value={stock} onChange={e => selectStock(e.target.value as StockPacket)}><option value="inspection">After inspection</option><option value="count">Before inspection</option></select></label>
                <label>Case listing limit<select value={offer ?? ""} onChange={e => selectOffer(e.target.value === "" ? null : Number(e.target.value) as Offer)}><option value="">No listing chosen</option>{[3,5,6].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
              </div>
              <dl className="record-facts">
                <div><dt>Warehouse quantity</dt><dd>{warehouse.fields.quantity} · {warehouse.fields.semantics}</dd></div>
                <div><dt>Shop’s recorded listing</dt><dd>{listing.fields.quantity} · {listing.fields.semantics}</dd></div>
              </dl>
              <p>{warehouse.fields.semantics === "net_available" ? `The fixture’s publication rule subtracts its buffer of ${inventory.fixture.evidence.policy.inventory.buffer} from already-sellable stock. It does not deduct quarantined lamps again.` : "A gross count cannot supply a net sellable balance. The publication check cannot establish a supported listing from this capture."}</p>
              <p>{allocation ? `Your simulated listing accepts ${allocation.orders} orders. After the pickups, ${allocation.idle == null ? "the café’s allocation is unknown" : Math.min(2, allocation.idle) + " lamps are available for the café"}. The simulation does not write to the fixture.` : "Choose a case listing limit to replay the counter, website and café queue."}</p>
              <a href={source + "scenarios/" + inventory.fixture.id + ".json"}>Read the inventory fixture</a>
            </>
          ) : (
            <>
              <h3>
                {disposition?.assessment ?? "Support disposition pending"}
              </h3>
              <p>
                {disposition?.work ??
                  "Return to the order case and choose the next action for support. The resulting assignment will appear here."}
              </p>
              <p>
                The selected connector reports “{current.observed}”. An
                assertion checks the connector separately from the action
                support takes.
              </p>
            </>
          )}
        </div>
      </section>
      <details className="trial-archive" open={stage === "handoff" || undefined} key={stage === "handoff" ? "result" : "archive"}>
        <summary>Compare a saved connector run</summary>
        <div className="choices" role="group" aria-label="Saved run">
          {(["original", "reconciled"] as const).map((k) => (
            <button
              type="button"
              onClick={() => selectTrial(k)}
              aria-pressed={trial === k}
              key={k}
            >
              {k === "original" ? "First-handoff rule" : "Line reconciliation"}
            </button>
          ))}
          <a href={permalink}>Link to this comparison</a>
        </div>
        <p className="share-note">
          The comparison link saves this order’s packet, response, trace stage
          and trial, plus the loaner record and listing limit. Worksheet edits stay in this visit.
        </p>
        <table aria-live="polite">
          <caption>Order DEMO-1042 · selected case and saved run</caption>
          <thead>
            <tr>
              <th scope="col">Evidence</th>
              <th scope="col">Your case</th>
              <th scope="col">Saved run</th>
            </tr>
          </thead>
          <tbody>
            {[
              [
                "Shipment coverage",
                coverage?.status,
                archive.coverage.find((row) => row.resource === "shipments")
                  ?.status,
              ],
              [
                "Outstanding units",
                selected.metrics.outstanding ?? "Unknown",
                archive.metrics.outstanding,
              ],
              ["Connector output", current.observed, recorded.observed],
              ["Assertion", current.status, recorded.status],
            ].map(([name, a, b]) => (
              <tr key={String(name)}>
                <th scope="row">{name}</th>
                <td>{a}</td>
                <td>{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          {recorded.reason}{" "}
          {selected.evidenceIdentity === archive.evidenceIdentity
            ? "Both columns use the same source evidence."
            : "Your capture and the saved run have different evidence coverage."}
        </p>
        <details>
          <summary>Inspect identifiers and reproduce the check</summary>
          <p>
            Saved run at {archive.evaluationTime} · {recorded.id} ·{" "}
            {archive.ruleVersion}
          </p>
          <p>Evidence references: {recorded.evidence.join(", ")}.</p>
          <p>
            Run <code>npm --prefix apps/demo test</code> to compare the
            snapshots with the deterministic evaluator. These local fixture runs
            make no claim about a live connector.
          </p>
          <p>
            <a href={source + "apps/demo/src/evaluator.ts"}>
              Browser evaluator
            </a>{" "}
            ·{" "}
            <a href={source + "scenarios/partial-shipment.json"}>
              Related CLI scenario
            </a>{" "}
            ·{" "}
            <a href={source + "packages/report/index.ts"}>Report generation</a>
          </p>
        </details>
      </details>
      <a href={permalink}>Link to this technical view</a>
    </article>
  );
}
