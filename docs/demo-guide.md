# Demo walkthrough

The static browser demo has six synthetic fixtures: partial shipment, normal delay, missing order, inventory buffer, stale evidence, and duplicate shipment. Each provides faulty, corrected, and insufficient-evidence variants. No account, credentials, backend, or telemetry is involved. See [development](development.md) to run locally.

1. Search or filter the Library, then open the recommended partial-shipment card.
2. Run **Faulty example**. Inspect order `DEMO-1042`: 5 ordered, 3 fulfilled, 2 outstanding, and a failed completion assertion.
3. Use **Inspect supporting evidence** to read normalized order, shipment, and coverage records.
4. Select **Try corrected example** and run it. Partially fulfilled is the correct output; the assertion passes with the same source facts and policy.
5. Select **Compare runs** to inspect FAIL → PASS and confirm unchanged evidence, policy, and evaluation time.
6. Open the selected report and download **JSON report** or **HTML report**. HTML is standalone and dynamic values are escaped.

The corrected missing-order example can pass while the supported finding remains. Corrected stale evidence remains INCONCLUSIVE under its default policy; stale evidence is not a stock shortage. Inventory buffer compares expected publication after the target-unit buffer; changing policy can change conclusions. Insufficient variants change evidence and comparisons flag that difference. Unknown quantities are not zero.

Navigate directly with `#library`, `#workbench`, `#report`, or `#compare`. An unknown hash falls back to Library. Refresh retains the view but resets drafts and reports; report/comparison views show empty-state guidance until new runs exist. Hashes do not encode a scenario or saved report. The latest 12 reports remain only during the session; Reset demo clears everything.

Keyboard users can skip to main content, tab through native controls, inspect focused records, and scroll comparison tables. Visible focus and responsive layouts should be checked at desktop and narrow widths. Production browser acceptance must exercise search/filter, policy validation, actual downloads, refresh, back/forward, and operation with external requests blocked. Node tests cannot establish those browser behaviors.

The six-fixture evaluator is distinct from the full toolkit engine. [Architecture](architecture.md) and [limitations](limitations.md) describe their relationship. No real integration or physical stock accuracy is established.
