import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription,
  DialogFooter,
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

// Patient form schema (simplified from full insertPatientSchema)
const patientFormSchema = z.object({
  fullName: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  phone: z.string().optional(),
  whatsappNumber: z.string().optional(),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  weight: z.string().optional(),
  height: z.string().optional(),
  medicalHistory: z.string().optional(),
  dietaryRestrictions: z.string().optional(),
  goals: z.string().optional(),
  status: z.string().default("Aguardando agendamento"),
  notes: z.string().optional(),
});

type PatientFormData = z.infer<typeof patientFormSchema>;

interface PatientFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  patient?: any; // Patient to edit (undefined for create)
  mode: 'create' | 'edit';
}

export default function PatientFormDialog({ 
  isOpen, 
  onClose, 
  patient, 
  mode 
}: PatientFormDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<PatientFormData>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      whatsappNumber: "",
      dateOfBirth: "",
      gender: "",
      weight: "",
      height: "",
      medicalHistory: "",
      dietaryRestrictions: "",
      goals: "",
      status: "active",
      notes: "",
    },
  });

  // Reset form when patient changes or dialog opens
  useEffect(() => {
    if (patient && mode === 'edit') {
      form.reset({
        fullName: patient.fullName || "",
        email: patient.email || "",
        phone: patient.phone || "",
        whatsappNumber: patient.whatsappNumber || "",
        dateOfBirth: patient.dateOfBirth ? new Date(patient.dateOfBirth).toISOString().split('T')[0] : "",
        gender: patient.gender || "",
        weight: patient.weight || "",
        height: patient.height || "",
        medicalHistory: patient.medicalHistory || "",
        dietaryRestrictions: patient.dietaryRestrictions || "",
        goals: patient.goals || "",
        status: patient.status || "active",
        notes: patient.notes || "",
      });
    } else if (mode === 'create') {
      form.reset({
        fullName: "",
        email: "",
        phone: "",
        whatsappNumber: "",
        dateOfBirth: "",
        gender: "",
        weight: "",
        height: "",
        medicalHistory: "",
        dietaryRestrictions: "",
        goals: "",
        status: "active",
        notes: "",
      });
    }
  }, [patient, mode, form, isOpen]);

  const createPatientMutation = useMutation({
    mutationFn: async (data: PatientFormData) => {
      const response = await apiRequest("POST", "/api/patients", {
        ...data,
        // Convert empty strings to null
        email: data.email || null,
        phone: data.phone || null,
        whatsappNumber: data.whatsappNumber || null,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth).toISOString() : null,
        gender: data.gender || null,
        weight: data.weight || null,
        height: data.height || null,
        medicalHistory: data.medicalHistory || null,
        dietaryRestrictions: data.dietaryRestrictions || null,
        goals: data.goals || null,
        notes: data.notes || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({
        title: "Paciente criado",
        description: "O paciente foi criado com sucesso.",
      });
      onClose();
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar paciente",
        description: error.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    },
  });

  const updatePatientMutation = useMutation({
    mutationFn: async (data: PatientFormData) => {
      const response = await apiRequest("PUT", `/api/patients/${patient.id}`, {
        ...data,
        // Convert empty strings to null
        email: data.email || null,
        phone: data.phone || null,
        whatsappNumber: data.whatsappNumber || null,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth).toISOString() : null,
        gender: data.gender || null,
        weight: data.weight || null,
        height: data.height || null,
        medicalHistory: data.medicalHistory || null,
        dietaryRestrictions: data.dietaryRestrictions || null,
        goals: data.goals || null,
        notes: data.notes || null,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({
        title: "Paciente atualizado",
        description: "O paciente foi atualizado com sucesso.",
      });
      onClose();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao atualizar paciente",
        description: error.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PatientFormData) => {
    if (mode === 'create') {
      createPatientMutation.mutate(data);
    } else {
      updatePatientMutation.mutate(data);
    }
  };

  const isLoading = createPatientMutation.isPending || updatePatientMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle data-testid="patient-form-title">
            {mode === 'create' ? 'Adicionar Paciente' : 'Editar Paciente'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create' 
              ? 'Preencha os dados do novo paciente' 
              : 'Atualize as informações do paciente'
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Nome Completo */}
            <div className="md:col-span-2">
              <Label htmlFor="fullName">Nome Completo *</Label>
              <Input
                id="fullName"
                placeholder="Ex: Maria Silva Santos"
                {...form.register("fullName")}
                data-testid="input-patient-name"
              />
              {form.formState.errors.fullName && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.fullName.message}
                </p>
              )}
            </div>

            {/* Email */}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="maria@email.com"
                {...form.register("email")}
                data-testid="input-patient-email"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive mt-1">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            {/* Telefone */}
            <div>
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                placeholder="(11) 99999-9999"
                {...form.register("phone")}
                data-testid="input-patient-phone"
              />
            </div>

            {/* WhatsApp */}
            <div>
              <Label htmlFor="whatsappNumber">WhatsApp</Label>
              <Input
                id="whatsappNumber"
                placeholder="(11) 99999-9999"
                {...form.register("whatsappNumber")}
                data-testid="input-patient-whatsapp"
              />
            </div>

            {/* Data de Nascimento */}
            <div>
              <Label htmlFor="dateOfBirth">Data de Nascimento</Label>
              <Input
                id="dateOfBirth"
                type="date"
                {...form.register("dateOfBirth")}
                data-testid="input-patient-birth"
              />
            </div>

            {/* Gênero */}
            <div>
              <Label htmlFor="gender">Gênero</Label>
              <Select 
                value={form.watch("gender") || ""} 
                onValueChange={(value) => form.setValue("gender", value)}
              >
                <SelectTrigger data-testid="select-patient-gender">
                  <SelectValue placeholder="Selecionar gênero" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="masculino">Masculino</SelectItem>
                  <SelectItem value="feminino">Feminino</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                  <SelectItem value="nao_informar">Não informar</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Peso */}
            <div>
              <Label htmlFor="weight">Peso (kg)</Label>
              <Input
                id="weight"
                placeholder="70"
                {...form.register("weight")}
                data-testid="input-patient-weight"
              />
            </div>

            {/* Altura */}
            <div>
              <Label htmlFor="height">Altura (cm)</Label>
              <Input
                id="height"
                placeholder="170"
                {...form.register("height")}
                data-testid="input-patient-height"
              />
            </div>

            {/* Status */}
            <div>
              <Label htmlFor="status">Status</Label>
              <Select 
                value={form.watch("status")} 
                onValueChange={(value) => form.setValue("status", value)}
              >
                <SelectTrigger data-testid="select-patient-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Em atendimento IA">Em atendimento IA</SelectItem>
                  <SelectItem value="Aguardando agendamento">Aguardando agendamento</SelectItem>
                  <SelectItem value="Agendado">Agendado</SelectItem>
                  <SelectItem value="Aguardando retorno">Aguardando retorno</SelectItem>
                  <SelectItem value="Pausado">Pausado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Histórico Médico */}
            <div className="md:col-span-2">
              <Label htmlFor="medicalHistory">Histórico Médico</Label>
              <Textarea
                id="medicalHistory"
                placeholder="Descreva condições médicas relevantes..."
                rows={3}
                {...form.register("medicalHistory")}
                data-testid="textarea-medical-history"
              />
            </div>

            {/* Restrições Alimentares */}
            <div className="md:col-span-2">
              <Label htmlFor="dietaryRestrictions">Restrições Alimentares</Label>
              <Textarea
                id="dietaryRestrictions"
                placeholder="Alergias, intolerâncias, preferências..."
                rows={2}
                {...form.register("dietaryRestrictions")}
                data-testid="textarea-dietary-restrictions"
              />
            </div>

            {/* Objetivos */}
            <div className="md:col-span-2">
              <Label htmlFor="goals">Objetivos</Label>
              <Textarea
                id="goals"
                placeholder="Metas e objetivos nutricionais..."
                rows={2}
                {...form.register("goals")}
                data-testid="textarea-goals"
              />
            </div>

            {/* Observações */}
            <div className="md:col-span-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                placeholder="Observações gerais sobre o paciente..."
                rows={2}
                {...form.register("notes")}
                data-testid="textarea-notes"
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={onClose}
              data-testid="button-cancel-patient"
            >
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={isLoading}
              data-testid="button-save-patient"
            >
              {isLoading 
                ? (mode === 'create' ? 'Criando...' : 'Salvando...') 
                : (mode === 'create' ? 'Criar Paciente' : 'Salvar Alterações')
              }
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}