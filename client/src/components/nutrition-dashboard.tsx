import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LineChart, Line, ResponsiveContainer, CartesianGrid, XAxis, YAxis, Tooltip, BarChart, Bar } from 'recharts';
import { Scale, Ruler, Utensils, Plus, ArrowUpRight, ClipboardCheck, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { dashboardDate } from '@shared/dashboard';
import type { NutritionOverview } from '@shared/nutrition';

const panel = 'rounded-2xl border border-border bg-card';
const selectClass = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const decimal = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const shortDate = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString('pt-BR');
const tooltipStyle = { background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 12 };

export default function NutritionDashboard({ data, onOpen, compact = false }: { data: NutritionOverview; onOpen: (id: string | number) => void; compact?: boolean }) {
  const [selectedId, setSelectedId] = useState('');
  const [metric, setMetric] = useState<'weight' | 'waist'>('weight');
  const [formOpen, setFormOpen] = useState(false);
  const [formPatient, setFormPatient] = useState<{id:string | number; fullName:string} | null>(null);
  const [requestId, setRequestId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const patient = data.patients.find(person => String(person.id) === selectedId) || data.patients.find(person => person.records) || data.patients.find(person => person.weight) || data.patients[0];
  const records = data.measurements.filter(record => String(record.patient_id) === String(patient?.id));
  const points = records.filter(record => record[metric] !== null).map(record => ({ ...record, time: new Date(`${record.measured_on}T12:00:00Z`).getTime(), value: record[metric] }));
  const first = points[0], last = points.at(-1);
  const change = first && last ? last.value! - first.value! : null;
  const unit = metric === 'weight' ? 'kg' : 'cm';
  const missing = data.patients.filter(person => person.missing.length).sort((a, b) => b.missing.length - a.missing.length);
  const total = data.patients.length;
  const cards = [
    { label: 'Base antropométrica', value: data.coverage[0].count, note: 'com peso e altura informados', icon: Scale, color: 'text-emerald-300' },
    { label: 'Evolução mensurável', value: data.withEvolution, note: 'com medições em 2 ou mais datas', icon: Activity, color: 'text-sky-300' },
    { label: 'Alimentação documentada', value: data.coverage[2].count, note: 'com algum registro de refeições', icon: Utensils, color: 'text-violet-300' },
  ];
  function openForm() {
    if (!patient) return;
    setFormPatient({id:patient.id,fullName:patient.fullName}); setSelectedId(String(patient.id));
    setRequestId(crypto.randomUUID()); setSaveError(''); setFormOpen(true);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!formPatient || saving) return;
    const fields = new FormData(event.currentTarget as HTMLFormElement);
    setSaving(true); setSaveError('');
    try {
      await apiRequest('POST', `/api/patients/${formPatient.id}/measurements`, { id: requestId, measured_on: String(fields.get('measured_on')), weight: Number(fields.get('weight')), waist: fields.get('waist') ? Number(fields.get('waist')) : null });
      await queryClient.invalidateQueries({ predicate: query => String(query.queryKey[0]).startsWith('/api/dashboard/overview') || (String(query.queryKey[0]).startsWith('/api/patients/') && String(query.queryKey[0]).endsWith('/profile')) });
      setFormOpen(false);
      toast({ title: 'Medição registrada', description: 'O histórico nutricional foi atualizado.' });
    } catch { setSaveError('Não foi possível confirmar o registro. Confira os campos e tente novamente; o mesmo registro não será duplicado.'); }
    finally { setSaving(false); }
  }

  return <div className="space-y-6" data-testid={compact?"patient-measurements":"nutrition-dashboard"}>
    {!compact && <section className={`${panel} grid divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0`} aria-label="Panorama nutricional">
      {cards.map(card => <div key={card.label} className="p-5 lg:p-6"><div className="flex items-center justify-between gap-3"><h2 className="text-xs font-medium text-muted-foreground">{card.label}</h2><card.icon className={`h-4 w-4 ${card.color}`} /></div><p className="mt-3 text-4xl font-semibold tabular-nums tracking-tight">{card.value}<span className="ml-2 text-base font-normal text-muted-foreground">/ {total}</span></p><p className="mt-2 text-[11px] text-muted-foreground">{card.note}</p></div>)}
    </section>}

    <div className={`grid gap-6 ${compact ? "" : "lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]"}`}>
      <section className={`${panel} min-w-0 overflow-hidden`} aria-labelledby="evolution-title">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5 lg:px-6"><div><p className="mb-1 text-[10px] font-medium uppercase tracking-widest text-primary">Trajetória individual</p><h2 id="evolution-title" className="text-lg font-semibold">Evolução das medidas</h2></div><Button size="sm" onClick={openForm} disabled={!patient} className="gap-1.5" data-testid="add-measurement"><Plus className="h-3.5 w-3.5" />Registrar medição</Button></div>
        <div className="grid gap-3 px-5 sm:grid-cols-[minmax(0,1fr)_180px] lg:px-6"><select aria-label="Paciente da evolução" value={patient?.id || ''} onChange={event => setSelectedId(event.target.value)} className={selectClass}>{data.patients.length ? data.patients.map(person => <option key={person.id} value={person.id}>{person.fullName}</option>) : <option value="">Nenhum paciente</option>}</select><select aria-label="Medida do gráfico" className={selectClass} value={metric} onChange={event => setMetric(event.target.value as 'weight' | 'waist')}><option value="weight">Peso · kg</option><option value="waist">Cintura · cm</option></select></div>
        <div className="flex flex-wrap items-end gap-6 px-5 pt-5 lg:px-6"><div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{last ? 'Última medição' : metric === 'weight' ? 'Peso no cadastro' : 'Cintura'}</p><p className="mt-1 text-3xl font-semibold">{last ? decimal(last.value!) : metric === 'weight' && patient?.weight ? decimal(patient.weight) : '—'}<span className="ml-1.5 text-sm font-normal text-muted-foreground">{unit}</span></p><p className="mt-1 text-[10px] text-muted-foreground">{last ? shortDate(last.measured_on) : metric === 'weight' && patient?.weight ? 'Data da medição não registrada' : 'Sem medição registrada'}</p></div>{points.length >= 2 && <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Variação no histórico</p><p className="mt-1 text-xl font-medium">{change! > 0 ? '+' : ''}{decimal(change!)} <span className="text-sm text-muted-foreground">{unit}</span></p><p className="mt-1 text-[10px] text-muted-foreground">{shortDate(first.measured_on)} — {shortDate(last!.measured_on)}</p></div>}</div>
        {points.length ? <div className="h-[235px] px-2 pt-5 sm:pr-5" role="img" aria-label={`Histórico de ${metric === 'weight' ? 'peso' : 'cintura'} de ${patient?.fullName}: ${points.length} medições`}><ResponsiveContainer width="100%" height="100%"><LineChart data={points} margin={{ top: 12, right: 20, left: 0, bottom: 8 }} accessibilityLayer><CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 5" /><XAxis type="number" dataKey="time" domain={['dataMin', 'dataMax']} tickFormatter={time => new Date(time).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',timeZone:'America/Sao_Paulo'})} tickLine={false} axisLine={false} fontSize={10} stroke="var(--muted-foreground)" minTickGap={35} /><YAxis dataKey="value" domain={[(min: number) => Math.max(0, Math.floor(min - 2)), (max: number) => Math.ceil(max + 2)]} tickLine={false} axisLine={false} fontSize={10} stroke="var(--muted-foreground)" width={46} /><Tooltip labelFormatter={value => new Date(Number(value)).toLocaleDateString('pt-BR')} formatter={(value: number) => [`${decimal(value)} ${unit}`, metric === 'weight' ? 'Peso' : 'Cintura']} contentStyle={tooltipStyle} labelStyle={{color:'var(--foreground)'}} /><Line type="linear" dataKey="value" stroke={metric === 'weight' ? '#34d399' : '#7dd3fc'} strokeWidth={2.5} dot={{r:4,fill:'var(--card)',strokeWidth:2}} activeDot={{r:6}} isAnimationActive={false} /></LineChart></ResponsiveContainer></div> : <div className="mx-5 my-5 flex min-h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/20 px-5 text-center"><div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10"><Ruler className="h-5 w-5 text-primary" /></div><p className="text-sm font-medium">O próximo registro começa esta curva</p><p className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">Registre uma medição com data para acompanhar a trajetória deste paciente.</p></div>}
        <p className="border-t border-border px-5 py-3 text-[10px] leading-relaxed text-muted-foreground">{points.length === 1 ? 'Primeiro ponto registrado. Uma segunda data permitirá comparar a evolução.' : 'Histórico completo de medições registradas. O peso sem data do cadastro fica fora da curva.'}</p>
      </section>

      {!compact && <section className={`${panel} p-5 lg:p-6`} aria-labelledby="coverage-title"><div className="mb-5 flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-muted-foreground" /><h2 id="coverage-title" className="font-semibold">Base para o acompanhamento</h2></div><p className="mb-6 text-xs leading-relaxed text-muted-foreground">Informações disponíveis na carteira atual. Cada barra representa pacientes com o dado registrado.</p><div className="space-y-6">{data.coverage.map(item => <div key={item.label}><div className="mb-2 flex justify-between gap-3 text-xs"><span>{item.label}</span><span className="tabular-nums text-muted-foreground">{item.count} / {total}</span></div><div className="h-2.5 overflow-hidden rounded-full bg-background/50" role="meter" aria-label={item.label} aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={item.count}><div className="h-full rounded-full transition-all" style={{width:`${total ? item.count / total * 100 : 0}%`,background:item.color}} /></div></div>)}</div><p className="mt-6 text-[10px] leading-relaxed text-muted-foreground">Restrições documentadas incluem respostas como “não possui”. Anamnese indica texto registrado na ficha.</p></section>}
    </div>

    {!compact && <div className="grid gap-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
      <section className={`${panel} min-w-0 p-5 lg:p-6`} aria-labelledby="meals-title"><h2 id="meals-title" className="font-semibold">O mapa dos registros alimentares</h2><p className="mt-1 text-xs text-muted-foreground">Cobertura das informações de cada refeição na ficha.</p><div className="mt-5 flex gap-5 text-[11px] text-muted-foreground"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-violet-300" />Com registro</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-500/30" />Sem registro</span></div><div className="mt-4 h-[255px]" role="img" aria-label={data.meals.map(meal=>`${meal.label}: ${meal.count} de ${total} pacientes com registro`).join('; ')}><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={data.meals} margin={{left:0,right:5,top:0,bottom:0}} accessibilityLayer><CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 5" /><XAxis type="number" domain={[0,total || 1]} allowDecimals={false} tickLine={false} axisLine={false} fontSize={10} stroke="var(--muted-foreground)" /><YAxis type="category" dataKey="label" tickLine={false} axisLine={false} width={108} fontSize={10} stroke="var(--muted-foreground)" /><Tooltip formatter={(value:number,name:string)=>[`${value} paciente${value===1?'':'s'}`,name]} contentStyle={tooltipStyle} labelStyle={{color:'var(--foreground)'}} cursor={{fill:'var(--background)',opacity:0.3}} /><Bar dataKey="count" name="Com registro" stackId="meals" fill="#a5b4fc" barSize={15} isAnimationActive={false} /><Bar dataKey="missing" name="Sem registro" stackId="meals" fill="#64748b" fillOpacity={0.2} barSize={15} radius={[0,4,4,0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div><p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">Uma refeição descrita como “não faz” conta como informação registrada. Este gráfico mostra a coleta de dados alimentares.</p></section>

      <section className={`${panel} min-w-0 overflow-hidden`} aria-labelledby="gaps-title"><div className="p-5 lg:p-6"><h2 id="gaps-title" className="font-semibold">Próximos dados a coletar</h2><p className="mt-1 text-xs text-muted-foreground">Abra a ficha para completar o acompanhamento.</p></div><div className="divide-y divide-border">{missing.map(person => <button key={person.id} onClick={()=>onOpen(person.id)} className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-background/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:px-6"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{person.fullName}</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{person.missing.join(' · ')}</p></div><ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground" /></button>)}</div>{!missing.length && <p className="px-6 pb-8 text-xs text-muted-foreground">{total ? 'Todos os pacientes têm os quatro dados básicos registrados.' : 'Adicione pacientes para começar o acompanhamento.'}</p>}</section>
    </div>}
    {!compact && <p className="text-[10px] text-muted-foreground">Nutrição: situação atual da carteira e histórico completo de medições.</p>}

    <Dialog open={formOpen} onOpenChange={open => { if (!saving) setFormOpen(open); }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle className="pr-6">Registrar medição</DialogTitle><DialogDescription>{formPatient?.fullName} · registre a data em que a medida foi obtida.</DialogDescription></DialogHeader><form onSubmit={save} className="space-y-4"><label className="block space-y-2 text-sm"><span>Data da medição</span><Input aria-label="Data da medição" type="date" required min="1900-01-01" max={dashboardDate(new Date())} name="measured_on" defaultValue={dashboardDate(new Date())} disabled={saving} /></label><div className="grid grid-cols-2 gap-4"><label className="block space-y-2 text-sm"><span>Peso · kg</span><Input aria-label="Peso em kg" type="number" min="0.1" max="700" step="0.01" required name="weight" disabled={saving} placeholder="Ex.: 75,5" /></label><label className="block space-y-2 text-sm"><span>Cintura · cm <span className="text-[10px] text-muted-foreground">opcional</span></span><Input aria-label="Cintura em cm" type="number" min="10" max="400" step="0.01" name="waist" disabled={saving} placeholder="Ex.: 82" /></label></div><p className="text-xs leading-relaxed text-muted-foreground">O registro ficará no histórico de evolução. Os dados gerais da ficha podem ser atualizados pela edição do paciente.</p>{saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="ghost" disabled={saving} onClick={()=>setFormOpen(false)}>Cancelar</Button><Button type="submit" disabled={saving}>{saving?'Salvando…':'Salvar medição'}</Button></div></form></DialogContent></Dialog>
  </div>;
}
