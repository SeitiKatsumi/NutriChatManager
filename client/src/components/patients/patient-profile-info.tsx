import { Target, Droplets, Dumbbell, Moon, HeartPulse, Utensils, Wine, Brain, ClipboardList, ShieldCheck, Pill, ArrowUpRight, Scale, Ruler, Activity } from 'lucide-react';
import type { Patient } from '@shared/schema';
import { nutritionNumber, type NutritionOverview } from '@shared/nutrition';
import { profileSections } from '@shared/patient-profile';
import ReadableText from '@/components/readable-text';
import { Button } from '@/components/ui/button';

const box='rounded-2xl border border-border bg-card p-5';
const icons:Record<string,typeof Target>={objetivos:Target,saude:HeartPulse,atividade_fisica:Dumbbell,hidratacao:Droplets,sono:Moon,estresse:Brain,alcool:Wine,preferencias:Utensils,rotina_alimentar:Utensils,contexto:ClipboardList};
const meals=[['cafe_da_manha','Café da manhã'],['lanche_da_manha','Lanche da manhã'],['almoco','Almoço'],['lanche_da_tarde','Lanche da tarde'],['janta','Jantar'],['ceia','Ceia']] as const;
const number=(value:number)=>value.toLocaleString('pt-BR',{maximumFractionDigits:2});

