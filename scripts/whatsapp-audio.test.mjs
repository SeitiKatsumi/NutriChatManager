import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';

const path = new URL('../node_modules/.cache/whatsapp-audio-test.mjs', import.meta.url);
await mkdir(new URL('.', path), { recursive: true });
globalThis.audioTest = { transcript: 'No almoço comi arroz, feijão e frango.', chat: [], transcriptionRequests: [] };
const originalFetch = globalThis.fetch;
try {
  await build({
    stdin: { contents: `export {whatsappMessageHandler as handler, WhatsAppMessageHandler} from './server/whatsapp-message-handler'; export {storage} from './server/storage'; export {PatientHistoryDirectusService} from './server/patient-history-directus'; export {openaiService as ai} from './server/openai-service'; export {twilioWhatsAppService as twilio} from './server/twilio-whatsapp-service';`, resolveDir: process.cwd() },
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
            return {choices: [{message: {content: globalThis.audioTest.responseContent || 'Entendi a sua mensagem de áudio.'}}]};
          } } };
        }` }));
    } }],
  });
  const { handler, WhatsAppMessageHandler, storage, ai, twilio } = await import(path.href);
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
  storage.getPatientMessages=async()=>[{id:1,message_body:'Relato do paciente',from_me:false,date_created:new Date()},{id:2,message_body:'Resposta da IA',from_me:true,date_created:new Date()}];
  const {PatientHistoryDirectusService}=await import(path.href);
  const history=await new PatientHistoryDirectusService().getPatientMessages('1');
  assert.equal(history[0].fromMe,false);assert.equal(history[1].fromMe,true);
  state.responseContent=JSON.stringify({Anamnese_estruturada:{hidratacao:'Bebe 2 litros por dia',sono:42,extra:'não guardar'},Peso:75.55});
  const extracted=await ai.extractPatientData([{role:'user',content:'Bebo 2 litros por dia.'}]);
  assert.equal(extracted.Anamnese_estruturada.hidratacao,'Bebe 2 litros por dia');
  assert.equal(extracted.Anamnese_estruturada.sono,undefined);assert.equal(extracted.Anamnese_estruturada.extra,undefined);
  assert.match(state.chat.at(-1).messages[0].content,/Anamnese_estruturada/);
  assert.match(state.chat.at(-1).messages[0].content,/Não realiza a refeição/);
  const runAnamnesisAgent=ai.runAnamnesisAgent.bind(ai);
  for(const marker of ['[ANAMNESE_COMPLETA]','**ANAMNESE_COMPLETA**','[ anamnese_completa ]']){
    state.responseContent=marker+'\nResumo final.';
    const result=await runAnamnesisAgent([],'Não faço ceia');
    assert.equal(result.isComplete,true);assert.equal(result.response,'Resumo final.');
  }
  state.responseContent='O que você come no almoço?';
  assert.equal((await runAnamnesisAgent([],'Oi')).isComplete,false);
  let profileUpdate;
  storage.updatePatient=async(id,update)=>{profileUpdate=update;return update;};
  ai.runAnamnesisAgent=async()=>({isComplete:true,response:'Obrigado'});
  ai.extractPatientData=async()=>({Anamise_inicial:'Novo resumo',Anamnese_estruturada:{hidratacao:'2 litros'},Metas_e_objetivos:'Melhorar FTP'});
  await handler.handleAnamnesis({...patient,medicalHistory:'Relato original preservado',anamnesisSections:{sono:'7 horas'}},[],'Bebo 2 litros',false);
  assert.equal(profileUpdate.medicalHistory,undefined);
  assert.equal(profileUpdate.anamnesisSections.sono,'7 horas');
  assert.equal(profileUpdate.anamnesisSections.hidratacao,'2 litros');
  assert.equal(profileUpdate.anamnesisSections.objetivos,'Melhorar FTP');
  const oldHistory=Array.from({length:260},(_,index)=>({id:index,from_me:index%2===1,message_body:index===0?'Meu nome é Paciente Exemplo.':`Relato de demonstração ${index}`,date_created:new Date(1700000000000+index*1000)}));
  const pages=[];
  storage.getPatientMessages=async(id,limit,offset=0)=>{pages.push({limit,offset});return [...oldHistory].reverse().slice(offset,offset+limit);};
  const fullHistory=await handler.buildConversationHistory('long-history',null);
  assert.equal(fullHistory.length,260);assert.equal(fullHistory[0].content,oldHistory[0].message_body);
  assert.deepEqual(pages,[{limit:200,offset:0},{limit:200,offset:200}]);
  assert.equal((await handler.buildConversationHistory('long-history',50)).length,50);
  storage.getPatientMessages=async()=>{throw new Error('Offline history unavailable');};
  await assert.rejects(()=>handler.buildConversationHistory('long-history',null));
  const completeData={Nome_Completo:'Paciente Exemplo',Data_de_nascimento:'1990-01-01',Sexo:'feminino',Peso:65,Altura:163,Anamise_inicial:'Relato de demonstração.',Cafe_da_manha:'Ovos',Lanche_da_manha:'Não realiza a refeição',Almoco:'Arroz e feijão',Lanche_da_tarde:'Fruta',Janta:'Ovos',Ceia:'Não realiza a refeição'};
  let currentPatient={id:'handoff-patient',nutritionistId:patient.nutritionistId,fullName:'Paciente 5511999990001',status:'Anamnese Inicial'};
  storage.getPatientByWhatsappAny=async()=>currentPatient;
  storage.getPatient=async()=>currentPatient;
  storage.getPatientMessages=async(id,limit,offset=0)=>[...oldHistory].reverse().slice(offset,offset+limit);
  storage.updatePatient=async(id,update)=>{currentPatient={...currentPatient,...update};return currentPatient;};
  ai.runAnamnesisAgent=runAnamnesisAgent;
  ai.extractPatientData=async history=>{assert.equal(history[0].content,oldHistory[0].message_body);return completeData;};
  state.responseContent='**ANAMNESE_COMPLETA**\nObrigado. Seus dados foram registrados.';
  await handler.handleIncomingMessage({senderNumber:'5511999990001',messageBody:'Não faço ceia',messageType:'text'});
  assert.equal(currentPatient.status,'Acompanhamento');
  assert.equal(currentPatient.lanche_da_manha,'Não realiza a refeição');
  assert.equal(currentPatient.ceia,'Não realiza a refeição');
  assert.doesNotMatch(sent.at(-1),/ANAMNESE_COMPLETA/);
  let followupCalls=0;
  ai.runFollowUpAgent=async()=>{followupCalls++;return 'Seguimos com o acompanhamento.';};
  ai.runAnamnesisAgent=async()=>{throw new Error('Completed anamnesis must not restart');};
  const restartedHandler=new WhatsAppMessageHandler();
  await restartedHandler.handleIncomingMessage({senderNumber:'5511999990001',messageBody:'Olá novamente',messageType:'text'});
  assert.equal(followupCalls,1);assert.equal(sent.at(-1),'Seguimos com o acompanhamento.');
  ai.runAnamnesisAgent=async()=>({isComplete:true,response:'Anamnese concluída.'});
  ai.extractPatientData=async()=>({...completeData,Ceia:null});
  let incompleteUpdate;
  storage.updatePatient=async(id,update)=>{incompleteUpdate=update;return update;};
  const missingReply=await handler.handleAnamnesis({...patient,status:'Anamnese Inicial'},[],'Ainda não informei a ceia',false);
  assert.match(missingReply,/preciso completar: ceia/);assert.equal(incompleteUpdate.status,undefined);
  ai.extractPatientData=async()=>completeData;
  storage.updatePatient=async()=>undefined;
  const failedSave=await handler.handleAnamnesis({...patient,id:'failed-save'},[],'Tudo informado',false);
  assert.match(failedSave,/não consegui confirmar o registro/);assert.equal(handler.patientStageCache.has('failed-save'),false);
  console.log('Anamnesis checks passed: paginated full history, completion marker variants, skipped meals, required ceia, confirmed save and follow-up after restart (offline).');
  console.log('WhatsApp audio: Ogg/Opus parsing, authenticated download, transcription, Luna response, chat history and failure/size/URL handling passed (offline).');
} finally {
  globalThis.fetch = originalFetch;
  delete globalThis.audioTest;
  await rm(path, { force: true });
}
process.exit(0);
