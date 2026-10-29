import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const tests = readdirSync('tests').filter(n => /\.test\.(ts|mjs)$/.test(n)).sort().map(n => `tests/${n}`);
assert.ok(tests.length >= 5, 'Expected substantive rule, ingestion, report, security and CLI tests');
const result = spawnSync(process.execPath, ['--experimental-strip-types','--test',...tests,'acceptance/contract.test.mjs'], {stdio:'inherit', timeout:180000});
process.exit(result.status ?? 3);
