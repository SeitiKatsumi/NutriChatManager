import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Users, ClipboardList, Activity, MessageSquare, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { matchesPatient, patientStage } from '@/lib/patient-order';
import PatientsTable from "@/components/patients/patients-table";
import PatientFormDialog from "@/components/patients/patient-form-dialog";
import PatientDetailsDialog from "@/components/patients/patient-details-dialog";

export default function Patients() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<any>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [viewingPatient, setViewingPatient] = useState<any>(null);
  const [initialTab, setInitialTab] = useState<'info' | 'conversation'>('info');

  const { data: patients = [], isLoading, error, refetch, isFetching } = useQuery<any[]>({
    queryKey: ["/api/patients"],
    staleTime: 0,
    refetchInterval: 15000,
  });


  const deletePatientMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/patients/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({
        title: "Paciente removido",
        description: "O paciente foi removido com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao remover paciente",
        description: "Tente novamente mais tarde.",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Tem certeza que deseja remover ${name}?`)) {
      deletePatientMutation.mutate(id);
    }
  };

  const handleEdit = (patient: any) => {
    setEditingPatient(patient);
    setIsFormDialogOpen(true);
  };

  const handleAdd = () => {
    setEditingPatient(null);
    setIsFormDialogOpen(true);
  };

  const handleFormClose = () => {
    setIsFormDialogOpen(false);
    setEditingPatient(null);
  };

  const handleView = (patient: any, tab: 'info' | 'conversation' = 'info') => {
    setInitialTab(tab);
    setViewingPatient(patient);
    setIsDetailsDialogOpen(true);
  };

  const handleDetailsClose = () => {
    setIsDetailsDialogOpen(false);
    setViewingPatient(null);
  };

  const filteredPatients = patients.filter(patient => matchesPatient(patient, searchTerm, selectedStatus));
  const stages = Array.from(new Set(patients.map(patient => patientStage(patient.status)))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const summaries = [
    {label:'Todos os pacientes', value:'all', count:patients.length, icon:Users, note:'Sua carteira completa'},
    {label:'Anamnese inicial', value:'Anamnese Inicial', count:patients.filter(p=>patientStage(p.status)==='Anamnese Inicial').length, icon:ClipboardList, note:'Coleta de informações'},
    {label:'Em acompanhamento', value:'Acompanhamento', count:patients.filter(p=>patientStage(p.status)==='Acompanhamento').length, icon:Activity, note:'Evolução e rotina alimentar'},
    {label:'Sem conversa', value:'__no_interaction', count:patients.filter(p=>!p.lastInteractionAt).length, icon:MessageSquare, note:'Nenhuma interação registrada'},
  ];

  return (
    <main className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Patients Header */}
        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="patients-title">
              Pacientes
            </h1>
            <p className="text-muted-foreground">
              Organize seu atendimento e acompanhe cada conversa em um só lugar.
            </p>
          </div>
          <div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} aria-label="Atualizar pacientes"><RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /></Button><Button onClick={handleAdd} data-testid="button-add-patient">
            <Plus className="w-4 h-4 mr-2" />
            Novo paciente
          </Button></div>
        </div>



        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summaries.map(item => { const selected = (selectedStatus || 'all') === item.value; return (
            <button key={item.value} onClick={() => setSelectedStatus(item.value)} aria-pressed={selected} className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-primary/45 bg-primary/5' : 'border-border bg-card hover:border-primary/30'}`}>
              <div className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{item.label}</span><item.icon aria-hidden="true" className={`h-4 w-4 ${selected ? 'text-primary' : 'text-muted-foreground'}`} /></div>
              <p className="mt-3 text-2xl font-semibold tracking-tight">{isLoading ? '—' : item.count}</p><p className="mt-1 text-[11px] text-muted-foreground">{item.note}</p>
            </button>
          ); })}
        </div>
        {error && <div role="alert" className="mb-4 rounded-lg border border-destructive/40 p-4 text-sm">Não foi possível carregar os pacientes. Use Atualizar para tentar novamente.</div>}
        <PatientsTable
          patients={filteredPatients}
          totalCount={patients.length}
          stages={stages}
          isLoading={isLoading}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
          onDelete={handleDelete}
          onEdit={handleEdit}
          onView={handleView}
        />

        <PatientFormDialog
          isOpen={isFormDialogOpen}
          onClose={handleFormClose}
          patient={editingPatient}
          mode={editingPatient ? 'edit' : 'create'}
        />

        <PatientDetailsDialog
          isOpen={isDetailsDialogOpen}
          onClose={handleDetailsClose}
          patient={viewingPatient}
          initialTab={initialTab}
        />
      </div>
    </main>
  );
}
