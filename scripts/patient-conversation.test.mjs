import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const bundlePath = new URL('../node_modules/.cache/patient-conversation-test.mjs', import.meta.url);
await mkdir(new URL('.', bundlePath), { recursive: true });
const mocks = {
  storage: 'export const storage = {}; export async function initializeStorage() {}',
  'lib/directus.js': 'export const directusClient = {}',
  'patient-history-directus': 'export const patientHistoryDirectus = {}',
  'openai-service': 'export const openaiService = {}',
  'schedule-service': 'export const scheduleService = {startScheduler() {}}',
  'whatsapp-message-handler': 'export const whatsappMessageHandler = {}',
  'twilio-whatsapp-service': 'export const twilioWhatsAppService = {}',
};
try {
  await build({
    stdin: { contents: `export {registerRoutes} from './server/routes'; export {storage} from './server/storage'; export {default as PatientConversation} from './client/src/components/patients/patient-conversation';`, resolveDir: process.cwd() },
    bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic', outfile: bundlePath.pathname.replace(/^\/([A-Z]:)/, '$1'),
    plugins: [{ name: 'offline-services', setup(b) {
      b.onResolve({ filter: /^(\.\/|\.\/server\/)/ }, args => {
        const key = args.path.replace(/^\.\/(server\/)?/, '');
        return key in mocks ? { path: key, namespace: 'offline' } : undefined;
      });
      b.onLoad({ filter: /.*/, namespace: 'offline' }, args => ({ contents: mocks[args.path], loader: 'js' }));
    } }],
  });
  const { registerRoutes, storage, PatientConversation } = await import(bundlePath.href);
  let handlers;
  const app = Object.assign(() => {}, Object.fromEntries(['get', 'post', 'put', 'patch', 'delete', 'use'].map(method => [method, (path, ...callbacks) => {
    if (method === 'get' && path === '/api/messages/patient/:patientId') handlers = callbacks;
  }])));
  await registerRoutes(app);
  let owner = 'c1cc505d-de15-47f9-bea8-330b5d696bc7', reads = 0;
  storage.getPatient = async id => id === '999' ? undefined : { id, nutritionistId: owner };
  storage.getPatientMessages = async (id, limit) => { reads++; return [{ id: 1, patient_id: id, limit }]; };
  async function request({ user = { id: owner, nutritionistId: owner }, id = '74', limit } = {}) {
    let code = 200, body, cache;
    const req = { session: { user }, params: { patientId: id }, query: limit === undefined ? {} : { limit } };
    const res = { status(value) { code = value; return this; }, json(value) { body = value; }, set(key, value) { cache = value; } };
    const authorized = [];
    for (const fn of handlers.slice(0, -1)) fn(req, res, () => authorized.push(true));
    if (authorized.length === handlers.length - 1) await handlers.at(-1)(req, res);
    return { code, body, cache };
  }
  assert.equal((await request({ user: null })).code, 401);
  assert.equal((await request({ id: '74&limit=-1' })).code, 400);
  for (const limit of ['0', '-2', 'NaN', '1.5', '1001']) assert.equal((await request({ limit })).code, 400);
  assert.equal((await request({ id: '999' })).code, 404);
  owner = 'other-nutritionist';
  const before = reads;
  assert.equal((await request({ user: { id: 'c1cc505d-de15-47f9-bea8-330b5d696bc7', nutritionistId: 'c1cc505d-de15-47f9-bea8-330b5d696bc7' } })).code, 403);
  assert.equal(reads, before);
  owner = 'c1cc505d-de15-47f9-bea8-330b5d696bc7';
  const result = await request({ limit: '-1' });
  assert.equal(result.code, 200);
  assert.equal(result.body.messages[0].limit, -1);
  assert.equal(result.cache, 'no-store');

  const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  const key = ['/api/messages/patient/74?limit=-1'];
  const render = () => renderToStaticMarkup(React.createElement(QueryClientProvider, { client }, React.createElement(PatientConversation, { patientId: '74', patientName: 'Paciente de teste' })));
  client.setQueryData(key, { messages: [
    { id: 2, from_me: true, message_body: '<script>alert(1)</script>', date_created: '2026-11-05T15:01:00Z' },
    { id: 1, from_me: false, message_body: 'Mensagem inicial\ncom duas linhas', date_created: '2026-11-05T15:00:00Z' },
  ] });
  const html = render();
  assert.ok(html.indexOf('chat-message-1') < html.indexOf('chat-message-2'));
  assert.ok(html.includes('Paciente de teste') && html.includes('IA · NutriChatbot'));
  assert.ok(html.includes('&lt;script&gt;') && !html.includes('<script>'));
  assert.ok(html.includes('12:00') && html.includes('whitespace-pre-wrap'));
  client.setQueryData(key, { messages: [] });
  assert.ok(render().includes('Nenhuma mensagem registrada'));
  client.clear();
  console.log('Conversation: ownership, full history, limits, chat ordering, senders, dates, escaping and empty state passed.');
} finally {
  await rm(bundlePath, { force: true });
}
process.exit(0);
