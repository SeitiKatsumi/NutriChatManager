import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserCheck, Phone, Calendar, MessageSquare, CalendarClock, Sparkles, Maximize2, Minimize2, ChartNoAxesCombined } from 'lucide-react';
import type { Patient } from '@shared/schema';
import { nutritionNumber, type NutritionOverview } from '@shared/nutrition';
import { patientPhone, patientStage } from '@/lib/patient-order';
import AIInsights from './ai-insights';
import PatientSchedules from './patient-schedules';
import PatientConversation from './patient-conversation';
import PatientProfileInfo from './patient-profile-info';
import NutritionDashboard from '@/components/nutrition-dashboard';

interface PatientDetailsDialogProps { isOpen:boolean; onClose:()=>void; patient:Patient|null; initialTab?:'info'|'conversation' }
export default function PatientDetailsDialog({isOpen,onClose,patient:initialPatient,initialTab='info'}:PatientDetailsDialogProps) {
  const [expanded,setExpanded]=useState(false);
  const [tab,setTab]=useState<string>(initialTab);
  useEffect(()=>{setExpanded(false);setTab(initialTab);},[isOpen,initialPatient?.id,initialTab]);
  const {data:profile,isError,isLoading,refetch}=useQuery<{patient:Patient;nutrition:NutritionOverview}>({
    queryKey:[`/api/patients/${initialPatient?.id}/profile`],enabled:isOpen&&!!initialPatient?.id,staleTime:0,refetchInterval:isOpen?60000:false,
  });
  const patient=profile?.patient||initialPatient;
  if(!patient)return null;
  const phone=patient.whatsappNumber||patient.phone;
  const bmi=nutritionNumber(patient.bmi);
  const birth=patient.dateOfBirth?new Date(String(patient.dateOfBirth).slice(0,10)+'T12:00:00Z'):null;
  const birthLabel=birth&&Number.isFinite(birth.getTime())?birth.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):null;
  const stage=patientStage(patient.status);
  const stageColor=stage==='Acompanhamento'?'border-emerald-400/20 bg-emerald-400/10 text-emerald-300':stage==='Anamnese Inicial'?'border-sky-400/20 bg-sky-400/10 text-sky-300':'border-border bg-muted text-foreground/80';
  const body='m-0 min-h-0 flex-1 overflow-y-auto p-4 outline-none sm:p-6';
  return <Dialog open={isOpen} onOpenChange={open=>{if(!open)onClose();}}>
    <DialogContent className={`flex flex-col gap-0 overflow-hidden p-0 ${expanded?'h-[100dvh] max-h-[100dvh] w-screen max-w-none rounded-none sm:rounded-none':'h-[92dvh] max-h-[92dvh] w-[calc(100%_-_1.5rem)] max-w-6xl rounded-2xl'}`} data-testid="patient-details-card">
      <button type="button" onClick={()=>setExpanded(value=>!value)} aria-label={expanded?'Restaurar tamanho do card':'Expandir card para tela cheia'} title={expanded?'Restaurar tamanho':'Tela cheia'} aria-pressed={expanded} className="absolute right-12 top-3.5 z-10 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" data-testid="toggle-patient-fullscreen">{expanded?<Minimize2 className="h-4 w-4"/>:<Maximize2 className="h-4 w-4"/>}</button>
      <header className="shrink-0 border-b border-border bg-card/30 px-5 pb-5 pt-5 sm:px-6">
        <div className="mb-4 pr-20 text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Ficha do paciente</div>
        <div className="flex items-start gap-3 sm:gap-4"><div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-base font-semibold text-primary">{patient.fullName?.trim().split(/\s+/).slice(0,2).map(name=>name[0]).join('')||'PA'}</div><div className="min-w-0 flex-1"><DialogHeader className="space-y-1 text-left"><DialogTitle className="break-words text-xl font-semibold tracking-tight sm:text-2xl">{patient.fullName}</DialogTitle><DialogDescription className="sr-only">Ficha nutricional, histórico de medidas e conversas de {patient.fullName}.</DialogDescription></DialogHeader><div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-muted-foreground">{phone&&<span className="inline-flex items-center gap-1.5" data-testid="patient-detail-whatsapp"><Phone className="h-3 w-3"/>{patientPhone(phone)}</span>}{patient.age&&<span>{patient.age} anos</span>}{patient.gender&&<span className="capitalize">{patient.gender}</span>}{birthLabel&&<span className="inline-flex items-center gap-1.5"><Calendar className="h-3 w-3"/>{birthLabel}</span>}{bmi!==null&&<span title="IMC informado no cadastro" className="rounded-md border border-border px-2 py-0.5 font-medium text-foreground" data-testid="patient-header-bmi">IMC: {bmi.toLocaleString('pt-BR',{maximumFractionDigits:1})}</span>}</div>{patient.email&&<p className="mt-2 break-all text-[11px] text-muted-foreground" data-testid="patient-detail-email">{patient.email}</p>}</div><span className={`hidden shrink-0 rounded-full border px-3 py-1 text-[10px] font-medium sm:inline-flex ${stageColor}`}>{stage}</span></div><span className={`mt-3 inline-flex rounded-full border px-2.5 py-1 text-[10px] sm:hidden ${stageColor}`}>{stage}</span>
      </header>
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border px-3 py-3 sm:px-6"><TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{[
          {value:'info',label:'Visão geral',icon:UserCheck},{value:'evolution',label:'Evolução',icon:ChartNoAxesCombined},{value:'conversation',label:'Conversa',icon:MessageSquare},{value:'schedules',label:'Automações',icon:CalendarClock},{value:'ai',label:'IA',icon:Sparkles},
        ].map(item=><TabsTrigger key={item.value} value={item.value} className="min-w-fit flex-1 gap-2 px-3 py-2.5 text-xs" data-testid={`patient-tab-${item.value}`}><item.icon className="h-3.5 w-3.5 shrink-0"/>{item.label}</TabsTrigger>)}</TabsList></div>
        {isError&&<div role="alert" className="shrink-0 border-b border-destructive/30 px-5 py-3 text-xs text-muted-foreground">Não foi possível atualizar a ficha. Exibindo os dados disponíveis. <button className="underline" onClick={()=>refetch()}>Tentar novamente</button></div>}
        <TabsContent value="info" className={body}><PatientProfileInfo patient={patient} nutrition={profile?.nutrition} onEvolution={()=>setTab('evolution')}/></TabsContent>
        <TabsContent value="evolution" className={body}>{profile?<NutritionDashboard data={profile.nutrition} onOpen={()=>setTab('info')} compact/>:<div role="status" className="rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">{isLoading?'Carregando histórico de medidas…':'O histórico de medidas não está disponível. Tente atualizar a ficha.'}</div>}</TabsContent>
        <TabsContent value="conversation" className={body}><PatientConversation key={patient.id} patientId={String(patient.id)} patientName={patient.fullName} expanded={expanded}/></TabsContent>
        <TabsContent value="schedules" className={body}><PatientSchedules patient={patient}/></TabsContent>
        <TabsContent value="ai" className={body}><AIInsights patient={patient}/></TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>;
}
