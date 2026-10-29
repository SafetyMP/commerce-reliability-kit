import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
function run(args) { const r=spawnSync(process.execPath,args,{stdio:'inherit',timeout:120000}); if(r.error)throw r.error; if(r.status!==0)process.exit(r.status??3); }
run(['--experimental-strip-types','acceptance/frontend-gate.mjs']);
run(['apps/demo/node_modules/typescript/bin/tsc','-p','apps/demo/tsconfig.json','--noEmit']);
const tests=readdirSync('apps/demo/tests').filter(n=>n.endsWith('.test.ts')).map(n=>'apps/demo/tests/'+n);
if(!tests.length)throw new Error('Frontend tests missing');
run(['--experimental-strip-types','--test',...tests]);
run(['apps/demo/node_modules/vite/bin/vite.js','build','apps/demo']);