export default function PatientProfileInfo({patient,nutrition,onEvolution}:{patient:Patient;nutrition?:NutritionOverview;onEvolution:()=>void}) {
  const legacy=patient.anamnese_inicial||patient.medicalHistory;
  const profile=profileSections(patient.anamnesisSections,legacy);
  const goal=profile.sections.find(section=>section.key==='objetivos');
  const goalLines=goal?.text.split('\n').filter(Boolean)||[];
  const explicitGoal=goalLines.find(line=>/^Objetivos nutricionais:/i.test(line));
  const goalText=explicitGoal?explicitGoal.replace(/^Objetivos nutricionais:\s*/i,''):goal?.text;
  const goalContext=explicitGoal?goalLines.filter(line=>line!==explicitGoal).join('\n'):'';
  const topics=profile.sections.filter(section=>section.key!=='objetivos');
  const person=nutrition?.patients[0];
  const records=nutrition?.measurements||[];
  const latest=records.at(-1),waist=records.filter(record=>record.waist!==null).at(-1);
  const weight=person?.weight ?? nutritionNumber(patient.weight);
  const height=person?.height ?? nutritionNumber(patient.height);
  const gap=person?.missing||[];
  const mealItems=meals.map(([field,label],index)=>({field,label,text:patient[field],index}));
  // Fallback only for older records whose individual meal fields were not populated.
  if(!mealItems.some(item=>item.text)&&patient.recordatorio_24h){
    for(const item of mealItems){const line=patient.recordatorio_24h.split('\n').find(line=>line.toLowerCase().startsWith(item.label.toLowerCase()+':'));if(line)item.text=line.slice(line.indexOf(':')+1).trim();}
  }
  const metrics=[
    {label:latest?'Último peso medido':'Peso no cadastro',value:weight&&Number.isFinite(weight)?`${number(weight)} kg`:'—',note:latest?new Date(latest.measured_on+'T12:00:00Z').toLocaleDateString('pt-BR'):weight?'Medição sem data registrada':'Peso ainda não informado',icon:Scale},
    {label:'Altura',value:height&&Number.isFinite(height)?`${number(height)} cm`:'—',note:'Informação do cadastro',icon:Ruler},
    {label:'Cintura',value:waist?.waist?`${number(waist.waist)} cm`:'—',note:waist?new Date(waist.measured_on+'T12:00:00Z').toLocaleDateString('pt-BR'):'Sem medição registrada',icon:Activity},
    {label:'Medições datadas',value:nutrition?String(records.length):'—',note:'Ver histórico e registrar',icon:ClipboardList},
  ];
  return <div className="space-y-6" data-testid="patient-profile-info">
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Medidas do paciente">{metrics.map(metric=><div key={metric.label} className="rounded-xl border border-border bg-card px-4 py-4"><div className="flex items-center justify-between gap-2"><span className="text-[11px] text-muted-foreground">{metric.label}</span><metric.icon className="h-3.5 w-3.5 shrink-0 text-primary/70"/></div><p className="mt-3 text-2xl font-semibold tabular-nums tracking-tight">{metric.value}</p><button onClick={onEvolution} className="mt-2 text-left text-[10px] text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{metric.note}</button></div>)}</section>
    {goal&&<section className="rounded-2xl border border-primary/20 bg-primary/[0.04] px-5 py-4"><div className="mb-2 flex items-center gap-2 text-primary"><Target className="h-4 w-4"/><h3 className="text-xs font-semibold uppercase tracking-wider">Objetivo do acompanhamento</h3></div><ReadableText text={goalText}/>{goalContext&&<details className="mt-3"><summary className="cursor-pointer text-[11px] text-muted-foreground">Contexto relatado do objetivo</summary><div className="pt-2"><ReadableText text={goalContext}/></div></details>}</section>}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.8fr)_minmax(250px,1fr)]">
      <section className="min-w-0" aria-labelledby="anamnesis-title"><div className="mb-4 flex items-end justify-between gap-3"><div><h3 id="anamnesis-title" className="font-semibold">Anamnese por temas</h3><p className="mt-1 text-[11px] text-muted-foreground">Informações relatadas e registradas na ficha.</p></div><span className="shrink-0 text-[10px] text-muted-foreground">{profile.structured?'Blocos estruturados':'Texto organizado por temas'}</span></div><div className="grid gap-3 md:grid-cols-2">{topics.map(section=>{const Icon=icons[section.key]||ClipboardList;return <article key={section.key} className={box}><h4 className="mb-3 flex items-center gap-2 text-xs font-semibold"><Icon className="h-4 w-4 shrink-0 text-muted-foreground"/>{section.label}</h4><ReadableText text={section.text}/></article>;})}</div>{!topics.length&&<div className={box}><ReadableText text={null}/><p className="mt-2 text-xs text-muted-foreground">A anamnese aparecerá aqui conforme as informações forem coletadas.</p></div>}{legacy&&<details className="mt-4 rounded-xl border border-border px-4 py-3"><summary className="cursor-pointer text-xs text-muted-foreground">Consultar texto original da anamnese</summary><div className="pt-4"><ReadableText text={legacy}/></div></details>}</section>
      <aside className="space-y-4"><section className={box}><h3 className="mb-3 flex items-center gap-2 text-xs font-semibold"><ShieldCheck className="h-4 w-4 text-amber-300/80"/>Restrições e intolerâncias</h3><ReadableText text={patient.dietaryRestrictions}/></section><section className={box}><h3 className="mb-3 flex items-center gap-2 text-xs font-semibold"><Pill className="h-4 w-4 text-muted-foreground"/>Suplementos e medicamentos</h3><ReadableText text={patient.suplementos_medicamentos}/></section>{gap.length>0&&<section className="rounded-xl border border-dashed border-border p-4"><h3 className="text-xs font-medium">Dados a completar</h3><div className="mt-3 flex flex-wrap gap-2">{gap.map(label=><span key={label} className="rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground">{label}</span>)}</div><Button variant="ghost" size="sm" className="mt-3 h-8 px-0 text-xs" onClick={onEvolution}>Acompanhar medidas<ArrowUpRight className="ml-1 h-3 w-3"/></Button></section>}{patient.bmi&&<p className="px-1 text-[10px] text-muted-foreground">IMC informado no cadastro: {patient.bmi}</p>}</aside>
    </div>
    <section aria-labelledby="meals-profile-title"><div className="mb-4"><h3 id="meals-profile-title" className="flex items-center gap-2 font-semibold"><Utensils className="h-4 w-4 text-muted-foreground"/>Registro alimentar</h3><p className="mt-1 text-[11px] text-muted-foreground">Relato de alimentação do paciente, organizado por refeição.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{mealItems.map(item=><article key={item.field} className={box}><div className="mb-3 flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary">{String(item.index+1).padStart(2,'0')}</span><h4 className="text-xs font-semibold">{item.label}</h4></div><ReadableText text={item.text}/></article>)}</div>{!mealItems.some(item=>item.text)&&patient.recordatorio_24h&&<div className={`${box} mt-3`}><ReadableText text={patient.recordatorio_24h}/></div>}</section>
    {patient.feedbacks&&<section className={box}><h3 className="mb-3 text-sm font-semibold">Feedbacks registrados</h3><ReadableText text={patient.feedbacks}/></section>}
    {patient.notes&&<section className={box}><h3 className="mb-3 text-sm font-semibold">Observações do nutricionista</h3><ReadableText text={patient.notes}/></section>}
  </div>;
}
