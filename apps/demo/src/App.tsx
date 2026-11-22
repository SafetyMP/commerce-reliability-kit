import { useEffect, useRef, useState } from "react";
import {
  CommerceCase,
  initialAssumptions,
  type SupportAction,
} from "./CommerceCase.tsx";
import { TechnicalTrace, type Stage, type Trial } from "./TechnicalTrace.tsx";
import type { Offer, StockPacket } from "./StockProbe.tsx";
import type { Variant } from "./types.ts";
import { initialView, observeHash, skipToMain } from "./navigation.ts";

type Selection = {
  variant: Variant;
  action: SupportAction | null;
  opened: boolean;
  stock: StockPacket;
  offer: Offer | null;
  stage: Stage;
  trial: Trial;
};
function readHash(hash: string): Selection {
  const q = new URLSearchParams(hash.split("?")[1]);
  const v = q.get("packet"),
    a = q.get("response"),
    s = q.get("stage");
  const offer = q.get("offer");
  return {
    opened: q.has("opened") || q.has("response") || q.has("packet"),
    stock: q.get("stock") === "count" ? "count" : "inspection",
    offer: offer === "3" || offer === "5" || offer === "6" ? Number(offer) as Offer : null,
    variant: v === "corrected" || v === "insufficient" ? v : "faulty",
    action: a === "close" || a === "follow" || a === "confirm" ? a : null,
    stage: s === "balance" || s === "handoff" || s === "stock" ? s : "capture",
    trial: q.get("trial") === "original" ? "original" : "reconciled",
  };
}
function link(view: string, state: Selection) {
  const query = new URLSearchParams({
    stock: state.stock,
    stage: state.stage,
    trial: state.trial,
  });
  if (state.opened) query.set("packet", state.variant);
  if (state.offer !== null) query.set("offer", String(state.offer));
  if (state.action) query.set("response", state.action);
  return "#" + view + "?" + query;
}
const hash = () => (typeof window === "undefined" ? "" : window.location.hash);
export function App() {
  const [view, setView] = useState(initialView);
  const [selected, setSelected] = useState(() => readHash(hash()));
  const [values, setValues] = useState(initialAssumptions);
  const [investment, setInvestment] = useState("");
  const main = useRef<HTMLElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const technicalHref = link("technical", selected);
  const change = (patch: Partial<Selection>) => {
    const next = { ...selected, ...patch };
    setSelected(next);
    window.history.replaceState(null, "", link(view, next));
  };
  useEffect(
    () =>
      observeHash(window, (nextView) => {
        setView(nextView);
        setSelected(readHash(hash()));
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
      <nav aria-label="Demo">
        <div>
          <b>Commerce Reliability Kit</b>
          <a href={view === "case" ? technicalHref : link("case", selected)}>
            {view === "case"
              ? "Technical workspace"
              : "Return to the order case"}
          </a>
        </div>
      </nav>
      <main id="main" ref={main} tabIndex={-1}>
        {view === "case" ? (
          <CommerceCase
            heading={heading}
            variant={selected.variant}
            opened={selected.opened}
            onOpen={() => change({ opened: true })}
            stock={selected.stock}
            offer={selected.offer}
            selectStock={(stock) => change({ stock })}
            selectOffer={(offer) => change({ offer })}
            onVariant={(variant) => change({ variant, action: null })}
            action={selected.action}
            onAction={(action) => change({ action })}
            values={values}
            onValues={setValues}
            technicalHref={technicalHref}
            investment={investment}
            onInvestment={setInvestment}
          />
        ) : (
          <TechnicalTrace
            {...selected}
            selectStock={(stock) => change({ stock })}
            selectOffer={(offer) => change({ offer })}
            selectVariant={(variant) => change({ variant, opened: true })}
            selectStage={(stage) => change({ stage })}
            selectTrial={(trial) => change({ trial })}
            permalink={technicalHref}
          />
        )}
      </main>
      <footer>
        Synthetic records ·{" "}
        <a href="https://github.com/SafetyMP/commerce-reliability-kit">
          Project source
        </a>
      </footer>
    </>
  );
}
