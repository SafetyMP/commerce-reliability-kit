// Explicit local artifact regeneration; never runs during build/tests or publishes.
import { readFileSync, writeFileSync } from 'node:fs';
import { evaluate, renderHTML, renderJUnit } from '../packages/core/index.ts';

for (const [directory, path, options] of [
  ['partial-shipment', 'scenarios/partial-shipment.json', {
    mode: 'demo', reproductionCommand: 'node --experimental-strip-types packages/cli/index.ts demo partial-shipment'
  }],
  ['inventory', 'examples/capture.json', {
    mode: 'analyze', evaluationTime: '2026-10-28T10:12:00Z',
    reproductionCommand: 'node --experimental-strip-types packages/cli/index.ts analyze examples/capture.json --at 2026-10-28T10:12:00Z'
  }]
]) {
  const report = evaluate(JSON.parse(readFileSync(path, 'utf8')), options);
  const root = `examples/reports/${directory}`;
  writeFileSync(`${root}/report.json`, JSON.stringify(report, null, 2) + '\n');
  writeFileSync(`${root}/report.html`, renderHTML(report));
  writeFileSync(`${root}/report.xml`, renderJUnit(report));
}
