import { useEffect, useRef, useState } from "react";
import { CommerceCase, useStockDesk } from "./CommerceCase.tsx";
import { initialView, observeHash, skipToMain } from "./navigation.ts";

const root = "https://github.com/SafetyMP/commerce-reliability-kit/blob/main/";
const references = [
  [
    "Inputs",
    "Offline captures",
    "CSV, JSON and JSONL importers normalize source records and coverage declarations.",
    "packages/importers/index.ts",
  ],
  [
    "Rules",
    "Deterministic checks",
    "The core evaluates mappings, capture freshness and inventory policy at an explicit evaluation time.",
    "packages/core/index.ts",
  ],
  [
    "Evidence",
    "Reviewable reports",
    "The CLI emits results with evidence references. The reporting package renders HTML and JUnit and compares runs.",
    "packages/report/index.ts",
  ],
];

export function App() {
  const [view, setView] = useState(initialView);
  const desk = useStockDesk();
  const main = useRef<HTMLElement>(null);
  useEffect(
    () =>
      observeHash(window, (next) => {
        setView(next);
        main.current?.focus();
        window.scrollTo(0, 0);
      }),
    [],
  );
  return (
    <>
      <a className="skip" href="#main" onClick={(e) => skipToMain(e, document)}>
        Skip to content
      </a>
      <nav>
        <div>
          <b>Commerce Reliability Kit</b>
          <a href={view === "case" ? "#technical" : "#case"}>
            {view === "case" ? "Technical reference" : "Stock promise desk"}{" "}
            <span aria-hidden="true">↗</span>
          </a>
        </div>
      </nav>
      <main id="main" ref={main} tabIndex={-1}>
        {view === "case" && <CommerceCase desk={desk} />}
        {view === "technical" && (
          <section className="reference">
            <p className="overline">
              Commerce Reliability Kit / implementation
            </p>
            <h1>Technical reference</h1>
            <p>
              The case reads three checked-in inventory fixtures. Demand and
              checkout are simulated in the browser. Use the CLI to reproduce
              the kit’s inventory checks.
            </p>
            <dl>
              {references.map(([key, title, body, path]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>
                    <a href={root + path}>{title}</a>
                    <p>{body}</p>
                  </dd>
                </div>
              ))}
            </dl>
            <h2>Reproduce one capture</h2>
            <code>
              npm run build
              <br />
              node dist/packages/cli/index.js demo damaged-quarantine
            </code>
            <p>
              <a href={root + "scenarios/damaged-quarantine.json"}>
                Fixture and expected assertions
              </a>{" "}
              · <a href={root + "docs/limitations.md"}>Evaluator limits</a>
            </p>
          </section>
        )}
      </main>
      <footer>
        Synthetic records · Offline simulation ·{" "}
        <a href="https://github.com/SafetyMP/commerce-reliability-kit">
          Project source
        </a>
      </footer>
    </>
  );
}
