import fs from 'node:fs/promises';
const base = process.env.DIRECTUS_URL || 'https://nutrichatbot.app.11mind.com.br';
if (!process.env.DIRECTUS_TOKEN) throw new Error('DIRECTUS_TOKEN is required');
const collection = 'patient_measurements';
const fields = [
  { field:'id', type:'uuid', meta:{hidden:true,readonly:true,special:['uuid']}, schema:{is_primary_key:true,is_nullable:false} },
  { field:'patient_id', type:'integer', meta:{required:true,interface:'input'}, schema:{is_nullable:false} },
  { field:'measured_on', type:'date', meta:{required:true,interface:'datetime'}, schema:{is_nullable:false} },
  { field:'weight', type:'decimal', meta:{required:true,interface:'input',note:'Peso medido em kg'}, schema:{numeric_precision:6,numeric_scale:2,is_nullable:false} },
  { field:'waist', type:'decimal', meta:{interface:'input',note:'Cintura medida em cm'}, schema:{numeric_precision:6,numeric_scale:2,is_nullable:true} },
  { field:'date_created', type:'timestamp', meta:{hidden:true,readonly:true,special:['date-created']}, schema:{is_nullable:true} },
];
async function request(path, options={}) {
  const response = await fetch(base+path,{...options,headers:{Authorization:`Bearer ${process.env.DIRECTUS_TOKEN}`,'Content-Type':'application/json'}});
  if (!response.ok) throw new Error(`Schema request failed ${response.status}`);
  return (await response.json()).data;
}
const collections = await request('/collections');
const existing = collections.find(item=>item.collection===collection);
if (!existing) {
  if (!process.argv.includes('--apply')) {console.log('Nutrition measurement collection is missing. Use --apply to create it.');process.exit(0);}
  const backup = new URL('../../.codex/nutrition-20261105/',import.meta.url);
  await fs.mkdir(backup,{recursive:true});
  await fs.writeFile(new URL('schema-before.json',backup),JSON.stringify({collection,existed:false,at:new Date().toISOString()}));
  await request('/collections',{method:'POST',body:JSON.stringify({collection,meta:{icon:'monitor_weight',note:'Medições datadas registradas pelo nutricionista; sem acesso público.'},schema:{},fields})});
}
const actual = await request('/fields/'+collection);
for (const field of fields) {
  const saved=actual.find(item=>item.field===field.field);
  if (!saved || saved.type!==field.type) throw new Error(`Unexpected field definition: ${field.field}`);
}
const permissions = await request('/permissions?filter[collection][_eq]='+collection+'&limit=-1');
if (permissions.some(permission=>!permission.role && !permission.policy)) throw new Error('Unexpected public permissions');
console.log(`Nutrition schema verified: ${actual.length} fields; existing data preserved; no public permissions created.`);
