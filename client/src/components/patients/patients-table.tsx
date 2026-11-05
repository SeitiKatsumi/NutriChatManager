import { useEffect, useState } from 'react';
import { Search, MoreHorizontal, MessageSquare, FileText, Phone, Pencil, Trash2, Users, ArrowUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { sortPatients, formatLastInteraction, patientStage, patientPhone } from '@/lib/patient-order';

interface PatientsTableProps {
  patients: any[]; totalCount: number; stages: string[]; isLoading: boolean;
  searchTerm: string; onSearchChange: (term: string) => void;
  selectedStatus: string; onStatusChange: (status: string) => void;
  onDelete: (id: string, name: string) => void; onEdit: (patient: any) => void;
  onView: (patient: any, tab?: 'info' | 'conversation') => void;
}

export default function PatientsTable({ patients, totalCount, stages, isLoading, searchTerm, onSearchChange, selectedStatus, onStatusChange, onDelete, onEdit, onView }: PatientsTableProps) {
  const [page, setPage] = useState(1);
  const [order, setOrder] = useState('interaction-desc');
  useEffect(() => { setPage(1); }, [searchTerm, selectedStatus, order]);
  const pages = Math.max(1, Math.ceil(patients.length / 10));
  const current = Math.min(page, pages);
  const visible = sortPatients(patients, order).slice((current - 1) * 10, current * 10);
  const filtered = !!searchTerm || (!!selectedStatus && selectedStatus !== 'all');
  const selectClass = 'h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card" aria-label="Lista de pacientes">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
        <div><h2 className="font-semibold">Sua carteira de pacientes</h2><p className="mt-1 text-xs text-muted-foreground">Acesse a conversa, consulte a ficha ou continue o contato.</p></div>
        <span role="status" className="text-xs text-muted-foreground">{patients.length} de {totalCount} pacientes</span>
      </div>
      <div className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_210px_260px]">
        <label className="relative block"><span className="sr-only">Buscar pacientes</span><Search aria-hidden="true" className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input value={searchTerm} onChange={e => onSearchChange(e.target.value)} placeholder="Buscar por nome ou WhatsApp" className="pl-9" data-testid="input-search-patients" />
        </label>
        <select aria-label="Filtrar por etapa" value={selectedStatus || 'all'} onChange={e => onStatusChange(e.target.value)} className={selectClass} data-testid="select-status-filter">
          <option value="all">Todas as etapas</option><option value="__no_interaction">Sem conversa registrada</option>
          {stages.map(stage => <option key={stage} value={stage}>{stage}</option>)}
        </select>
        <label className="flex items-center gap-2 sm:col-span-2 lg:col-span-1"><ArrowUpDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          <select aria-label="Ordenar pacientes por" value={order} onChange={e => setOrder(e.target.value)} className={selectClass} data-testid="select-patient-order">
            <option value="interaction-desc">Interação: mais recente</option><option value="interaction-asc">Interação: mais antiga</option>
            <option value="name-asc">Nome: A–Z</option><option value="name-desc">Nome: Z–A</option>
            <option value="created-desc">Cadastro: mais recente</option><option value="created-asc">Cadastro: mais antigo</option>
          </select>
        </label>
        {filtered && <Button variant="ghost" size="sm" onClick={() => { onSearchChange(''); onStatusChange('all'); }} className="w-fit gap-2 text-muted-foreground"><X className="h-3 w-3" />Limpar filtros</Button>}
      </div>
      <div role="table" aria-label="Pacientes e acompanhamento">
        <div role="row" className="hidden grid-cols-[minmax(180px,1.2fr)_minmax(150px,1fr)_minmax(160px,1fr)_auto] gap-4 border-b border-border bg-background/30 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground lg:grid">
          <div role="columnheader">Paciente / contato</div><div role="columnheader">Etapa do atendimento</div><div role="columnheader">Última interação</div><div role="columnheader" className="w-[260px]">Acesso rápido</div>
        </div>
        <div role="rowgroup" className="divide-y divide-border">
          {isLoading ? <div role="status" className="p-10 text-center text-sm text-muted-foreground">Carregando pacientes...</div> : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center"><Users className="h-9 w-9 text-muted-foreground" /><p className="font-medium">{filtered ? 'Nenhum paciente com esses filtros' : 'Sua carteira começa aqui'}</p><p className="text-sm text-muted-foreground">{filtered ? 'Tente outro nome, telefone ou etapa.' : 'Adicione um paciente para iniciar o acompanhamento.'}</p></div>
          ) : visible.map(patient => {
            const stage = patientStage(patient.status);
            const phone = String(patient.whatsappNumber || patient.phone || '').replace(/\D/g, '');
            const color = stage === 'Acompanhamento' ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : stage === 'Anamnese Inicial' ? 'border-sky-400/25 bg-sky-400/10 text-sky-300' : stage === 'Pausado' ? 'border-border bg-muted text-muted-foreground' : 'border-amber-400/25 bg-amber-400/10 text-amber-200';
            return (
              <div key={patient.id} role="row" className="grid items-center gap-4 px-5 py-3 transition-colors hover:bg-background/20 sm:grid-cols-2 lg:grid-cols-[minmax(180px,1.2fr)_minmax(150px,1fr)_minmax(160px,1fr)_auto]" data-testid={`patient-row-${patient.id}`}>
                <div role="cell" className="flex min-w-0 items-center gap-3">
                  <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/5 text-sm font-semibold text-primary">{patient.fullName?.trim().slice(0, 2).toUpperCase() || 'PA'}</span>
                  <div className="min-w-0"><button onClick={() => onView(patient)} className="block max-w-full truncate text-left text-sm font-semibold hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" title={patient.fullName} data-testid={`patient-name-${patient.id}`}>{patient.fullName}</button>
                    <p className="mt-1 text-xs text-muted-foreground">{patientPhone(patient.whatsappNumber || patient.phone)}</p>
                  </div>
                </div>
                <div role="cell"><span className={`inline-flex max-w-full rounded-full border px-2.5 py-1 text-xs font-medium ${color}`} data-testid={`patient-status-${patient.id}`}>{stage}</span></div>
                <div role="cell" data-testid={`last-interaction-${patient.id}`}><p className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground lg:hidden">Última interação</p><p className="text-xs text-foreground/80">{formatLastInteraction(patient.lastInteractionAt)}</p><p className="mt-1 text-[11px] text-muted-foreground">{patient.lastInteractionAt ? 'Mensagem no WhatsApp' : 'Ainda sem histórico de mensagens'}</p></div>
                <div role="cell" className="flex flex-wrap items-center gap-2 sm:justify-end lg:w-[260px]">
                  <Button size="sm" variant="outline" className="gap-1.5 border-primary/25 text-primary hover:bg-primary/10" onClick={() => onView(patient, 'conversation')} data-testid={`conversation-patient-${patient.id}`}><MessageSquare className="h-3.5 w-3.5" />Conversa</Button>
                  <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => onView(patient)} data-testid={`view-patient-${patient.id}`}><FileText className="h-3.5 w-3.5" />Ficha</Button>
                  <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Mais ações para ${patient.fullName}`} data-testid={`patient-actions-${patient.id}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {/^\d{10,15}$/.test(phone) && <DropdownMenuItem asChild><a href={`https://wa.me/${phone.length <= 11 ? '55' : ''}${phone}`} target="_blank" rel="noopener noreferrer"><Phone className="mr-2 h-4 w-4" />Abrir WhatsApp</a></DropdownMenuItem>}
                      <DropdownMenuItem onClick={() => onEdit(patient)} data-testid={`edit-patient-${patient.id}`}><Pencil className="mr-2 h-4 w-4" />Editar cadastro</DropdownMenuItem>
                      <DropdownMenuSeparator /><DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(patient.id, patient.fullName)} data-testid={`delete-patient-${patient.id}`}><Trash2 className="mr-2 h-4 w-4" />Remover paciente</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {pages > 1 && <div className="flex items-center justify-between gap-3 border-t border-border p-4 text-xs text-muted-foreground"><span>Página {current} de {pages}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={current === 1} onClick={() => setPage(current - 1)}>Anterior</Button><Button variant="outline" size="sm" disabled={current === pages} onClick={() => setPage(current + 1)}>Próxima</Button></div></div>}
    </section>
  );
}
