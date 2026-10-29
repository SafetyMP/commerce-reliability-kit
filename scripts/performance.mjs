// Manual, bounded, ONE coordinator-owned run. Not imported by tests/build/CI.
import { spawnSync } from 'node:child_process';
import { cpus, platform, arch, totalmem } from 'node:os';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
if (!process.argv.includes('--worker')) {
  const result = spawnSync(process.execPath,['--max-old-space-size=768',fileURLToPath(import.meta.url),'--worker'],{encoding:'utf8',timeout:65000,maxBuffer:1024*1024});
  process.stdout.write(result.stdout ?? '');
  if (result.error) process.stderr.write('Bounded performance run timed out or could not start. No retry performed.\n');
  process.stderr.write(result.stderr ?? ''); process.exit(result.status ?? 3);
}
const { evaluate } = await import('../dist/packages/core/index.js');
const start = performance.now();
const scenario = JSON.parse(readFileSync(new URL('../scenarios/partial-shipment.json',import.meta.url),'utf8'));
const e = scenario.evidence;
const order = e.observations[0], shipment = e.observations[1];
e.observations = []; e.outcomes = [];
// 50,000 order revisions and 50,000 delivery observations of one stable line/shipment.
// Measures bounded ingestion, validation, duplicate resolution, hashing and reconciliation.
// It deliberately does not measure 100k distinct mappings or end-to-end HTML serialization.
for (let i=0;i<50000;i++) {
  e.observations.push({...order,id:'order-'+i,sourceRecordId:'line-A',fields:{...order.fields}});
  e.observations.push({...shipment,id:'shipment-'+i,sourceRecordId:'shipment-S1',fields:{...shipment.fields}});
}
const report = evaluate(e,{mode:'analyze',evaluationTime:scenario.evaluationTime});
const check = report.checks.find(c=>c.id==='fulfillment.quantities:shop/A');
if (check?.details.shipped!==4 || check?.details.remaining!==6 || report.observations.length!==100000) throw new Error('Performance correctness guard failed');
const seconds = (performance.now()-start)/1000;
const peakMiB = process.resourceUsage().maxRSS/1024;
process.stdout.write(JSON.stringify({records:100000,seed:'deterministic-retry-storm-v1',seconds,peakMiB,targetSeconds:60,targetMiB:1024,metTarget:seconds<60&&peakMiB<1024,runtime:process.version,platform:platform(),arch:arch(),cpu:cpus()[0]?.model,logicalCPUs:cpus().length,systemMemoryBytes:totalmem(),scope:'generation + in-memory validation, deduplication, reconciliation, hashing, report construction; excludes process/schema startup and report serialization'},null,2)+'\n');
process.exitCode = seconds<60&&peakMiB<1024 ? 0 : 1;
