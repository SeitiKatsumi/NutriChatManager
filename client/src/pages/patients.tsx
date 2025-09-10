import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import PatientsTable from "@/components/patients/patients-table";
import PatientFormDialog from "@/components/patients/patient-form-dialog";

export default function Patients() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<any>(null);

  const { data: patients = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/patients"],
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
          <Button onClick={handleAdd} data-testid="button-add-patient">
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Paciente
          </Button>
        </div>

        <PatientsTable
          patients={filteredPatients}
          isLoading={isLoading}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
          onDelete={handleDelete}
          onEdit={handleEdit}
        />

        <PatientFormDialog
          isOpen={isFormDialogOpen}
          onClose={handleFormClose}
          patient={editingPatient}
          mode={editingPatient ? 'edit' : 'create'}
        />
      </div>
    </main>
  );
}