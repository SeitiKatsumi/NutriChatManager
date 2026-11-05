import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir,rm } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const output=new URL('../node_modules/.cache/patient-profile-test.mjs',import.meta.url);
await mkdir(new URL('.',output),{recursive:true});
try{
  await build({stdin:{contents:`export * from './shared/patient-profile'; export {default as ReadableText} from './client/src/components/readable-text'; export {default as ProfileInfo} from './client/src/components/patients/patient-profile-info';`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic',outfile:output.pathname.replace(/^\/([A-Z]:)/,'$1')});
  const {profileSections,readAnamnesisSections,ReadableText,ProfileInfo}=await import(output.href);
  const sentences=['É atleta de ciclismo e treina de 10 a 12 horas por semana.','Bebe 2,5 litros de água por dia.','Dorme cerca de 7 horas por noite.','Estresse de 7 em 10.','Não possui restrições alimentares.','Objetivos nutricionais: melhorar o FTP para 350W.'];
  const legacy=sentences.join(' '),result=profileSections(null,legacy);
  assert.equal(result.structured,false);
  for(const sentence of sentences)assert.ok(result.sections.some(section=>section.text.includes(sentence)),sentence);
  assert.equal(result.sections.find(section=>section.key==='hidratacao').text,sentences[1]);
  const merged=profileSections({sono:'Sono atualizado: 8 horas'},legacy);
  assert.ok(merged.sections.some(section=>section.text===sentences[1]));
  assert.equal(merged.sections.find(section=>section.key==='sono').text,'Sono atualizado: 8 horas');
  assert.deepEqual(readAnamnesisSections({sono:4,extra:'descartar',hidratacao:'  2 litros  ',alcool:'x'.repeat(2001)}),{hidratacao:'2 litros'});
  const markup=renderToStaticMarkup(React.createElement(ReadableText,{text:'## Rotina\n- **Água**: 2,5 litros\n<img src=x onerror=alert(1)>'}));
  assert.ok(markup.includes('<strong'));assert.ok(markup.includes('&lt;img'));assert.ok(!markup.includes('<img'));
  const html=renderToStaticMarkup(React.createElement(ProfileInfo,{patient:{id:'1',fullName:'QA',anamnese_inicial:legacy,cafe_da_manha:'2 ovos, 1 tapioca',status:'Acompanhamento'},onEvolution(){}}));
  assert.ok(html.includes('Atividade física'));assert.ok(html.includes('Registro alimentar'));assert.ok(html.includes('2 ovos, 1 tapioca'));assert.ok(html.includes('Consultar texto original'));assert.ok(html.includes('350W'));
  console.log('Profile checks passed: fact-preserving legacy grouping, partial structured data, quantities, escaping and meal display.');
}finally{await rm(output,{force:true});}
