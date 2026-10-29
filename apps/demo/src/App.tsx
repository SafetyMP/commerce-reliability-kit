import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { evaluateScenario, policyLabels, resolvePolicy } from './evaluator.ts';
import { getScenario, scenarios, sourceFacts, variants } from './fixtures.ts';
import { compareRuns, HISTORY_LIMIT, saveRun, totalText } from './reports.ts';
import { createExport, downloadExport } from './export.ts';
import { identity } from './identity.ts';
import { Empty, EvidencePanel, Icon, MetricFacts, PolicyFacts, ResultStrip, StatusBadge } from './components.tsx';
import type { IconName } from './components.tsx';
import type { Category, Policy, PolicyKey, RunReport, SavedRun, ScenarioId, Variant } from './types.ts';

import { initialView, observeHash, skipToMain } from './navigation.ts';
import type { View } from './navigation.ts';
const navigation: { id: View; label: string; icon: IconName }[] = [
  { id: 'library', label: 'Library', icon: 'library' }, { id: 'workbench', label: 'Workbench', icon: 'workbench' },
  { id: 'report', label: 'Run report', icon: 'report' }, { id: 'compare', label: 'Compare', icon: 'compare' },
];
const policyStrings = (policy: Policy) => Object.fromEntries(Object.entries(policy).map(([k, v]) => [k, String(v)]));
const message = (error: unknown) => error instanceof Error ? error.message : 'An unexpected local error occurred.';

