import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, AlertCircle, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

  const { data: patients = [], isLoading, error } = useQuery<any[]>({
    queryKey: ["/api/patients"],
  });

  const isSubscriptionError = error && (error as any)?.status === 402;

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

  const handleView = (patient: any) => {
    setViewingPatient(patient);
    setIsDetailsDialogOpen(true);
  };

  const handleDetailsClose = () => {
    setIsDetailsDialogOpen(false);
    setViewingPatient(null);
  };

  const filteredPatients = patients.filter((patient: any) => {
    const matchesSearch = 
      patient.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      patient.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      patient.phone?.includes(searchTerm);
    const matchesStatus = !selectedStatus || selectedStatus === "all" || patient.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <main className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Patients Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="patients-title">
              Gerenciar Pacientes
            </h1>
            <p className="text-muted-foreground">
              Administre seus pacientes e acompanhe seus atendimentos
            </p>
          </div>
          <Button onClick={handleAdd} data-testid="button-add-patient" disabled={!!isSubscriptionError}>
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Paciente
          </Button>
        </div>

        {isSubscriptionError && (
          <Alert variant="destructive" className="mb-6 border-orange-500 bg-orange-500/10">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            <AlertTitle className="text-orange-500 font-semibold">
              Sua assinatura expirou
            </AlertTitle>
            <AlertDescription className="text-orange-400">
              <p className="mb-3">
                Para continuar gerenciando seus pacientes e utilizar todos os recursos da plataforma, 
                renove sua assinatura.
              </p>
              <Link href="/dashboard/assinatura">
                <Button variant="outline" className="border-orange-500 text-orange-500 hover:bg-orange-500/20">
                  <CreditCard className="w-4 h-4 mr-2" />
                  Renovar Assinatura
                </Button>
              </Link>
            </AlertDescription>
          </Alert>
        )}

        <PatientsTable
          patients={filteredPatients}
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
        />
      </div>
    </main>
  );
}