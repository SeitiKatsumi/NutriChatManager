import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';

const path = new URL('../node_modules/.cache/whatsapp-audio-test.mjs', import.meta.url);
await mkdir(new URL('.', path), { recursive: true });
globalThis.audioTest = { transcript: 'No almoço comi arroz, feijão e frango.', chat: [], transcriptionRequests: [] };
const originalFetch = globalThis.fetch;
try {
  await build({
    stdin: { contents: `export {whatsappMessageHandler as handler} from './server/whatsapp-message-handler'; export {storage} from './server/storage'; export {openaiService as ai} from './server/openai-service'; export {twilioWhatsAppService as twilio} from './server/twilio-whatsapp-service';`, resolveDir: process.cwd() },
    bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: path.pathname.replace(/^\/([A-Z]:)/, '$1'),
    plugins: [{ name: 'offline', setup(b) {
      b.onResolve({ filter: /^(\.\/storage|\.\/server\/storage)$/ }, () => ({ path: 'storage', namespace: 'offline' }));
      b.onResolve({ filter: /^openai$/ }, () => ({ path: 'openai', namespace: 'offline' }));
      b.onLoad({ filter: /.*/, namespace: 'offline' }, args => ({ loader: 'js', contents: args.path === 'storage' ? 'export const storage = {};' : `
        export async function toFile(buffer, name, options) { return new File([buffer], name, options); }
        export default class OpenAI {
          audio = { transcriptions: { create: async request => {
            globalThis.audioTest.transcriptionRequests.push(request);
            if (globalThis.audioTest.fail) throw new Error('Transcription service unavailable');
            return {text: globalThis.audioTest.transcript};
          } } };
          chat = { completions: { create: async request => {
            globalThis.audioTest.chat.push(request);
            return {choices: [{message: {content: 'Entendi a sua mensagem de áudio.'}}]};
          } } };
        }` }));
    } }],
  });
  const { handler, storage, ai, twilio } = await import(path.href);
  const state = globalThis.audioTest, saved = [], sent = [];
  process.env.TWILIO_ACCOUNT_SID = 'ACoffline'; process.env.TWILIO_AUTH_TOKEN = 'offline';
  globalThis.fetch = async () => new Response(Buffer.from('OggSsynthetic'), { headers: { 'content-length': '13' } });
  const patient = { id: 'offline-patient', nutritionistId: 'c1cc505d-de15-47f9-bea8-330b5d696bc7', fullName: 'Teste', status: 'Acompanhamento' };
  storage.getNutritionist = async () => ({ id: patient.nutritionistId });
  storage.getPatientByWhatsappAny = async () => patient;
  storage.getPatientMessages = async () => [];
  storage.saveWhatsappMessage = async m => { saved.push(m); return m; };
  twilio.sendWhatsAppText = async (to, body) => { sent.push(body); };
  const inbound = twilio.parseInboundMessage({ MessageSid: 'SMoffline', From: 'whatsapp:+5511999990000', NumMedia: '1', MediaUrl0: 'https://api.twilio.com/2010-04-01/Accounts/ACoffline/Messages/SMoffline/Media/MEoffline', MediaContentType0: 'audio/ogg; codecs=opus' });
  assert.equal(inbound.messageType, 'audio');
  assert.equal(twilio.parseInboundMessage({ NumMedia: '1', MediaUrl0: inbound.media[0].url, MediaContentType0: 'application/ogg' }).messageType, 'audio');
  const message = { senderNumber: inbound.fromNumber, messageBody: '', messageType: inbound.messageType, audioMedia: inbound.media[0] };
  await handler.handleIncomingMessage(message);
  assert.equal(state.transcriptionRequests[0].model, 'gpt-transcribe');
  assert.equal(state.transcriptionRequests[0].file.name, 'whatsapp-audio.ogg');
  assert.equal(state.chat[0].model, 'gpt-6-luna');
  assert.equal(state.chat[0].messages.at(-1).content, state.transcript);
  assert.equal(saved[0].message_body, '[Áudio transcrito]\n' + state.transcript);
  assert.equal(saved[0].from_me, false);
  assert.equal(saved[1].from_me, true);
  assert.match(sent[0], /Entendi/);
  for (const scenario of ['failure', 'empty', 'missing']) {
    state.fail = scenario === 'failure'; state.transcript = '   ';
    await handler.handleIncomingMessage({ ...message, audioMedia: scenario === 'missing' ? undefined : message.audioMedia });
    assert.match(sent.at(-1), /Não consegui entender este áudio/);
    assert.equal(state.chat.length, 1, 'Failed audio must never be sent to the conversation model as invented text');
  }
  await assert.rejects(() => ai.transcribeAudio(Buffer.alloc(0), 'audio/ogg'));
  await assert.rejects(() => ai.transcribeAudio(Buffer.alloc(26 * 1024 * 1024), 'audio/ogg'));
  await assert.rejects(() => ai.transcribeAudio(Buffer.from('test'), 'text/plain'));
  await assert.rejects(() => twilio.downloadMedia('https://example.com/audio.ogg'));
  await assert.rejects(() => twilio.downloadMedia('http://api.twilio.com/audio.ogg'));
  globalThis.fetch = async () => new Response('x', { headers: { 'content-length': String(26 * 1024 * 1024) } });
  await assert.rejects(() => twilio.downloadMedia(inbound.media[0].url));
  console.log('WhatsApp audio: Ogg/Opus parsing, authenticated download, transcription, Luna response, chat history and failure/size/URL handling passed (offline).');
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.audioTest;
  await rm(path, { force: true });
}
process.exit(0);
