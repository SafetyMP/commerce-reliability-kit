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
  capture: "Capture",
  balance: "Line balance",
  handoff: "Support handoff",
  stock: "Loaner stock",
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
  const orderFinding = selected.findings.find(finding => finding.id === "fulfillment.partial");
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
  const handedOff = shipment?.entityType === "shipment" ? shipment.fields.quantity : null;
  const fullFeed = variant !== "insufficient";
  return (
    <article className="trace">
      <p className="dispatch-kicker">Technical workspace · DEMO-1042</p>
      <h1>Trace the partial shipment</h1>
      <p>The kit turns Jo’s ticket into a repeatable test. It derives the expected order status from captured records, then checks the connector’s output against it.</p>
      <section aria-label="Trace Jo’s order or Mina’s loaners">
        <div className="choices" role="group" aria-label="Trace stage">
          {(Object.keys(stages) as Stage[]).map((key) =>
            <button type="button" aria-pressed={stage === key} onClick={() => selectStage(key)} key={key}>
              {stages[key]}
            </button>)}
        </div>
        <div className="trace-slip">
          {(stage === "capture" || stage === "balance") && <>
            <h2>Shipment feed</h2>
            <div className="choices" role="group" aria-label="Shipment feed">
              <button type="button" aria-pressed={fullFeed}
                onClick={() => { if (!fullFeed) selectVariant("corrected"); }}>Complete feed</button>
              <button type="button" aria-pressed={!fullFeed}
                onClick={() => { if (fullFeed) selectVariant("insufficient"); }}>Partial feed</button>
            </div>
            {!fullFeed && <p>Restoring the complete feed uses the line-reconciliation rule.</p>}
          </>}
          {stage === "capture" && <>
            <div role="status">
              <h3>{selected.metrics.ordered} ordered · {handedOff ?? "Unknown"} recorded in the handoff</h3>
              <p>{fullFeed ? "All pages of the shop’s shipment record were captured." : "Only some pages were captured. Other handoffs are unknown."}</p>
            </div>
            <details>
              <summary>Inspect the shop snapshot</summary>
              <p>Both records come from the shop. Independent warehouse confirmation requires a separate source.</p>
              <dl className="record-facts">
                <div><dt>Shop record</dt><dd>{shipment?.sourceRecordId}</dd></div>
                <div><dt>Snapshot</dt><dd>{coverage?.snapshotId}</dd></div>
                <div><dt>Pagination</dt><dd>{coverage?.pagination}</dd></div>
                <div><dt>Coverage declared by</dt><dd>{coverage?.completenessBasis}</dd></div>
              </dl>
            </details>
          </>}
          {stage === "balance" && <>
            <div role="status">
              <h3>Line balance · {selected.metrics.outstanding ?? "Unknown"}</h3>
              <p>{selected.metrics.outstanding === null
                ? "A missing page could contain another handoff. The remaining quantity stays unknown."
                : `${selected.metrics.ordered} ordered − ${selected.metrics.canceled} canceled − ${selected.metrics.fulfilled} handed off = ${selected.metrics.outstanding} outstanding.`}</p>
            </div>
            <details>
              <summary>Inspect the reconciliation rule</summary>
              <p>The evaluator counts each source, shipment ID and order line once. It calculates the balance when all pages are captured and every shipment quantity is present.</p>
              {shipment?.entityType === "shipment" && <code>{[shipment.sourceId, shipment.fields.shipmentId, shipment.fields.lineId].join(" / ")}</code>}
            </details>
          </>}
          {stage === "handoff" && <>
            <label className="stock-label">Order replay
              <select value={variant} onChange={e => selectVariant(e.target.value as Variant)}>
                <option value="faulty">First-handoff rule · full feed</option>
                <option value="corrected">Line reconciliation · full feed</option>
                <option value="insufficient">Line reconciliation · partial feed</option>
              </select>
            </label>
            <div role="status">
              <h3>Connector assertion · {current.status}</h3>
              <p><strong>Order finding</strong> · {orderFinding?.detail ?? "The captured pages leave the order balance unknown."}</p>
              <dl className="record-facts">
                <div><dt>Expected order status</dt><dd>{current.expected}</dd></div>
                <div><dt>Connector output</dt><dd>{current.observed}</dd></div>
              </dl>
              <p>{current.reason}</p>
            </div>
            <details>
              <summary>Jo’s follow-up</summary>
              {disposition ? <p><strong>{disposition.assessment}.</strong> {disposition.work}</p> :
                <p>Choose a response in the order case to assign the next step.</p>}
            </details>
          </>}
          {stage === "stock" && <>
            <label className="stock-label">Warehouse record
              <select value={stock} onChange={e => selectStock(e.target.value as StockPacket)}>
                <option value="inspection">After inspection</option><option value="count">Before inspection</option>
              </select>
            </label>
            <div role="status">
              <h3>{warehouse.fields.quantity} {warehouse.fields.semantics === "net_available" ? "sellable loaner lamps" : "lamps counted · sellable stock unknown"}</h3>
              <p>{allocation ? `With ${allocation.orders} online orders after three counter pickups, ${allocation.idle == null ? "the café’s allocation is unknown" : Math.min(2, allocation.idle) + " lamps are available for the café"}.` :
                "Choose a listing limit to see how many loaners Mina can collect."}</p>
            </div>
            <details>
              <summary>Change the listing limit</summary>
              <label className="stock-label">Case listing limit
                <select value={offer ?? ""} onChange={e => selectOffer(e.target.value === "" ? null : Number(e.target.value) as Offer)}>
                  <option value="">No listing chosen</option>
                  {[3,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            </details>
            <details>
              <summary>Inspect the inventory mapping</summary>
              <dl className="record-facts">
                <div><dt>Warehouse quantity</dt><dd>{warehouse.fields.quantity} · {warehouse.fields.semantics}</dd></div>
                <div><dt>Shop’s recorded listing</dt><dd>{listing.fields.quantity} · {listing.fields.semantics}</dd></div>
              </dl>
              <p>{warehouse.fields.semantics === "net_available" ? `The fixture deducts a buffer of ${inventory.fixture.evidence.policy.inventory.buffer} from sellable stock. Inspection holds are already excluded.` : "The gross count includes stock awaiting inspection. A net publication quantity cannot be calculated."}</p>
              <p>The listing simulation reads this separate inventory fixture. <a href={source + "scenarios/" + inventory.fixture.id + ".json"}>Stock fixture</a></p>
            </details>
          </>}
        </div>
      </section>
      <details className="trial-archive">
        <summary>Compare a saved connector run</summary>
        <p>Engineering can replay the same shipment after a connector change. The saved runs hold the order records and evaluation time fixed.</p>
        <div className="choices" role="group" aria-label="Saved run">
          {(["original", "reconciled"] as const).map(k =>
            <button type="button" onClick={() => selectTrial(k)} aria-pressed={trial === k} key={k}>
              {k === "original" ? "First-handoff rule" : "Line reconciliation"}
            </button>)}
        </div>
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
              ["Expected order status", current.expected, recorded.expected],
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
            Saved synthetic run at {archive.evaluationTime} · {recorded.id} ·{" "}
            {archive.ruleVersion}
          </p>
          <p>Evidence IDs · {recorded.evidence.join(", ")}.</p>
          <p>
            Run <code>npm --prefix apps/demo test</code> to check the saved assertions against the browser evaluator. These fixtures exercise a synthetic connector.
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
