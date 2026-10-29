import { totalText } from './reports.ts';
import { variants } from './fixtures.ts';
import type { RunReport } from './types.ts';

export function escapeHTML(value: unknown): string {
  return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
const pre = (value: unknown) => `<pre>${escapeHTML(JSON.stringify(value, null, 2))}</pre>`;
export function renderHTML(report: RunReport): string {
  const e = escapeHTML;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${e(report.scenarioName)} · Local report</title>
<style>
:root{font-family:system-ui,sans-serif;color:#202e2c;background:#f6f5f0;line-height:1.6}body{max-width:960px;margin:auto;padding:32px 24px}h1{font-size:2rem;line-height:1.2;letter-spacing:-.035em}h2{margin-top:2rem;font-size:1.3rem}h3{font-size:1rem}section,article{background:white;border:1px solid #d9dfda;border-radius:10px;padding:20px;margin:16px 0}p,dd,td,th{overflow-wrap:anywhere}header>p:first-child{color:#164e48;font-weight:700}pre{font:12px/1.6 ui-monospace,monospace;background:#f2f4f1;padding:16px;white-space:pre-wrap;overflow-wrap:anywhere;border-radius:6px}dl{display:grid;grid-template-columns:minmax(110px,1fr) 3fr;gap:8px}dt{font-weight:600}dd{margin:0}table{border-collapse:collapse;width:100%;text-align:left}td,th{padding:12px 8px;border-bottom:1px solid #d9dfda;vertical-align:top}.table{overflow:auto}.status{font-weight:700}summary{cursor:pointer;font-weight:600;padding:8px}summary:focus-visible{outline:3px solid #164e48;outline-offset:3px}li{margin:8px 0}.muted{color:#52625c}@media(max-width:600px){body{padding:20px 12px}h1{font-size:1.7rem}section,article{padding:14px}dl{grid-template-columns:1fr}dd{margin-bottom:10px}table{min-width:460px}}@media print{body{max-width:none;padding:0}pre{font-size:10px}details{break-inside:avoid}}
</style></head><body>
<header><p>Synthetic demo · No connected accounts</p><p>COMMERCE RELIABILITY KIT / RUN REPORT</p><h1>${e(report.scenarioName)}</h1><p>${e(variants[report.variant])} · ${e(report.runMode)}</p></header>
<section><h2>Run context</h2><dl><dt>Scenario</dt><dd>${e(report.scenarioId)} / ${e(report.scenarioVersion)}</dd><dt>Rule version</dt><dd>${e(report.ruleVersion)}</dd><dt>Profile version</dt><dd>${e(report.profileVersion)}</dd><dt>Evaluation time</dt><dd>${e(report.evaluationTime)} (fixed fixture time)</dd></dl><h3>Selected policy</h3>${pre(report.policy)}<h3>Derived facts</h3>${pre(report.metrics)}</section>
<section><h2>Assertion verdicts</h2><p>${e(totalText(report))}</p><p class="muted">Assertions judge the example output; they are not a reliability score. An expected missing-order diagnosis can pass.</p>
${report.assertions.map(a => `<article><h3 class="status">${e(a.status)} — ${e(a.title)}</h3><dl><dt>Expected</dt><dd>${e(a.expected)}</dd><dt>Observed output</dt><dd>${e(a.observed)}</dd></dl><p>${e(a.reason)}</p><p>Supporting IDs: ${e(a.evidence.join(', '))}</p></article>`).join('')}</section>
<section><h2>Operational findings</h2><p>Supported source facts, separate from assertion verdicts.</p>${report.findings.length ? report.findings.map(f => `<article><h3>${e(f.severity)} — ${e(f.title)}</h3><p>${e(f.detail)}</p><p>Supporting IDs: ${e(f.evidence.join(', '))}</p></article>`).join('') : '<p>No supported operational findings under the selected policy.</p>'}</section>
<section><h2>Evidence coverage</h2><p>Completeness is declared. A complete scope can still be stale or contain an unknown quantity.</p><div class="table"><table><thead><tr><th>Source / resource</th><th>Observed at</th><th>Scope status</th><th>Pagination</th></tr></thead><tbody>${report.coverage.map(c => `<tr><td>${e(c.sourceId)} / ${e(c.resource)}</td><td>${e(c.observedAt)}</td><td>${e(c.status)}</td><td>${e(c.pagination)}</td></tr>`).join('')}</tbody></table></div>${report.coverage.map(c => `<details><summary>${e(c.id)} — normalized scope</summary>${pre(c)}</details>`).join('')}</section>
<section><h2>Supporting records</h2><p>Source event time is separate from observation time. An absent event timestamp is unknown, not the capture time.</p>${report.observations.map(o => `<article><h3>${e(o.id)}</h3><dl><dt>Source event</dt><dd>${e(o.eventTime ?? 'Unknown / not supplied')}</dd><dt>Observed at</dt><dd>${e(o.observedAt)}</dd></dl>${pre(o)}</article>`).join('')}</section>
<section><h2>Limitations</h2><ul>${report.limitations.map(l => `<li>${e(l)}</li>`).join('')}</ul><p>PASS: sufficient evidence satisfies the assertion. FAIL: sufficient evidence contradicts it. INCONCLUSIVE: required evidence is missing, stale, ambiguous or incomplete. NOT APPLICABLE: declared prerequisites do not apply.</p></section>
<details><summary>Full selected report, including evidence and policy identities</summary>${pre(report)}</details>
<footer><p>Local fixture evaluation. No uploads, connected accounts or production verification.</p></footer></body></html>`;
}
export interface ExportArtifact { filename: string; mime: string; content: string }
export function createExport(report: RunReport, format: 'json' | 'html'): ExportArtifact {
  if (!report?.assertions?.length || !report.observations || !report.coverage) throw new Error('The selected report is incomplete. Run the example again before exporting.');
  const name = `${report.scenarioId}-${report.variant}`.replace(/[^a-zA-Z0-9-]/g, '-');
  return { filename: `commerce-demo-${name}.${format}`, mime: format === 'json' ? 'application/json;charset=utf-8' : 'text/html;charset=utf-8',
    content: format === 'json' ? JSON.stringify(report, null, 2) : renderHTML(report) };
}
/** Call only from a user gesture. Resources are released even if the browser rejects a download. */
export function downloadExport(artifact: ExportArtifact): void {
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([artifact.content], { type: artifact.mime }));
  let requested = false;
  try {
    link.href = url; link.download = artifact.filename; document.body.append(link); link.click();
    requested = true;
  } finally {
    link.remove();
    // The browser may consume the blob after click() returns. This is resource
    // cleanup, not simulated progress or confirmation that a file was saved.
    if (requested) setTimeout(() => URL.revokeObjectURL(url), 1000);
    else URL.revokeObjectURL(url);
  }
}
