import { readJSON, validateScenario } from '../packages/core/index.ts';
import { correctedIntegration, faultyIntegration } from './integrations.ts';
const mode = process.argv[2], path = process.argv[3];
if (!path || !['faulty', 'corrected'].includes(mode ?? '')) throw new Error('Usage: run-integration faulty|corrected scenario.json');
const scenario = readJSON(path); validateScenario(scenario);
for (const outcome of (mode === 'faulty' ? faultyIntegration : correctedIntegration)(scenario.evidence)) process.stdout.write(JSON.stringify(outcome) + '\n');
