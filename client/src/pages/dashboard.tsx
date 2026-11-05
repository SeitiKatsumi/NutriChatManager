import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell } from 'recharts';
import { ArrowDownLeft, ArrowUpRight, ArrowRight, MessageSquare, Users, RefreshCw, Clock3, Info, CheckCircle2 } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
import { patientStage, formatLastInteraction, sortPatients } from '@/lib/patient-order';
import { useToast } from '@/hooks/use-toast';
import PatientDetailsDialog from '@/components/patients/patient-details-dialog';
import NutritionDashboard from '@/components/nutrition-dashboard';
import type { DashboardOverview, DashboardPatient } from '@shared/dashboard';

const number = (value: number) => value.toLocaleString('pt-BR');
const dateLabel = (date: string, options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }) => new Date(date.length === 10 ? `${date}T12:00:00Z` : date).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', ...options });
const stageColors: Record<string, string> = { Acompanhamento: '#34d399', 'Anamnese Inicial': '#7dd3fc', 'Em atendimento IA': '#a5b4fc', Pausado: '#94a3b8', Concluído: '#c4b5fd' };
const panel = 'rounded-2xl border border-border bg-card';

export default function Dashboard() {
  const [days, setDays] = useState(30);
  const [view, setView] = useState<'nutrition' | 'service'>('nutrition');
  const [watchTab, setWatchTab] = useState<'contact' | 'intake'>('contact');
  const [viewingPatient, setViewingPatient] = useState<any>(null);
  const [initialTab, setInitialTab] = useState<'info' | 'conversation'>('info');
  const [openingPatient, setOpeningPatient] = useState<string | number | null>(null);
  const { toast } = useToast();
  const { data, isLoading, isFetching, isError, refetch } = useQuery<DashboardOverview>({
    queryKey: [`/api/dashboard/overview?days=${days}`], refetchInterval: 60000, staleTime: 30000,
  });
  async function openPatient(patient: DashboardPatient, tab: 'info' | 'conversation') {
    setOpeningPatient(patient.id);
    try {
      const response = await apiRequest('GET', `/api/patients/${encodeURIComponent(patient.id)}`);
      setInitialTab(tab);
      setViewingPatient(await response.json());
    } catch {
      toast({ title: 'Não foi possível abrir o paciente', description: 'Tente novamente.', variant: 'destructive' });
    } finally { setOpeningPatient(null); }
  }
  const totals = data?.totals;
  const now = data ? new Date(data.generatedAt).getTime() : Date.now();
  const patients = data?.patients || [];
  const stageCounts = new Map<string, number>();
  patients.forEach(patient => { const stage = patientStage(patient.status); stageCounts.set(stage, (stageCounts.get(stage) || 0) + 1); });
  const stages = Array.from(stageCounts).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value, color: stageColors[name] || '#fbbf24' }));
  const contact = sortPatients(patients.filter(patient => !['Pausado', 'Concluído'].includes(patientStage(patient.status)) && (!patient.lastInteractionAt || now - new Date(patient.lastInteractionAt).getTime() >= 7 * 86400000)), 'interaction-asc')
    .sort((a, b) => Number(!!a.lastInteractionAt) - Number(!!b.lastInteractionAt));
  const intake = sortPatients(patients.filter(patient => patientStage(patient.status) === 'Anamnese Inicial'), 'interaction-desc');
  const watch = watchTab === 'contact' ? contact : intake;
  const recent = sortPatients(patients.filter(patient => patient.lastInteractionAt), 'interaction-desc').slice(0, 4);
  const metrics = totals ? [
    { label: 'Pacientes em conversa', value: totals.activePatients, previous: totals.previousActivePatients, icon: Users, note: `de ${number(totals.patients)} · enviaram mensagens no período`, color: 'text-primary' },
    { label: 'Mensagens recebidas', value: totals.incoming, previous: totals.previousIncoming, icon: ArrowDownLeft, note: 'enviadas pelos pacientes', color: 'text-emerald-300' },
    { label: 'Respostas registradas', value: totals.outgoing, previous: totals.previousOutgoing, icon: ArrowUpRight, note: 'mensagens de saída no histórico', color: 'text-sky-300' },
  ] : [];

  return (
    <main className="min-h-screen p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div><p className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-primary">Seu atendimento, em perspectiva</p><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl" data-testid="dashboard-title">Visão geral</h1><p className="mt-2 text-sm text-muted-foreground">Conversas, acompanhamento e os próximos passos da sua carteira.</p></div>
          <div className="flex flex-wrap items-center gap-3">
            {view === 'service' && <div className="flex rounded-lg border border-border bg-card p-1" role="group" aria-label="Período das métricas">{[7, 30].map(value => <button key={value} onClick={() => setDays(value)} aria-pressed={days === value} className={`rounded-md px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${days === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`} data-testid={`dashboard-period-${value}`}>{value} dias</button>)}</div>}
            <Button variant="outline" size="sm" className="h-10 gap-2" onClick={() => refetch()} disabled={isFetching} data-testid="btn-refresh"><RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />Atualizar</Button>
          </div>
        </header>

        <div className="flex gap-6 border-b border-border" role="group" aria-label="Visão do dashboard">{([{value:'nutrition',label:'Nutrição'},{value:'service',label:'Atendimento'}] as const).map(tab=><button key={tab.value} aria-pressed={view===tab.value} onClick={()=>setView(tab.value)} className={`border-b-2 px-1 pb-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${view===tab.value?'border-primary text-primary':'border-transparent text-muted-foreground hover:text-foreground'}`} data-testid={`dashboard-view-${tab.value}`}>{tab.label}</button>)}</div>

        {isError && <div role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm">{data ? 'Não foi possível atualizar. Os dados abaixo são da última atualização.' : 'Não foi possível carregar as métricas.'} <button className="underline underline-offset-4" onClick={() => refetch()}>Tentar novamente</button></div>}
        {isLoading && <div role="status" className={`${panel} p-8 text-sm text-muted-foreground`}>Carregando os dados do atendimento…</div>}
        {data && totals && <>
          {view === 'nutrition' && <NutritionDashboard data={data.nutrition} onOpen={id => { const patient = patients.find(person => String(person.id) === String(id)); if (patient) openPatient(patient, 'info'); }} />}
          {view === 'service' && <>
          <section aria-label="Indicadores do período" className={`${panel} grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0`}>
            {metrics.map(item => <div key={item.label} className="p-5 lg:p-6"><div className="flex items-center justify-between gap-3"><h2 className="text-xs font-medium text-muted-foreground">{item.label}</h2><item.icon className={`h-4 w-4 ${item.color}`} /></div><div className="mt-3 flex flex-wrap items-baseline gap-2"><p className="text-4xl font-semibold tabular-nums tracking-tight" data-testid={`metric-${item.label}`}>{number(item.value)}</p><span className="text-[11px] text-muted-foreground">{item.note}</span></div><p className="mt-3 text-[11px] text-muted-foreground"><span className="font-medium text-foreground/80">{number(item.previous)}</span> nos {days} dias anteriores</p></div>)}
          </section>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]">
            <section className={`${panel} min-w-0 overflow-hidden`} aria-labelledby="activity-title">
              <div className="flex flex-wrap items-start justify-between gap-4 p-5 pb-2 lg:p-6 lg:pb-2"><div><h2 id="activity-title" className="font-semibold">Ritmo das conversas</h2><p className="mt-1 text-xs text-muted-foreground">{dateLabel(data.start)} — {dateLabel(data.generatedAt)} · mensagens por dia</p></div><div className="flex gap-4 text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" />Recebidas</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-sky-300" />Saídas</span></div></div>
              <div className="h-[280px] w-full px-2 pt-5 sm:h-[300px] sm:pr-6" role="img" aria-label={`${totals.incoming} mensagens recebidas e ${totals.outgoing} saídas registradas em ${days} dias. Gráfico diário.`}>
                <ResponsiveContainer width="100%" height="100%"><AreaChart data={data.series} margin={{ top: 10, right: 10, left: -15, bottom: 8 }} accessibilityLayer>
                  <defs><linearGradient id="incoming-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#34d399" stopOpacity={0.24} /><stop offset="100%" stopColor="#34d399" stopOpacity={0.01} /></linearGradient><linearGradient id="outgoing-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7dd3fc" stopOpacity={0.12} /><stop offset="100%" stopColor="#7dd3fc" stopOpacity={0} /></linearGradient></defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" /><XAxis dataKey="date" tickFormatter={value => dateLabel(value, { day: '2-digit', month: '2-digit' })} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={10} minTickGap={28} dy={8} /><YAxis allowDecimals={false} stroke="var(--muted-foreground)" tickLine={false} axisLine={false} fontSize={10} width={48} domain={[0, (max: number) => Math.max(4, max)]} />
                  <Tooltip labelFormatter={value => dateLabel(String(value), { day: '2-digit', month: 'long' })} formatter={(value: number, name: string) => [number(value), name]} contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12, boxShadow: '0 8px 24px #0003' }} labelStyle={{ color: 'var(--foreground)', marginBottom: 8 }} />
                  <Area type="linear" dataKey="incoming" name="Recebidas" stroke="#34d399" strokeWidth={2.5} fill="url(#incoming-fill)" isAnimationActive={false} /><Area type="linear" dataKey="outgoing" name="Saídas registradas" stroke="#7dd3fc" strokeWidth={2} strokeDasharray="4 5" fill="url(#outgoing-fill)" isAnimationActive={false} />
                </AreaChart></ResponsiveContainer>
              </div>
              <div className="flex items-start gap-2 border-t border-border px-5 py-3 text-[11px] text-muted-foreground"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p>{totals.incoming + totals.outgoing ? 'Mensagens registradas por dia. Passe sobre o gráfico para consultar os valores.' : 'Nenhuma mensagem registrada neste período. Não há atividade para exibir.'}</p></div>
            </section>

            <section className={`${panel} p-5 lg:p-6`} aria-labelledby="stages-title"><h2 id="stages-title" className="font-semibold">Etapas do atendimento</h2><p className="mt-1 text-xs text-muted-foreground">Retrato atual da sua carteira</p>
              <div className="relative mx-auto my-3 h-[180px] w-[180px]" role="img" aria-label={stages.map(stage => `${stage.name}: ${stage.value}`).join(', ') || 'Nenhum paciente cadastrado'}><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={stages.length ? stages : [{ value: 1, color: 'var(--border)' }]} dataKey="value" innerRadius={67} outerRadius={83} stroke="var(--card)" strokeWidth={4} paddingAngle={stages.length > 1 ? 3 : 0} isAnimationActive={false}>{(stages.length ? stages : [{ color: 'var(--border)' }]).map((stage, index) => <Cell key={index} fill={stage.color} />)}</Pie></PieChart></ResponsiveContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="text-4xl font-semibold tracking-tight">{number(totals.patients)}</span><span className="mt-1 text-[11px] text-muted-foreground">pacientes</span></div></div>
              <ul className="space-y-3">{stages.map(stage => <li key={stage.name} className="flex items-center gap-2 text-xs"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: stage.color }} /><span className="min-w-0 flex-1">{stage.name}</span><span className="text-muted-foreground">{Math.round(stage.value / totals.patients * 100)}%</span><span className="w-6 text-right font-semibold tabular-nums">{number(stage.value)}</span></li>)}</ul>
              {!stages.length && <p className="text-center text-xs text-muted-foreground">Adicione o primeiro paciente para começar.</p>}
            </section>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.8fr)_minmax(300px,1fr)]">
            <section className={`${panel} min-w-0 overflow-hidden`} aria-labelledby="attention-title">
              <div className="flex flex-wrap items-start justify-between gap-3 p-5 lg:px-6"><div><h2 id="attention-title" className="font-semibold">Para acompanhar de perto</h2><p className="mt-1 text-xs text-muted-foreground">Uma lista objetiva para orientar seu próximo contato.</p></div><Link href="/patients"><Button size="sm" variant="ghost" className="gap-1 text-xs">Ver carteira<ArrowRight className="h-3.5 w-3.5" /></Button></Link></div>
              <div className="flex flex-wrap gap-2 px-5 pb-4 lg:px-6" role="group" aria-label="Prioridades de acompanhamento">{([{ value: 'contact', label: 'Sem contato recente', count: contact.length }, { value: 'intake', label: 'Em anamnese', count: intake.length }] as const).map(tab => <button key={tab.value} aria-pressed={watchTab === tab.value} onClick={() => setWatchTab(tab.value)} className={`rounded-lg border px-3 py-2 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${watchTab === tab.value ? 'border-primary/30 bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}>{tab.label}<span className="ml-2 opacity-70">{tab.count}</span></button>)}</div>
              <div className="divide-y divide-border border-t border-border">{watch.slice(0, 5).map(patient => <div key={patient.id} className="flex flex-wrap items-center gap-3 px-5 py-4 lg:px-6" data-testid={`dashboard-attention-${patient.id}`}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background/40 text-xs text-muted-foreground">{patient.fullName?.slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{patient.fullName}</p><p className="mt-1 text-[11px] text-muted-foreground">{watchTab === 'intake' ? 'Anamnese inicial em andamento' : !patient.lastInteractionAt ? 'Sem conversa registrada' : `Última interação há ${Math.floor((now - new Date(patient.lastInteractionAt).getTime()) / 86400000)} dias`}</p></div><Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={openingPatient !== null} onClick={() => openPatient(patient, watchTab === 'intake' ? 'info' : 'conversation')} data-testid={`dashboard-open-${patient.id}`}><MessageSquare className="h-3.5 w-3.5" />{openingPatient === patient.id ? 'Abrindo…' : watchTab === 'intake' ? 'Ver ficha' : 'Ver conversa'}</Button></div>)}</div>
              {!watch.length && <div className="flex flex-col items-center gap-2 px-6 py-10 text-center"><CheckCircle2 className="h-6 w-6 text-primary" /><p className="text-sm">{watchTab === 'contact' ? 'Nenhum paciente sem contato recente' : 'Nenhuma anamnese em andamento'}</p><p className="text-xs text-muted-foreground">{patients.length ? 'Nenhum paciente neste recorte da carteira.' : 'Sua carteira ainda está vazia.'}</p></div>}
              <p className="border-t border-border px-5 py-3 text-[10px] leading-relaxed text-muted-foreground">{watchTab === 'contact' ? 'Inclui pacientes sem histórico ou há 7 dias ou mais sem interação. Pausados e concluídos ficam fora.' : 'Pacientes na etapa Anamnese Inicial. A etapa não indica atraso ou urgência.'}{watch.length > 5 && ` Exibindo 5 de ${watch.length}.`}</p>
            </section>

            <section className={`${panel} min-w-0 p-5 lg:p-6`} aria-labelledby="recent-title"><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-muted-foreground" /><h2 id="recent-title" className="font-semibold">Últimas interações</h2></div><p className="mt-1 text-xs text-muted-foreground">Quem movimentou o atendimento por último</p><div className="mt-5 space-y-1">{recent.map(patient => <button key={patient.id} onClick={() => openPatient(patient, 'conversation')} disabled={openingPatient !== null} className="group flex w-full items-center gap-3 rounded-lg py-3 text-left hover:bg-background/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{patient.fullName}</p><p className="mt-1 text-[11px] text-muted-foreground">{formatLastInteraction(patient.lastInteractionAt)}</p></div><ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground group-hover:text-primary" /></button>)}</div>{!recent.length && <p className="py-10 text-center text-xs text-muted-foreground">As primeiras conversas aparecerão aqui.</p>}</section>
          </div>
          <footer className="flex flex-wrap justify-between gap-2 pb-2 text-[10px] leading-relaxed text-muted-foreground"><p>Fonte: histórico registrado no WhatsApp · datas e horários de Brasília.</p><p>Atualizado em {new Date(data.generatedAt).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })} · atualização a cada minuto</p></footer>
          </>}
        </>}
      </div>
      <PatientDetailsDialog isOpen={!!viewingPatient} onClose={() => setViewingPatient(null)} patient={viewingPatient} initialTab={initialTab} />
    </main>
  );
}
