import { z } from 'zod';

export const profileTopics = [
  {key:'objetivos',label:'Objetivos do acompanhamento',words:/objetiv|meta\b|prazo|melhorar.*ftp|ganhar massa|perder peso/},
  {key:'saude',label:'Histórico de saúde',words:/condic|doenc|saude|cirurg|diagnost|alerg|intoler|restric/},
  {key:'atividade_fisica',label:'Atividade física',words:/trein|cicl|atleta|muscul|corrid|exercic|atividade fisica|futebol|bike/},
  {key:'hidratacao',label:'Hidratação',words:/hidrat|agua|litros?/},
  {key:'sono',label:'Sono e descanso',words:/sono|dorm|dorme|noite|descanso/},
  {key:'estresse',label:'Estresse e rotina emocional',words:/estress|ansied/},
  {key:'alcool',label:'Consumo de álcool',words:/alcool|cerveja|vinho|bebidas alcoolicas/},
  {key:'preferencias',label:'Preferências alimentares',words:/prefer|gosta|evita|nao gosta|nao come|ama comer/},
  {key:'rotina_alimentar',label:'Rotina alimentar',words:/alimenta|refeic|dieta|belisc|lanche|almoco|jantar|cafe da manha|consome|consum/},
] as const;
export type ProfileTopic = typeof profileTopics[number]['key'];
export const anamnesisSectionsSchema = z.object({
  objetivos:z.string().trim().max(2000).optional(),saude:z.string().trim().max(2000).optional(),
  atividade_fisica:z.string().trim().max(2000).optional(),hidratacao:z.string().trim().max(2000).optional(),
  sono:z.string().trim().max(2000).optional(),estresse:z.string().trim().max(2000).optional(),
  alcool:z.string().trim().max(2000).optional(),preferencias:z.string().trim().max(2000).optional(),
  rotina_alimentar:z.string().trim().max(2000).optional(),
});
export type AnamnesisSections = z.infer<typeof anamnesisSectionsSchema>;
export function readAnamnesisSections(value: unknown): AnamnesisSections {
  if (!value || typeof value!=='object' || Array.isArray(value)) return {};
  const result:AnamnesisSections={};
  for(const {key} of profileTopics){const text=(value as Record<string,unknown>)[key];if(typeof text==='string'&&text.trim()&&text.trim().length<=2000)result[key]=text.trim();}
  return result;
}
export function profileSections(structured: unknown, legacy?: string|null): {structured:boolean;sections:{key:string;label:string;text:string}[]} {
  const saved=readAnamnesisSections(structured);
  if(Object.keys(saved).length){
    const merged=new Map(profileSections(null,legacy).sections.map(section=>[section.key,section]));
    for(const topic of profileTopics)if(saved[topic.key])merged.set(topic.key,{key:topic.key,label:topic.label,text:saved[topic.key]!});
    return {structured:true,sections:Array.from(merged.values()).sort((a,b)=>a.key==='objetivos'?-1:b.key==='objetivos'?1:0)};
  }
  // ponytail: group legacy sentences without rewriting facts; the original stays available in the UI.
  const grouped=new Map<string,{key:string;label:string;text:string}>();
  const segmenter=new Intl.Segmenter('pt-BR',{granularity:'sentence'});
  for(const line of (legacy||'').split(/\n+/).filter(line=>line.trim()))for(const item of Array.from(segmenter.segment(line))){
    const sentence=item.segment.trim();if(!sentence)continue;
    const normalized=sentence.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const topic=profileTopics.find(topic=>topic.words.test(normalized))||{key:'contexto',label:'Contexto do paciente'};
    const current=grouped.get(topic.key);if(current)current.text+='\n'+sentence;else grouped.set(topic.key,{key:topic.key,label:topic.label,text:sentence});
  }
  return {structured:false,sections:Array.from(grouped.values()).sort((a,b)=>a.key==='objetivos'?-1:b.key==='objetivos'?1:0)};
}
