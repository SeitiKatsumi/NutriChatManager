import assert from 'node:assert/strict';
import { build } from 'esbuild';

// Test the real access and routing code without a database, Stripe, AI calls or WhatsApp sends.
const { outputFiles } = await build({
  stdin: { contents: `export * from './server/clinic-access'; export * from './server/whatsapp-message-handler'; export * from './shared/clinic-mode'; export {storage} from './server/storage';`, resolveDir: process.cwd() },
  bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'offline-services', setup(b) {
    b.onResolve({ filter: /(?:^\.\/|^\.\/server\/)(?:storage|openai-service|twilio-whatsapp-service)$/ }, args => ({ path: args.path.split('/').pop(), namespace: 'offline' }));
    b.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ contents: 'export const storage = {}; export const openaiService = {}; export const twilioWhatsAppService = {};', loader: 'js' }));
  } }],
});
const { requireClinicAuth, disableBilling, SINGLE_NUTRITIONIST_ID, whatsappMessageHandler: handler, storage } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
function run(middleware, req) {
  let status = 200, body, passed = false;
  middleware(req, { status(code) { status = code; return this; }, json(value) { body = value; } }, () => { passed = true; });
  return { status, body, passed };
}
assert.equal(run(requireClinicAuth, { session: {} }).status, 401);
assert.equal(run(requireClinicAuth, { session: { user: { id: 'other-nutri' } } }).status, 403);
assert.equal(run(requireClinicAuth, { session: { user: { id: SINGLE_NUTRITIONIST_ID, subscription_status: 'incomplete', status_pagamento: 'expirado' } } }).passed, true);
assert.equal(run(requireClinicAuth, { session: { user: { id: 'admin', isAdmin: true } } }).passed, true);
assert.equal(run(disableBilling, { originalUrl: '/api/subscription/status?test=1', method: 'GET' }).passed, true);
for (const path of ['/api/subscription/create-checkout', '/api/subscription/create-embedded-subscription', '/api/stripe/sync-my-subscription']) {
  assert.equal(run(disableBilling, { originalUrl: path, method: 'POST' }).status, 410);
}
assert.equal(run(disableBilling, { originalUrl: '/api/stripe/webhook', method: 'POST' }).body.billingDisabled, true);

let existing, processed, updates = [];
storage.getNutritionist = async id => { assert.equal(id, SINGLE_NUTRITIONIST_ID); return { id }; };
storage.getPatientByWhatsappAny = async () => existing;
storage.updatePatient = async (id, patch) => { updates.push({ id, patch }); return { ...existing, ...patch }; };
handler.processMessage = async (nutritionist, number, channel, body, type, image, patient) => { processed = { nutritionist, patient }; };
const incoming = { nutritionistId: 'ignored-other-nutri', senderNumber: '5511999990000', messageBody: 'teste offline', messageType: 'text' };
await handler.handleIncomingMessage(incoming);
assert.equal(processed.nutritionist.id, SINGLE_NUTRITIONIST_ID);
assert.equal(processed.patient, undefined);
existing = { id: 'offline-patient', nutritionistId: 'other-nutri' };
await handler.handleIncomingMessage(incoming);
assert.deepEqual(updates, [{ id: existing.id, patch: { nutritionistId: SINGLE_NUTRITIONIST_ID } }]);
assert.equal(processed.patient.nutritionistId, SINGLE_NUTRITIONIST_ID);
processed = undefined;
storage.updatePatient = async () => undefined;
const originalError = console.error;
console.error = () => {};
try { await handler.handleIncomingMessage(incoming); } finally { console.error = originalError; }
assert.equal(processed, undefined, 'A failed reassignment must not create a duplicate or send a message');
console.log('Clinic mode: authentication, disabled billing and Daniel routing passed (offline).');
process.exit(0);
