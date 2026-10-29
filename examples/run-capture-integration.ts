import { readJSON, validateScenario } from '../packages/core/index.ts';
import { inventoryCapture, orderCapture } from './capture-integrations.ts';

const [kind, mode, path] = process.argv.slice(2);
if (!path || !['inventory', 'order'].includes(kind ?? '') || !['faulty', 'corrected'].includes(mode ?? '')) throw new Error('Usage: run-capture-integration inventory|order faulty|corrected scenario.json');
const scenario = readJSON(path); validateScenario(scenario);
const capture = (kind === 'inventory' ? inventoryCapture : orderCapture)(scenario.evidence, mode === 'corrected');
process.stdout.write(JSON.stringify(capture, null, 2) + '\n');