export function App() {
  const [view, setView] = useState<View>(initialView);
  const [scenarioId, setScenarioId] = useState<ScenarioId>('partial-shipment');
  const [variant, setVariant] = useState<Variant>('faulty');
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'All'>('All');
  const [history, setHistory] = useState<SavedRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<number | null>(null);
  const [beforeId, setBeforeId] = useState<number | null>(null);
  const [afterId, setAfterId] = useState<number | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<string | null>(null);
  const [runError, setRunError] = useState('');
  const [exportError, setExportError] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [about, setAbout] = useState(false);
  const sequence = useRef(1);
  const heading = useRef<HTMLHeadingElement>(null);
  const didMount = useRef(false);
  const scenario = getScenario(scenarioId);
  const selected = history.find(r => r.sequence === selectedRun) ?? history.at(-1);
  const report = selected?.report;
  const latestForScenario = [...history].reverse().find(r => r.report.scenarioId === scenarioId);
  const before = history.find(r => r.sequence === beforeId);
  const after = history.find(r => r.sequence === afterId);
  const comparison = before && after ? compareRuns(before.report, after.report) : null;
  let policy: Policy = {}, policyError = '';
  try {
    const raw: Policy = {};
    for (const key of Object.keys(scenario.defaults) as PolicyKey[]) {
      const input = inputs[key] ?? String(scenario.defaults[key]);
      if (!input.trim()) throw new Error(`${policyLabels[key]} is required. Enter a nonnegative whole number.`);
      raw[key] = Number(input);
    }
    policy = resolvePolicy(scenarioId, raw);
  } catch (error) { policyError = message(error); }
  const draftChanged = latestForScenario && (latestForScenario.report.variant !== variant || identity(latestForScenario.report.policy) !== identity(policy) || Boolean(policyError));

  useEffect(() => {
    document.title = `${navigation.find(n => n.id === view)!.label} · Commerce Reliability Kit`;
    if (didMount.current) heading.current?.focus();
    didMount.current = true;
    // Preserve focus on the saved-run select when its value changes. Move to
    // the heading only when navigating to a view or a different workbench.
  }, [view, scenarioId]);

  useEffect(() => observeHash(window, next => {
    setView(next); setSelectedEvidence(null); setExportError('');
  }), []);

  function navigate(next: View) {
    setView(next); setSelectedEvidence(null); setExportError('');
    if (window.location.hash !== `#${next}`) window.location.hash = next;
  }
  function chooseScenario(id: ScenarioId) {
    setScenarioId(id); setVariant('faulty'); setInputs(policyStrings(getScenario(id).defaults));
    setRunError(''); navigate('workbench');
  }
  function run(event: FormEvent) {
    event.preventDefault();
    if (policyError) { setRunError(policyError); return; }
    try {
      const result = evaluateScenario(scenarioId, variant, policy);
      const number = sequence.current++;
      setHistory(previous => saveRun(previous, result, number)); setSelectedRun(number);
      setRunError(''); setAnnouncement(`Run ${number} saved. ${totalText(result)}.`); navigate('report');
    } catch (error) { setRunError(message(error)); }
  }
  function editExample(source: RunReport, nextVariant: Variant) {
    setScenarioId(source.scenarioId); setVariant(nextVariant); setInputs(policyStrings(source.policy));
    setRunError(''); navigate('workbench');
  }
  function openCompare() {
    const current = selected ?? history.at(-1);
    const candidates = history.filter(r => r.report.scenarioId === current?.report.scenarioId && r.sequence !== current?.sequence);
    const prior = [...candidates].reverse().find(r => r.report.variant === 'faulty') ?? candidates.at(-1);
    setBeforeId(prior?.sequence ?? null); setAfterId(current?.sequence ?? null); navigate('compare');
  }
  function clearHistory() {
    setHistory([]); setSelectedRun(null); setBeforeId(null); setAfterId(null); setSelectedEvidence(null);
    setExportError(''); setAnnouncement('Run history cleared. All local report snapshots have been removed.');
  }
  function reset() {
    clearHistory(); setScenarioId('partial-shipment'); setVariant('faulty'); setInputs({});
    setQuery(''); setCategory('All'); setRunError(''); setAbout(false); sequence.current = 1;
    setAnnouncement('Demo reset. Drafts and in-memory reports cleared.'); navigate('library');
  }
  function exportSelected(format: 'json' | 'html') {
    if (!report) return;
    try {
      const artifact = createExport(report, format); downloadExport(artifact); setExportError('');
      setAnnouncement(`${format.toUpperCase()} download requested for run ${selected!.sequence}. Check your browser downloads.`);
    } catch (error) {
      setExportError(`Report export failed: ${message(error)} Your saved run is intact. Retry the download or rerun this example.`);
    }
  }
  function inspectSupporting(ids: string[]) {
    setSelectedEvidence(ids[0] ?? null);
    requestAnimationFrame(() => document.getElementById('evidence-title')?.focus());
  }
  const visible = scenarios.filter(s => (category === 'All' || s.category === category) && `${s.title} ${s.description} ${s.behavior} ${s.evidenceRequired}`.toLowerCase().includes(query.trim().toLowerCase()));
  const runOption = (r: SavedRun) => `#${r.sequence} · ${variants[r.report.variant]} · ${r.report.scenarioName}`;

  return <div className="app-shell">
    <a className="skip-link" href="#main" onClick={event => skipToMain(event, document)}>Skip to main content</a>
    <aside className="rail" aria-label="Application navigation">
      <div className="brand-mark" aria-label="Commerce Reliability Kit">cr<span>k</span><i aria-hidden="true">.</i></div>
      <nav aria-label="Main views">{navigation.map(n => <button key={n.id} type="button" aria-current={view === n.id ? 'page' : undefined} className={`nav-button ${view === n.id ? 'active' : ''}`} onClick={() => n.id === 'compare' ? openCompare() : navigate(n.id)}><Icon name={n.icon}/><span>{n.label}</span></button>)}</nav>
      <button type="button" className="nav-button reset" onClick={reset}><Icon name="reset"/><span>Reset demo</span></button>
      <span className="rail-foot">LOCAL / 01</span>
    </aside>
    <div className="app-body">
      <header className="topbar"><div className="breadcrumb"><strong>Commerce Reliability Kit</strong><span aria-hidden="true">/</span><span>{view === 'library' ? 'Scenario library' : view === 'compare' ? 'Compare runs' : view === 'report' && report ? report.scenarioId : scenarioId}</span></div><span className="demo-label"><span aria-hidden="true">◉</span> Synthetic demo · No connected accounts</span></header>
      <main id="main" tabIndex={-1}>
        <div className="page-meta"><span className="eyebrow">{view === 'library' ? 'Explore / Reproduce / Inspect' : 'Local fixture workspace'}</span><button className="text-button" type="button" aria-expanded={about} aria-controls="about-demo" onClick={() => setAbout(!about)}>About this demo <span aria-hidden="true">{about ? '−' : '+'}</span></button></div>
        {about && <section id="about-demo" className="notice about-panel"><h2>A local, synthetic workbench</h2><p>All records are synthetic. Runs use a small six-fixture evaluator, distinct from the full toolkit engine. No production integration has been tested. Matching records does not establish physical stock accuracy.</p><p>Nothing is uploaded or stored outside this session. Downloads happen only when you request them. Evaluation uses fixed fixture times. Reloading or resetting clears the session.</p><p><a href="https://github.com/SafetyMP/commerce-reliability-kit">Repository</a> · <a href="https://github.com/SafetyMP/commerce-reliability-kit/blob/main/docs/demo-guide.md">Demo guide</a> · <a href="https://github.com/SafetyMP/commerce-reliability-kit/blob/main/docs/limitations.md">Limitations</a></p></section>}
        {view === 'library' && <>
          <div className="page-heading"><div><h1 ref={heading} tabIndex={-1}>Scenario library</h1><p>Reproduce an integration failure. Inspect the evidence. Test a better outcome.</p></div><span className="index-label">06 / LOCAL SCENARIOS</span></div>
          <div className="library-toolbar"><label className="search-field"><span className="sr-only">Search scenarios</span><Icon name="search"/><input type="search" placeholder="Search scenarios or evidence…" value={query} onChange={e => setQuery(e.target.value)}/></label><div className="filters" role="group" aria-label="Filter by category">{(['All', 'Orders', 'Fulfillment', 'Inventory', 'Data coverage'] as const).map(c => <button type="button" key={c} aria-pressed={category === c} className={category === c ? 'selected' : ''} onClick={() => setCategory(c)}>{c}</button>)}</div></div>
          <p className="result-count" role="status">{visible.length} {visible.length === 1 ? 'scenario' : 'scenarios'}{category !== 'All' ? ` in ${category}` : ''}{query ? ` matching “${query}”` : ''}</p>
          {visible.length === 0 ? <Empty title="No matching scenarios"><p>Try another term or clear the category filter.</p><button className="secondary" type="button" onClick={() => { setQuery(''); setCategory('All'); }}>Clear search and filters</button></Empty> : <div className="scenario-grid">{visible.map(s => <article className={`scenario-card ${s.id === 'partial-shipment' ? 'recommended' : ''}`} key={s.id}>
            <div className="card-meta"><span className="category"><Icon name={s.category === 'Fulfillment' ? 'box' : s.category === 'Orders' ? 'report' : s.category === 'Inventory' ? 'library' : 'search'}/>{s.category}</span>{s.id === 'partial-shipment' && <span className="recommendation">Recommended starting point</span>}</div>
            <h2>{s.title}</h2><p>{s.description}</p><p className="behavior">{s.behavior}</p>
            {s.id === 'partial-shipment' && <div className="card-equation" aria-label="Five ordered, three fulfilled, two outstanding"><span><b>5</b> ordered</span><span aria-hidden="true">−</span><span><b>3</b> fulfilled</span><span aria-hidden="true">=</span><span><b>2</b> outstanding</span></div>}
            <div className="card-evidence"><span className="eyebrow">Required evidence</span><p>{s.evidenceRequired}</p><span className="variant-list">Faulty · Corrected · Insufficient evidence</span></div>
            <button type="button" className={s.id === 'partial-shipment' ? 'primary card-action' : 'card-action secondary'} aria-label={`Open ${s.title}`} onClick={() => chooseScenario(s.id)}>{s.id === 'partial-shipment' ? 'Start with partial shipment' : 'Open scenario'}<Icon name="arrow"/></button>
          </article>)}</div>}
          <p className="library-note">Local examples, explainable results. No accounts, credentials, or production data required.</p>
        </>}

        {view === 'workbench' && <>
          <div className="page-heading"><div><span className="category">{scenario.category} / Workbench</span><h1 ref={heading} tabIndex={-1}>{scenario.title}</h1><p>{scenario.description}</p></div></div>
          <ol className="journey"><li><span>1</span> Run the faulty example</li><li><span>2</span> Inspect the evidence</li><li><span>3</span> Run the corrected example</li><li><span>4</span> Compare & export</li></ol>
          <div className="workbench-grid"><section className="panel overview"><span className="eyebrow">01 / Understand</span><h2>What should happen?</h2><h3>Initial conditions</h3><p>{scenario.initialConditions}</p><div className="expected-box"><h3>Expected behavior</h3><p>{scenario.expectedBehavior}</p></div><details className="limits"><summary>What this scenario does not establish</summary><ul>{scenario.limitations.map(l => <li key={l}>{l}</li>)}<li>No production integration or physical stock accuracy is established.</li></ul></details></section>
            <form className="panel run-controls" onSubmit={run} noValidate><span className="eyebrow">02 / Evaluate</span><h2>Choose an example</h2><fieldset className="variant-selector"><legend className="sr-only">Example variant</legend>{scenario.variants.map(v => <label className={variant === v ? 'chosen' : ''} key={v}><input type="radio" name="variant" value={v} checked={variant === v} onChange={() => { setVariant(v); setRunError(''); setSelectedEvidence(null); }}/><span>{variants[v]}<small>{v === 'faulty' ? 'A deliberately incorrect implementation' : v === 'corrected' ? 'Correct behavior with the same source facts' : 'Required evidence is partial or missing'}</small></span></label>)}</fieldset>
              {variant === 'insufficient' && <p className="notice compact">This variant changes the source evidence. Comparison will flag the difference.</p>}
              <div className="policy-controls"><h3>Scenario policy</h3>{Object.keys(scenario.defaults).length ? (Object.keys(scenario.defaults) as PolicyKey[]).map(key => <label className="input-label" key={key}>{policyLabels[key]}<input type="number" min="0" step="1" value={inputs[key] ?? scenario.defaults[key]} aria-invalid={Boolean(policyError)} aria-describedby={policyError ? 'policy-error' : 'policy-help'} onChange={e => { setInputs({ ...inputs, [key]: e.target.value }); setRunError(''); }}/></label>) : <p className="muted">Fixed quantity rules. There are no adjustable policy values for this scenario.</p>}
                {Object.keys(scenario.defaults).length > 0 && <p id="policy-help" className="help">Whole numbers, zero or greater. Changes affect the next local evaluation.</p>}{policyError && <p id="policy-error" className="error" role="alert">{policyError}</p>}
              </div><button className="primary run-button" type="submit" disabled={Boolean(policyError)}><Icon name="play"/>Run local example</button><p className="help">Deterministic fixture evaluation · No production calls</p>{runError && <p className="error" role="alert">{runError}</p>}
            </form></div>
          {latestForScenario ? <section className="panel saved-summary"><div className="section-heading"><div><span className="eyebrow">Saved run #{latestForScenario.sequence}</span><h2>Latest result for this scenario</h2></div><button className="secondary" type="button" onClick={() => { setSelectedRun(latestForScenario.sequence); navigate('report'); }}>Open run report <Icon name="arrow"/></button></div><ResultStrip report={latestForScenario.report}/>{draftChanged && <p className="notice compact">Your draft differs from this saved run. Run the example to evaluate the current controls; this report remains unchanged.</p>}</section> : <p className="notice no-run">No run yet. Choose the faulty example, then select “Run local example” to inspect its assertion and supporting evidence.</p>}
          <EvidencePanel facts={sourceFacts(scenarioId, variant)} selected={selectedEvidence} onSelect={setSelectedEvidence} evaluationTime={scenario.evaluationTime}/>
        </>}

        {view === 'report' && <>
          <div className="page-heading"><div><span className="eyebrow">Saved evidence snapshot</span><h1 ref={heading} tabIndex={-1}>Run report</h1><p>{report?.scenarioName ?? 'Run an example to create an inspectable local report.'}</p></div>{report && <div className="export-actions"><button type="button" className="secondary" onClick={() => exportSelected('json')}><Icon name="download"/>JSON report</button><button type="button" className="primary" onClick={() => exportSelected('html')}><Icon name="download"/>HTML report</button></div>}</div>
          {!report ? <Empty title="No saved run yet"><p>Start with the partial-shipment example to see why two outstanding units matter.</p><button type="button" className="primary" onClick={() => chooseScenario('partial-shipment')}>Open partial shipment <Icon name="arrow"/></button></Empty> : <>
            {exportError && <p role="alert" className="error export-error">{exportError}</p>}
            <div className="report-toolbar"><label className="input-label">Selected run<select value={selected!.sequence} onChange={e => { setSelectedRun(Number(e.target.value)); setSelectedEvidence(null); setExportError(''); }}>{[...history].reverse().map(r => <option key={r.sequence} value={r.sequence}>{runOption(r)}</option>)}</select></label><span className="quiet-tag">{report.runMode}</span></div>
            <ResultStrip report={report}/><MetricFacts report={report}/>
            <section className="panel"><div className="section-heading"><div><span className="eyebrow">Test behavior</span><h2>Assertion verdicts</h2></div><span className="quiet-tag">{variants[report.variant]}</span></div><p className="muted">Verdicts judge the example output against the expected behavior. They do not measure overall integration reliability.</p>
              {report.assertions.map(a => <article className={`assertion assertion-${a.status.toLowerCase()}`} key={a.id}><div className="assertion-heading"><StatusBadge status={a.status}/><h3>{a.title}</h3></div><p>{a.reason}</p><div className="expected-observed"><div><span className="eyebrow">Expected output</span><p>{a.expected}</p></div><div><span className="eyebrow">Observed example output</span><p>{a.observed}</p></div></div><button type="button" className="text-button" onClick={() => inspectSupporting(a.evidence)}>Inspect supporting evidence <Icon name="arrow"/></button></article>)}
              <details className="limits"><summary>How to read assertion statuses</summary><dl className="status-definitions"><dt>PASS</dt><dd>Sufficient evidence satisfies the assertion.</dd><dt>FAIL</dt><dd>Sufficient evidence contradicts the assertion.</dd><dt>INCONCLUSIVE</dt><dd>Required evidence is missing, stale, ambiguous, or incomplete.</dd><dt>NOT APPLICABLE</dt><dd>Declared prerequisites do not apply. None of these six default fixtures require this status.</dd></dl></details>
            </section>
            <section className="panel findings"><span className="eyebrow">Operational state</span><h2>Supported findings</h2><p className="muted">These describe source facts, separate from whether the example diagnosed them correctly.</p>{report.findings.length ? report.findings.map(f => <article className="finding" key={f.id}><div><span className={`finding-icon ${f.severity}`} aria-hidden="true">{f.severity === 'info' ? 'i' : '!'}</span></div><div><h3>{f.title}</h3><p>{f.detail}</p><button className="text-button" type="button" onClick={() => inspectSupporting(f.evidence)}>Inspect exact records <Icon name="arrow"/></button></div></article>) : <p className="no-findings"><Icon name="check"/>No supported operational findings under this policy.</p>}{report.scenarioId === 'missing-order' && <p className="notice compact">A missing order can coexist with a PASS: the assertion tests whether the expected diagnostic was produced. No source order was repaired.</p>}</section>
            <EvidencePanel facts={report} selected={selectedEvidence} onSelect={setSelectedEvidence} evaluationTime={report.evaluationTime}/>
            <section className="panel"><span className="eyebrow">Reproduction context</span><h2>Policy & evaluation</h2><div className="context-grid"><PolicyFacts policy={report.policy}/><dl className="facts-list"><div><dt>Evaluation time / fixed UTC</dt><dd>{report.evaluationTime}</dd></div><div><dt>Rule / profile version</dt><dd>{report.ruleVersion}<br/>{report.profileVersion}</dd></div><div><dt>Scenario version</dt><dd>{report.scenarioId} / {report.scenarioVersion}</dd></div></dl></div><details className="limits"><summary>Limitations of this report</summary><ul>{report.limitations.map(l => <li key={l}>{l}</li>)}</ul></details></section>
            <section className="next-step"><div><span className="eyebrow">Next step</span><h2>{report.variant === 'faulty' ? 'Keep the evidence. Change the behavior.' : 'See what changed between runs.'}</h2><p>{report.variant === 'faulty' ? 'Run the corrected example against the same source facts and policy.' : 'Compare saved snapshots, then download the selected report.'}</p></div><div className="next-actions">{report.variant !== 'corrected' && <button className="primary" type="button" onClick={() => editExample(report, 'corrected')}>Try corrected example <Icon name="arrow"/></button>}<button className={report.variant === 'corrected' ? 'primary' : 'secondary'} type="button" onClick={openCompare}><Icon name="compare"/>Compare runs</button><button className="text-button" type="button" onClick={() => editExample(report, report.variant)}>Back to workbench</button></div></section>
          </>}
        </>}

        {view === 'compare' && <>
          <div className="page-heading"><div><h1 ref={heading} tabIndex={-1}>Compare runs</h1><p>See the assertion transition. Check that the evidence and policy stayed the same.</p></div></div>
          {history.length < 2 ? <Empty title="Two runs make a comparison"><p>{history.length ? 'Run a second example of the same scenario. Your first report is saved.' : 'Run the faulty partial-shipment example, then its corrected counterpart.'}</p><button type="button" className="primary" onClick={() => report ? editExample(report, report.variant === 'faulty' ? 'corrected' : 'faulty') : chooseScenario('partial-shipment')}>Open workbench <Icon name="arrow"/></button></Empty> : <>
            <div className="compare-selectors panel"><label className="input-label"><span className="eyebrow">Before</span>Baseline run<select value={beforeId ?? ''} onChange={e => setBeforeId(e.target.value ? Number(e.target.value) : null)}><option value="">Select a run</option>{history.map(r => <option key={r.sequence} value={r.sequence}>{runOption(r)}</option>)}</select></label><span className="compare-arrow" aria-hidden="true">→</span><label className="input-label"><span className="eyebrow">After</span>Comparison run<select value={afterId ?? ''} onChange={e => setAfterId(e.target.value ? Number(e.target.value) : null)}><option value="">Select a run</option>{history.map(r => <option key={r.sequence} value={r.sequence}>{runOption(r)}</option>)}</select></label></div>
            {!comparison ? <p className="notice">Select two saved reports to inspect their differences.</p> : beforeId === afterId ? <p className="notice" role="status">Choose two different runs. A report compared with itself cannot demonstrate a change.</p> : !comparison.compatible ? <p className="notice" role="alert">{comparison.reason}</p> : <>
              {comparison.warning && <p role="alert" className="notice comparison-warning">{comparison.warning}</p>}
              <div className="comparison-context"><span>{comparison.sameEvidence ? '✓ Same source evidence' : '! Different source evidence'}</span><span>{comparison.samePolicy ? '✓ Same policy' : '! Different policy'}</span><span>{comparison.sameTime ? '✓ Same evaluation time' : '! Different evaluation time'}</span></div>
              <section className="panel"><span className="eyebrow">{before!.report.scenarioName}</span><h2>Assertion transitions</h2><div className="table-scroll" tabIndex={0} aria-label="Assertion comparison table"><table><thead><tr><th scope="col">Assertion</th><th scope="col">#{before!.sequence} · {variants[before!.report.variant]}</th><th scope="col">#{after!.sequence} · {variants[after!.report.variant]}</th></tr></thead><tbody>{comparison.transitions.map(t => <tr key={t.id}><th scope="row">{t.title}</th><td>{t.before === 'NOT PRESENT' ? t.before : <StatusBadge status={t.before}/>}</td><td>{t.after === 'NOT PRESENT' ? t.after : <StatusBadge status={t.after}/>}</td></tr>)}</tbody></table></div><p className="muted">{comparison.warning ? 'Treat these as differences, not proof of a fix.' : 'These snapshots isolate example behavior for the same local fixture. They do not establish a production fix.'}</p></section>
              <div className="comparison-grid"><section className="panel"><h2>Policy differences</h2>{comparison.samePolicy ? <p>No policy changes between these runs.</p> : <p>Changed: {comparison.policyDifferences.map(k => policyLabels[k as PolicyKey]).join(', ')}.</p>}<h3>Before</h3><PolicyFacts policy={before!.report.policy}/><h3>After</h3><PolicyFacts policy={after!.report.policy}/><details><summary>Evaluation times</summary><p className="mono">Before: {before!.report.evaluationTime}<br/>After: {after!.report.evaluationTime}</p></details></section>
                <section className="panel"><h2>Findings & coverage</h2><p>{comparison.addedFindings.length} findings added · {comparison.removedFindings.length} removed</p>{comparison.addedFindings.map(f => <p key={f.id}>+ {f.title}: {f.detail}</p>)}{comparison.removedFindings.map(f => <p key={f.id}>− {f.title}: {f.detail}</p>)}{!comparison.addedFindings.length && !comparison.removedFindings.length && <p className="muted">Supported source findings are unchanged; the example’s interpretation can still change.</p>}<h3>Evidence coverage</h3><p>{comparison.sameCoverage ? 'Coverage declarations are identical.' : 'Coverage declarations changed. Inspect both reports before attributing the verdict change to behavior.'}</p>{!comparison.sameEvidence && <p className="warning-text">Source observations or coverage differ.</p>}<div className="split-actions">{[before!, after!].map((r, i) => <button key={r.sequence} type="button" className="secondary" onClick={() => { setSelectedRun(r.sequence); navigate('report'); }}>Open {i ? 'after' : 'before'} report</button>)}</div></section></div>
            </>}
          </>}
          <section className="panel history"><div className="section-heading"><div><span className="eyebrow">This browser session only</span><h2>Run history</h2></div><button type="button" className="text-button" onClick={clearHistory} disabled={!history.length}>Clear run history</button></div><p className="muted">The latest {HISTORY_LIMIT} immutable snapshots are kept in memory. Reloading or resetting clears them.</p>{!history.length ? <p>No saved reports.</p> : <ol className="history-list">{[...history].reverse().map(r => <li key={r.sequence}><span className="mono">#{String(r.sequence).padStart(2, '0')}</span><div><strong>{r.report.scenarioName}</strong><p>{variants[r.report.variant]} · {totalText(r.report)}</p></div><button className="secondary" type="button" aria-label={`Open report ${r.sequence}`} onClick={() => { setSelectedRun(r.sequence); navigate('report'); }}>Open <Icon name="arrow"/></button></li>)}</ol>}</section>
        </>}
        <footer className="app-footer"><span>Commerce Reliability Kit</span><span>Local fixture evaluator · No production verification</span></footer>
      </main>
    </div>
    <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
  </div>;
}
