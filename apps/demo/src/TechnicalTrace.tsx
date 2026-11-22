import baseline from "../examples/partial-shipment-faulty.json" with { type: "json" };
import reconciled from "../examples/partial-shipment-corrected.json" with { type: "json" };
import { evaluateScenario } from "./evaluator.ts";
import type { Variant } from "./types.ts";
import { supportDecision, type SupportAction } from "./CommerceCase.tsx";
import { StockProbe } from "./StockProbe.tsx";

export const trials = { original: baseline, reconciled };
export type Trial = keyof typeof trials;
export type Stage = "capture" | "balance" | "handoff";
const source =
  "https://github.com/SafetyMP/commerce-reliability-kit/blob/main/";
const stages: Record<Stage, string> = {
  capture: "Capture the records",
  balance: "Reconcile the line",
  handoff: "Hand off the exception",
};

export function TechnicalTrace({
  variant,
  action,
  stage,
  trial,
  selectStage,
  selectTrial,
  permalink,
}: {
  variant: Variant;
  action: SupportAction | null;
  stage: Stage;
  trial: Trial;
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
  const disposition = action ? supportDecision(selected, action) : null;
  return (
    <article className="trace">
      <p className="dispatch-kicker">Technical workspace · DEMO-1042</p>
      <h1>Trace the partial shipment</h1>
      <p>
        Follow the support desk’s selected capture from order line to connector
        output. Then compare it with two saved synthetic runs for the same
        order.
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
            </>
          ) : stage === "balance" ? (
            <>
              <h3>
                Line balance · {selected.metrics.outstanding ?? "Unknown"}
              </h3>
              <p>
                {selected.metrics.outstanding === null
                  ? "A handoff is visible, but the capture is partial. A defensible remaining quantity needs complete shipment coverage."
                  : "Subtract canceled and uniquely fulfilled units from the ordered quantity. Five ordered minus zero canceled and three handed off leaves two outstanding."}
              </p>
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
      <section aria-labelledby="trial-title">
        <h2 id="trial-title">Compare a saved connector run</h2>
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
          and trial. Worksheet edits stay in this visit.
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
      </section>
      <StockProbe />
    </article>
  );
}
