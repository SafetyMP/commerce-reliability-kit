#!/usr/bin/env node
import { lstatSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, validateEvidence, validateOutcome, validateScenario } from '../core/index.ts';
import { parseJSON, readJSON, readText } from '../core/validation.ts';
import { renderHTML, renderJUnit } from '../report/index.ts';
import { compareReports } from '../report/compare.ts';
import { importCapture } from '../importers/index.ts';
import { validateReport } from '../core/validation.ts';
import type { Outcome, Report } from '../core/types.ts';

function pathArg(value: string): string {
  if (!value || value.includes('\0') || value.split(/[\\/]/).includes('..') || /^[a-z]+:\/\//i.test(value)) throw new Error('Unsafe path');
  return value;
}
function outcomes(path: string): Outcome[] {
  const content = readText(pathArg(path)), records: Outcome[] = [];
  if (path.endsWith('.jsonl')) {
    for (const line of content.split(/\r?\n/).filter(s => s.trim())) { const o = parseJSON(line); validateOutcome(o); records.push(o); }
  } else {
    const parsed = parseJSON(content);
    for (const o of Array.isArray(parsed) ? parsed : [parsed]) { validateOutcome(o); records.push(o); }
  }
  return records;
}
function output(report: Report, format: string): string {
  if (format === 'html') return renderHTML(report);
  if (format === 'junit') return renderJUnit(report);
  if (format !== 'json') throw new Error('Unsupported format');
  return JSON.stringify(report, null, 2) + '\n';
}
function save(report: Report, directory: string): void {
  const dir = pathArg(directory);
  // An existing symlink is never an output target, including parent components.
  let current = resolve(dir);
  while (true) {
    try { if (lstatSync(current).isSymbolicLink()) throw new Error('Symlink output is unsupported'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const parent = resolve(current, '..'); if (parent === current) break; current = parent;
  }
  mkdirSync(dir, { recursive: true });
  for (const [format, name] of [['json', 'report.json'], ['html', 'report.html'], ['junit', 'report.xml']] as const) {
    // Exclusive creation makes report generation non-destructive.
    writeFileSync(join(dir, name), output(report, format), { flag: 'wx' });
  }
}
export function main(args: string[]): number {
  const [command, target, ...rest] = args;
  if (command === 'compare') {
    if (!target || rest.length !== 1) throw new Error('Compare requires two report paths');
    const before = readJSON(pathArg(target)), after = readJSON(pathArg(rest[0]!));
    validateReport(before); validateReport(after);
    process.stdout.write(JSON.stringify(compareReports(before, after), null, 2) + '\n'); return 0;
  }
  if (!command || !target || !['demo', 'validate', 'assert', 'analyze'].includes(command)) throw new Error('Unsupported command');
  const options = new Map<string, string>();
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]!, value = rest[i + 1];
    if (!['--format', '--output', '--observed', '--at', '--profile', '--capture'].includes(key) || !value || value.startsWith('--') || options.has(key)) throw new Error('Invalid options');
    options.set(key, value);
  }
  if (options.has('--observed') && command !== 'assert') throw new Error('Observed outcomes require assert mode');
  if (options.has('--at') && command !== 'analyze') throw new Error('Evaluation override is for captures only');
  if (options.has('--capture') && command !== 'assert') throw new Error('External captures require assertion mode');
  if (options.has('--profile') && !['analyze', 'validate'].includes(command) && !(command === 'assert' && options.has('--capture'))) throw new Error('Profiles require capture mode');
  const format = options.get('--format') ?? 'json';
  if (!['json', 'html', 'junit'].includes(format)) throw new Error('Invalid format');
  let input: unknown;
  if (command === 'demo') {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target)) throw new Error('Invalid demo name');
    input = readJSON(fileURLToPath(new URL(`../../scenarios/${target}.json`, import.meta.url)));
  } else if (command === 'analyze' || (command === 'validate' && (options.has('--profile') || /\.(csv|jsonl)$/.test(target)))) {
    input = importCapture(pathArg(target), options.has('--profile') ? pathArg(options.get('--profile')!) : undefined);
  } else input = readJSON(pathArg(target));
  if (command === 'validate') {
    if (input && typeof input === 'object' && 'evidence' in input) validateScenario(input); else validateEvidence(input);
    process.stdout.write('{"valid":true}\n'); return 0;
  }
  // Quote user-provided tokens, never execute this reproduction instruction.
  const quote = (value: string): string => "'" + value.replace(/'/g, "'\\''") + "'";
  const reproductionCommand = ['node', ...(import.meta.url.endsWith('.ts') ? ['--experimental-strip-types'] : []), fileURLToPath(import.meta.url), ...args.filter((_, i) => args[i] !== '--output' && args[i - 1] !== '--output')].map(quote).join(' ');
  let report: Report;
  if (command === 'analyze') {
    validateEvidence(input);
    const at = options.get('--at'); if (!at) throw new Error('Analyze requires explicit --at');
    report = evaluate(input, { mode: 'analyze', evaluationTime: at, reproductionCommand });
  } else {
    validateScenario(input);
    report = command === 'assert' ? evaluate(input, { mode: 'assert', ...(options.has('--observed') ? { observed: outcomes(options.get('--observed')!) } : {}),
      ...(options.has('--capture') ? { observedEvidence: importCapture(pathArg(options.get('--capture')!), options.has('--profile') ? pathArg(options.get('--profile')!) : undefined) } : {}),
      reproductionCommand }) : evaluate(input, { mode: 'demo', reproductionCommand });
  }
  if (options.has('--output')) save(report, options.get('--output')!);
  process.stdout.write(output(report, format));
  return report.summary.exitCode;
}
function isEntryPoint(): boolean {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); }
  catch { return false; }
}
if (isEntryPoint()) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch { process.stderr.write('commerce-check: invalid configuration, input, or runner failure (exit 3). No input data logged.\n'); process.exitCode = 3; }
}
