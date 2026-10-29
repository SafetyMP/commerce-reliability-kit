import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
test('compiled library and CLI work inside consumer node_modules without TS stripping', () => {
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'commerce-build-'))), root = process.cwd();
  try {
    const build = join(scratch, 'build'); mkdirSync(build);
    for (const file of ['packages','examples','schemas','scenarios','scripts','tsconfig.json','tsconfig.build.json','package.json']) cpSync(join(root,file),join(build,file),{ recursive: true });
    symlinkSync(realpathSync('node_modules'),join(build,'node_modules'));
    const built = spawnSync(process.execPath,['scripts/build.mjs'],{cwd:build,encoding:'utf8',timeout:30000}); assert.equal(built.status,0,built.stdout+built.stderr);
    const consumer = join(scratch,'consumer'), modules = join(consumer,'node_modules'), pkg = join(modules,'commerce-reliability-kit'); mkdirSync(pkg,{recursive:true});
    writeFileSync(join(consumer,'package.json'),JSON.stringify({name:'isolated-consumer',private:true,type:'module'}));
    cpSync(join(build,'dist'),join(pkg,'dist'),{recursive:true}); cpSync(join(root,'package.json'),join(pkg,'package.json'));
    for (const dependency of ['ajv','ajv-formats']) symlinkSync(realpathSync(join(root,'node_modules',dependency)),join(modules,dependency));
    const report = spawnSync(process.execPath,[join(pkg,'dist/packages/cli/index.js'),'demo','partial-shipment'],{cwd:consumer,encoding:'utf8',timeout:10000});
    assert.equal(report.status,0,report.stderr); assert.equal(JSON.parse(report.stdout).summary.exitCode,0);
    const bins = join(modules, '.bin'); mkdirSync(bins);
    const bin = join(bins, 'commerce-check'); symlinkSync('../commerce-reliability-kit/dist/packages/cli/index.js', bin);
    const linked = spawnSync(process.execPath, [bin, 'demo', 'normal-delay'], { cwd: consumer, encoding: 'utf8', timeout: 10000 });
    assert.equal(linked.status, 0, linked.stderr); assert.equal(JSON.parse(linked.stdout).summary.exitCode, 0);
    writeFileSync(join(consumer,'probe.mjs'), 'import {evaluate, VirtualClock, compareReports, importCapture} from "commerce-reliability-kit"; if ([evaluate,VirtualClock,compareReports,importCapture].some(f=>typeof f!=="function")) process.exit(1);');
    const imported = spawnSync(process.execPath,['probe.mjs'],{cwd:consumer,encoding:'utf8'});
    assert.equal(imported.status,0,imported.stdout+imported.stderr);
  } finally { rmSync(scratch,{recursive:true,force:true}); }
});
