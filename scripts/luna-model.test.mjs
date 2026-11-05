import assert from 'node:assert/strict';
import { build } from 'esbuild';

const calls = [];
globalThis.lunaTestCalls = calls;
const { outputFiles } = await build({
  stdin: { contents: `export * from './server/ai-config-store'; export {openaiService} from './server/openai-service';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'offline-openai', setup(b) {
    b.onResolve({ filter: /^openai$/ }, () => ({ path: 'openai', namespace: 'offline' }));
    b.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ contents: `export default class OpenAI {
      chat = { completions: { create: async (request) => {
        globalThis.lunaTestCalls.push(request);
        return { choices: [{ message: { content: request.response_format ? '{}' : 'Resposta sintética de teste.' } }] };
      } } };
    }`, loader: 'js' }));
  } }],
});
const { openaiService: service, getAllAIConfigs, getCompletionOptions, AVAILABLE_MODELS } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
const configs = await getAllAIConfigs();
assert.equal(configs.length, 7);
assert.ok(configs.every(c => c.model === 'gpt-6-luna'));
assert.ok(AVAILABLE_MODELS.includes('gpt-6-luna'));
assert.deepEqual(getCompletionOptions({ model: 'gpt-4o-mini', temperature: 0.7, max_tokens: 500 }), { model: 'gpt-4o-mini', temperature: 0.7, max_tokens: 500 });
const messages = [{ id: 'offline-message', timestamp: Date.now(), text: 'Informação sintética de teste.', fromMe: false }];
await service.askAboutPatient(messages, 'Qual o objetivo?');
await service.generateQuickInsights(messages);
await service.generateMealPlan({ name: 'Teste sintético', messages });
await service.runAnamnesisAgent([], 'Quero melhorar meus hábitos.');
await service.extractPatientData([{ role: 'user', content: 'Exemplo sintético.' }]);
await service.runFollowUpAgent({}, [], 'Como organizar minha rotina?');
await service.analyzeFood(Buffer.from('synthetic-image'));
assert.equal(calls.length, 7);
for (const request of calls) {
  assert.equal(request.model, 'gpt-6-luna');
  assert.equal(request.reasoning_effort, 'none');
  assert.ok(request.max_completion_tokens > 0);
  assert.ok(!('max_tokens' in request));
}
assert.deepEqual(calls.map(c => c.max_completion_tokens), [800, 800, 2500, 500, 1500, 500, 800]);
assert.equal(calls.filter(c => c.response_format?.type === 'json_object').length, 3);
assert.ok(calls[6].messages[1].content.some(c => c.type === 'image_url'));
delete globalThis.lunaTestCalls;
console.log('Luna: all 7 workloads, JSON, vision, token budgets and legacy compatibility passed (offline).');
