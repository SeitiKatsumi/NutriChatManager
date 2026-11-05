import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';

const bundle = new URL('../node_modules/.cache/dashboard-test.mjs', import.meta.url);
await mkdir(new URL('.', bundle), { recursive: true });
const mocks = {
  storage: 'export const storage = {}; export class MemStorage {} export async function initializeStorage() {}',
  'lib/directus.js': 'export const directusClient = {}; export class DirectusClient {} export function getPatientsMode() {return "directus"}',
  'patient-history-directus': 'export const patientHistoryDirectus = {}',
  'openai-service': 'export const openaiService = {}',
  'schedule-service': 'export const scheduleService = {startScheduler() {}}',
  'whatsapp-message-handler': 'export const whatsappMessageHandler = {}',
  'twilio-whatsapp-service': 'export const twilioWhatsAppService = {}',
};
try {
  await build({ stdin: { contents: `export * from './shared/dashboard'; export {registerRoutes} from './server/routes'; export {storage} from './server/storage'; export {openaiService as ai} from './server/openai-service'; export {patientHistoryDirectus as history} from './server/patient-history-directus'; export {DirectusStorage} from './server/directus-storage';`, resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile: bundle.pathname.replace(/^\/(\w:)/, '$1'), plugins: [{ name: 'mocks', setup(plugin) { plugin.onResolve({ filter: /^\.\// }, args => { const key = args.path.replace(/^\.\/(server\/)?/, ''); if (mocks[key]) return { path: key, namespace: 'mock' }; }); plugin.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: mocks[args.path] })); } }] });
  const { buildDashboard, dashboardWindow, registerRoutes, storage, DirectusStorage, ai, history } = await import(bundle.href);
  const now = new Date('2026-11-05T15:00:00Z');
  assert.equal(dashboardWindow(7, now).start.toISOString(), '2026-10-30T03:00:00.000Z');
  assert.equal(dashboardWindow(30, now).previousStart.toISOString(), '2026-09-07T03:00:00.000Z');
  const patients = [{ id: 1, fullName: 'QA', status: 'Acompanhamento', medicalHistory: 'Must not leak' }, { id: 2, fullName: 'No messages' }];
  const message = (date_created, from_me = false, patient_id = 1) => ({ date_created, from_me, patient_id });
  const report = buildDashboard(patients, [message('2026-10-30T02:59:59Z'), message('2026-10-30T03:00:00Z'), message('2026-10-30T04:00:00Z'), message('2026-11-05T02:59:59Z', true), message('2026-11-05T03:00:00Z', true), message('2026-11-05T16:00:00Z'), message('2026-11-05T04:00:00Z', false, 999), message('2026-10-23T02:59:59Z')], 7, now);
  assert.deepEqual(report.totals, { patients: 2, activePatients: 1, incoming: 2, outgoing: 2, previousActivePatients: 1, previousIncoming: 1, previousOutgoing: 0 });
  assert.equal(report.series.length, 7);
  assert.deepEqual(report.series[0], { date: '2026-10-30', incoming: 2, outgoing: 0 });
  assert.equal(report.series[5].outgoing, 1);
  assert.equal(report.series[6].outgoing, 1);
  assert.equal(report.patients[0].medicalHistory, undefined);
  assert.equal(buildDashboard([], [], 30, now).series.length, 30);
  assert.throws(() => buildDashboard(patients, [message('invalid')], 7, now));
  const clinical = [{id:1,fullName:'QA',weight:'75,5',height:'175',medicalHistory:'Anamnese',cafe_da_manha:'Não faz',dietaryRestrictions:'Não possui'}, {id:2,fullName:'Missing',weight:'0',height:'não informado'}];
  const measurement = {id:'a',patient_id:1,measured_on:'2026-01-01',weight:'76.25',waist:null};
  const nutrition = buildDashboard(clinical, [], 7, now, [measurement,{...measurement,id:'b',measured_on:'2026-02-01',weight:'75.25',waist:'80.5'},{...measurement,id:'foreign',patient_id:999}]).nutrition;
  assert.equal(nutrition.measurements.length,2);
  assert.equal(nutrition.withEvolution,1);
  assert.equal(nutrition.patients[0].weight,75.25);
  assert.equal(nutrition.patients[1].weight,null);
  assert.equal(nutrition.meals[0].count,1);
  assert.equal(nutrition.coverage[3].count,1);
  assert.deepEqual(nutrition.patients[1].missing,['Peso','Altura','Anamnese','Registro alimentar']);
  assert.equal(buildDashboard(clinical,[],7,now,[measurement,{...measurement,id:'c'}]).nutrition.withEvolution,0);
  assert.equal(buildDashboard(clinical,[],7,now).nutrition.patients[0].weight,75.5);

  const reader = new DirectusStorage();
  const calls = [];
  reader.client = { request: async path => { calls.push(new URL(path, 'https://example.test')); return { data: calls.length === 1 ? Array(1000).fill(message(now.toISOString())) : [message(now.toISOString())] }; } };
  assert.equal((await reader.getDashboardMessageActivity([1, 2], now, now)).length, 1001);
  assert.equal(calls[0].searchParams.get('filter[patient_id][_in]'), '1,2');
  assert.equal(calls[0].searchParams.get('fields'), 'id,patient_id,from_me,date_created');
  assert.equal(calls[1].searchParams.get('offset'), '1000');
  assert.deepEqual(await reader.getDashboardMessageActivity([], now, now), []);

  let handlers, measurementHandlers, profileHandlers, planHandlers;
  const app = Object.fromEntries(['get', 'post', 'put', 'patch', 'delete', 'use'].map(method => [method, (path, ...callbacks) => { if (method === 'get' && path === '/api/dashboard/overview') handlers = callbacks; if(method==='post' && path==='/api/ai/meal-plan/:patientId')planHandlers=callbacks; if(method==='get' && path==='/api/patients/:id/profile') profileHandlers=callbacks; if(method==='post' && path==='/api/patients/:id/measurements') measurementHandlers=callbacks; }]));
  await registerRoutes(app);
  const owner = 'c1cc505d-de15-47f9-bea8-330b5d696bc7';
  let reads = 0;
  storage.getPatientsByNutritionist = async (id, token, strict) => { assert.equal(id, owner); assert.equal(strict, true); reads++; return patients; };
  storage.getDashboardMessageActivity = async ids => { assert.deepEqual(ids, [1, 2]); return []; };
  storage.getNutritionMeasurements = async ids => {assert.deepEqual(ids,[1,2]);return [];};
  async function request(days, user = { id: owner, nutritionistId: owner }) {
    let code = 200, body, cache;
    const req = { session: { user }, query: days === undefined ? {} : { days } };
    const res = { status(value) { code = value; return this; }, json(value) { body = value; return this; }, set(key, value) { cache = value; } };
    let allowed = false;
    handlers[0](req, res, () => { allowed = true; });
    if (allowed) await handlers.at(-1)(req, res);
    return { code, body, cache };
  }
  assert.equal((await request('7', null)).code, 401);
  assert.equal((await request('7', { id: 'another-user', nutritionistId: 'another-user' })).code, 403);
  for (const days of ['0', '100', '7.0', ['7'], '7&limit=-1']) assert.equal((await request(days)).code, 400);
  assert.equal(reads, 0);
  assert.equal((await request('7')).body.series.length, 7);
  assert.equal((await request()).body.series.length, 30);
  assert.equal((await request('30')).cache, 'no-store');
  storage.getDashboardMessageActivity = async () => { throw new Error('Expected test failure'); };
  assert.equal((await request('7')).code, 503);
  let writes=0;
  storage.getPatient = async id => id==='999' ? undefined : {id,nutritionistId:id==='2'?'another-user':owner};
  storage.saveNutritionMeasurement = async record => {writes++;return record;};
  const valid = {id:'5544c98c-70da-4893-bb0b-2f101de5d4f2',measured_on:'2026-01-01',weight:70.25,waist:null};
  async function save(body=valid,id='1',user={id:owner,nutritionistId:owner}) {
    let code=200,result,allowed=false;
    const req={session:{user},body,params:{id}};
    const res={status(value){code=value;return this;},json(value){result=value;return this;},set(){}};
    measurementHandlers[0](req,res,()=>{allowed=true;});
    if(allowed) await measurementHandlers.at(-1)(req,res);
    return {code,result};
  }
  assert.equal((await save(valid,'1',null)).code,401);
  assert.equal((await save(valid,'2')).code,403);
  assert.equal((await save(valid,'999')).code,404);
  assert.equal((await save(valid,'1&patient=2')).code,400);
  for(const body of [{...valid,weight:0},{...valid,weight:700.1},{...valid,weight:70.255},{...valid,waist:-1},{...valid,measured_on:'2026-02-30'},{...valid,measured_on:'2999-01-01'},{...valid,id:'invalid'},{...valid,patient_id:2}]) assert.equal((await save(body)).code,400);
  assert.equal(writes,0);
  assert.equal((await save()).code,201);
  assert.equal(writes,1);
  let profileReads=0;
  storage.getNutritionMeasurements=async ids=>{profileReads++;assert.deepEqual(ids,['1']);return [];};
  async function profile(id='1',user={id:owner,nutritionistId:owner}){
    let code=200,body,cache,allowed=false;
    const req={session:{user},params:{id}};
    const res={status(value){code=value;return this;},json(value){body=value;return this;},set(key,value){cache=value;}};
    profileHandlers[0](req,res,()=>{allowed=true;});if(allowed)await profileHandlers.at(-1)(req,res);return {code,body,cache};
  }
  assert.equal((await profile('1',null)).code,401);
  assert.equal((await profile('2')).code,403);
  assert.equal((await profile('999')).code,404);
  assert.equal((await profile('1&fields=*')).code,400);
  assert.equal(profileReads,0);
  const ownProfile=await profile();assert.equal(ownProfile.cache,'no-store');assert.equal(ownProfile.body.nutrition.patients[0].id,'1');
  let updated;
  reader.client={request:async(path,options)=>{updated=JSON.parse(options.body);return {data:{id:1,Nome_Completo:'QA',...updated}};}};
  const result=await reader.updatePatient('1',{weight:'75,55',height:'177.5',anamnesisSections:{hidratacao:'2 litros por dia'}});
  assert.equal(updated.Peso,75.55);assert.equal(updated.Altura,177.5);assert.equal(result.anamnesisSections.hidratacao,'2 litros por dia');
  let planData;
  storage.getPatient=async()=>({id:'1',fullName:'QA',nutritionistId:owner,cafe_da_manha:'2 ovos',almoco:'Arroz e feijão',janta:'Sopa',suplementos_medicamentos:'Suplemento relatado',dietaryRestrictions:'Alergia relatada',anamnesisSections:{objetivos:'Objetivo relatado'}});
  history.getPatientMessages=async()=>[];
  ai.generateMealPlan=async data=>{planData=data;return {};};
  await planHandlers.at(-1)({params:{patientId:'1'},session:{user:{nutritionistId:owner}}},{json(){},status(){return this;}});
  assert.equal(planData.currentMeals.breakfast,'2 ovos');assert.equal(planData.currentMeals.lunch,'Arroz e feijão');assert.equal(planData.currentMeals.dinner,'Sopa');assert.equal(planData.dietaryRestrictions,'Alergia relatada');assert.equal(planData.goals,'Objetivo relatado');
  let persisted, attempts=0;
  reader.client={request:async(path,options={})=>{
    if(options.method==='POST'){attempts++;persisted=JSON.parse(options.body);throw new Error('Unknown network outcome');}
    return {data:persisted?[persisted]:[]};
  }};
  const record={...valid,patient_id:1};
  assert.equal((await reader.saveNutritionMeasurement(record)).id,valid.id);
  assert.equal((await reader.saveNutritionMeasurement(record)).id,valid.id);
  assert.equal(attempts,1);
  await assert.rejects(reader.saveNutritionMeasurement({...record,weight:71}),error=>error.status===409);
  console.log('Dashboard checks passed: Brasília dates, distinct patients, scope, pagination, periods, authentication and failures.');
} finally { await rm(bundle, { force: true }); }
process.exit(0);

