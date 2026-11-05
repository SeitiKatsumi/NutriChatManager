import fs from 'node:fs/promises';
const base=process.env.DIRECTUS_URL||'https://nutrichatbot.app.11mind.com.br';
if(!process.env.DIRECTUS_TOKEN)throw new Error('DIRECTUS_TOKEN required');
async function request(path,options={}){const response=await fetch(base+path,{...options,headers:{Authorization:`Bearer ${process.env.DIRECTUS_TOKEN}`,'Content-Type':'application/json'}});if(!response.ok)throw new Error(`Schema request failed ${response.status}`);return (await response.json()).data;}
const path='/fields/Cadastro_de_Pacientes';
const before=await request(path),field=before.find(field=>field.field==='anamnese_blocos');
if(!field){
  if(!process.argv.includes('--apply')){console.log('Structured anamnesis field missing; use --apply to add it.');process.exit(0);}
  const directory=new URL('../../.codex/patient-profile-20261105/',import.meta.url);await fs.mkdir(directory,{recursive:true});
  await fs.writeFile(new URL('schema-before.json',directory),JSON.stringify(before));
  await request(path,{method:'POST',body:JSON.stringify({field:'anamnese_blocos',type:'json',meta:{interface:'input-code',options:{language:'json'},note:'Blocos relatados pelo paciente, extraídos pela IA. Texto original preservado.'},schema:{is_nullable:true}})});
}
const after=await request(path);
if(after.find(field=>field.field==='anamnese_blocos')?.type!=='json')throw new Error('Unexpected structured anamnesis field type');
console.log('Structured anamnesis schema verified. Existing patient records were not rewritten.');
