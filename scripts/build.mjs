import { spawnSync } from 'node:child_process';
import { cpSync, chmodSync, mkdirSync } from 'node:fs';
const compiled = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.build.json'], { stdio: 'inherit' });
if (compiled.status !== 0) process.exit(compiled.status ?? 3);
mkdirSync('dist', { recursive: true });
for (const directory of ['schemas', 'scenarios']) cpSync(directory, `dist/${directory}`, { recursive: true });
cpSync('examples/order-delivery.scenario.json', 'dist/examples/order-delivery.scenario.json');
chmodSync('dist/packages/cli/index.js', 0o755);
