// Coordinator-owned final verification. Requires an already-populated npm cache; never fetches.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const cacheIndex = process.argv.indexOf('--cache');
if (cacheIndex < 0 || !process.argv[cacheIndex + 1]) throw new Error('Supply --cache PATH to a preseeded offline npm cache; no online fallback.');
const seedCache = realpathSync(process.argv[cacheIndex + 1]);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'commerce-clean-install-')));
try {
  const source = join(scratch, 'source'), consumer = join(scratch, 'consumer'), cache = join(scratch, 'cache');
  mkdirSync(source); mkdirSync(consumer); cpSync(seedCache, cache, { recursive: true });
  for (const file of ['package.json','package-lock.json','tsconfig.json','tsconfig.build.json','packages','schemas','scenarios','examples','scripts','docs','README.md','LICENSE','NOTICE','SECURITY.md','CONTRIBUTING.md','CHANGELOG.md','GOVERNANCE.md','CODE_OF_CONDUCT.md']) cpSync(join(root,file),join(source,file),{recursive:true});
  const env = { ...process.env, npm_config_cache: cache, npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false' };
  const run = (command, args, cwd) => {
    const result = spawnSync(command,args,{cwd,env,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
    if (result.status !== 0) throw new Error('Offline smoke step failed: '+command+' '+args.join(' ')+' (check that the supplied cache contains every pinned dependency).');
    return result.stdout;
  };
  run('npm',['ci','--offline','--ignore-scripts','--no-audit','--no-fund'],source);
  run('npm',['run','build'],source);
  const packed = JSON.parse(run('npm',['pack','--offline','--ignore-scripts','--json'],source));
  writeFileSync(join(consumer,'package.json'),JSON.stringify({name:'commerce-offline-smoke',private:true,type:'module'}));
  run('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund',join(source,packed[0].filename)],consumer);
  const bin = join(consumer,'node_modules/commerce-reliability-kit/dist/packages/cli/index.js');
  const reportDir = join(scratch,'first-report');
  const report = JSON.parse(run(process.execPath,[bin,'demo','missing-order','--output',reportDir],consumer));
  assert.equal(report.summary.exitCode,0); assert.ok(report.findings.some(f=>f.ruleId==='order.missing'));
  assert.match(readFileSync(join(reportDir,'report.html'),'utf8'),/Counts and denominators/);
  writeFileSync(join(consumer,'probe.mjs'),'import {evaluate} from "commerce-reliability-kit"; if(typeof evaluate!=="function") process.exit(1);');
  run(process.execPath,['probe.mjs'],consumer);
  process.stdout.write(JSON.stringify({status:'PASS',runtime:process.version,offline:true,cleanInstall:true,packageInstall:true,firstReport:true})+'\n');
} finally { rmSync(scratch,{recursive:true,force:true}); }
