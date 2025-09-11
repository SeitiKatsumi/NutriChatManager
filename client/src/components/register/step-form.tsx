import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { User, Mail, Lock, ChevronRight, ChevronLeft, Check, Phone, MapPin } from "lucide-react";

const step1Schema = z.object({
  fullName: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  crn: z.string().min(5, "CRN deve ter pelo menos 5 caracteres"),
});

const step2Schema = z.object({
  phone: z.string().min(10, "Telefone inválido"),
  address: z.string().min(10, "Endereço deve ter pelo menos 10 caracteres"),
  specialization: z.string().min(1, "Selecione uma especialização"),
});

const step3Schema = z.object({
  whatsappNumber: z.string().min(10, "WhatsApp inválido"),
  welcomeMessage: z.string().min(10, "Mensagem deve ter pelo menos 10 caracteres"),
  workingHours: z.string(),
  termsAccepted: z.boolean().refine(val => val === true, "Aceite os termos para continuar"),
});

interface StepFormProps {
  currentStep: number;
  onStepChange: (step: number) => void;
  onComplete: () => void;
}

export default function StepForm({ currentStep, onStepChange, onComplete }: StepFormProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState<any>({});

  const step1Form = useForm({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      crn: "",
    },
  });

  const step2Form = useForm({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      phone: "",
      address: "",
      specialization: "",
    },
  });

  const step3Form = useForm({
    resolver: zodResolver(step3Schema),
    defaultValues: {
      whatsappNumber: "",
      welcomeMessage: "Olá! Sou o assistente virtual. Como posso ajudá-lo hoje?",
      workingHours: "commercial",
      termsAccepted: false,
    },
  });

  const createNutritionistMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/nutritionists", data);
      return response.json();
    },
    onSuccess: () => {
      // Invalidate nutritionists cache so the users page shows the new user immediately
      queryClient.invalidateQueries({ queryKey: ["/api/nutritionists"] });
      
      toast({
        title: "Conta criada com sucesso!",
        description: "Bem-vindo ao NutriChatBot.",
      });
      onComplete();
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar conta",
        description: error.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    },
  });

  const handleStep1Submit = (data: z.infer<typeof step1Schema>) => {
    setFormData({ ...formData, ...data });
    onStepChange(2);
  };

  const handleStep2Submit = (data: z.infer<typeof step2Schema>) => {
    setFormData({ ...formData, ...data });
    onStepChange(3);
  };

  const handleStep3Submit = (data: z.infer<typeof step3Schema>) => {
    const finalData = { ...formData, ...data };
    delete finalData.termsAccepted;
    createNutritionistMutation.mutate(finalData);
  };

  if (currentStep === 1) {
    return (
      <form onSubmit={step1Form.handleSubmit(handleStep1Submit)} className="space-y-6">
        <div>
          <Label htmlFor="fullName" className="block text-sm font-medium text-foreground mb-2">
            Nome Completo
          </Label>
          <div className="relative">
            <Input
              id="fullName"
              placeholder="Ex: Dr. João Silva Santos"
              {...step1Form.register("fullName")}
              className="pl-10"
              data-testid="input-fullname"
            />
            <User className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
          </div>
          {step1Form.formState.errors.fullName && (
            <p className="text-sm text-destructive mt-1">
              {step1Form.formState.errors.fullName.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
            E-mail Profissional
          </Label>
          <div className="relative">
            <Input
              id="email"
              type="email"
              placeholder="contato@nutricionista.com"
              {...step1Form.register("email")}
              className="pl-10"
              data-testid="input-email"
            />
            <Mail className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
          </div>
          {step1Form.formState.errors.email && (
            <p className="text-sm text-destructive mt-1">
              {step1Form.formState.errors.email.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
            Senha
          </Label>
          <div className="relative">
            <Input
              id="password"
              type="password"
              placeholder="Mínimo 8 caracteres"
              {...step1Form.register("password")}
              className="pl-10"
              data-testid="input-password"
            />
            <Lock className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
          </div>
          {step1Form.formState.errors.password && (
            <p className="text-sm text-destructive mt-1">
              {step1Form.formState.errors.password.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="crn" className="block text-sm font-medium text-foreground mb-2">
            CRN (Registro Profissional)
          </Label>
          <Input
            id="crn"
            placeholder="Ex: CRN-3 12345"
            {...step1Form.register("crn")}
            data-testid="input-crn"
          />
          {step1Form.formState.errors.crn && (
            <p className="text-sm text-destructive mt-1">
              {step1Form.formState.errors.crn.message}
            </p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full"
          data-testid="button-next-step1"
        >
          <span>Próximo Passo</span>
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </form>
    );
  }

  if (currentStep === 2) {
    return (
      <form onSubmit={step2Form.handleSubmit(handleStep2Submit)} className="space-y-6">
        <div>
          <Label htmlFor="phone" className="block text-sm font-medium text-foreground mb-2">
            Telefone Principal
          </Label>
          <div className="relative">
            <Input
              id="phone"
              placeholder="(11) 99999-9999"
              {...step2Form.register("phone")}
              className="pl-10"
              data-testid="input-phone"
            />
            <Phone className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
          </div>
          {step2Form.formState.errors.phone && (
            <p className="text-sm text-destructive mt-1">
              {step2Form.formState.errors.phone.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="address" className="block text-sm font-medium text-foreground mb-2">
            Endereço do Consultório
          </Label>
          <div className="relative">
            <Textarea
              id="address"
              placeholder="Rua, número, bairro, cidade, estado"
              rows={3}
              {...step2Form.register("address")}
              className="pl-10 resize-none"
              data-testid="input-address"
            />
            <MapPin className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
          </div>
          {step2Form.formState.errors.address && (
            <p className="text-sm text-destructive mt-1">
              {step2Form.formState.errors.address.message}
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="specialization" className="block text-sm font-medium text-foreground mb-2">
            Especialização
          </Label>
          <Select onValueChange={(value) => step2Form.setValue("specialization", value)}>
            <SelectTrigger data-testid="select-specialization">
              <SelectValue placeholder="Selecione sua especialização" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="clinica">Nutrição Clínica</SelectItem>
              <SelectItem value="esportiva">Nutrição Esportiva</SelectItem>
              <SelectItem value="pediatrica">Nutrição Pediátrica</SelectItem>
              <SelectItem value="geriatrica">Nutrição Geriátrica</SelectItem>
              <SelectItem value="estetica">Nutrição Estética</SelectItem>
            </SelectContent>
          </Select>
          {step2Form.formState.errors.specialization && (
            <p className="text-sm text-destructive mt-1">
              {step2Form.formState.errors.specialization.message}
            </p>
          )}
        </div>

        <div className="flex space-x-3">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => onStepChange(1)}
            data-testid="button-prev-step2"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            <span>Anterior</span>
          </Button>
          <Button
            type="submit"
            className="flex-1"
            data-testid="button-next-step2"
          >
            <span>Próximo Passo</span>
            <ChevronRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </form>
    );
  }

  if (currentStep === 3) {
    return (
      <form onSubmit={step3Form.handleSubmit(handleStep3Submit)} className="space-y-6">
        <div>
          <Label htmlFor="whatsappNumber" className="block text-sm font-medium text-foreground mb-2">
            WhatsApp Profissional
          </Label>
          <div className="flex">
            <div className="flex items-center bg-input border border-border border-r-0 rounded-l-lg px-3">
              <span className="text-muted-foreground text-sm">+55</span>
            </div>
            <Input
              id="whatsappNumber"
              placeholder="(11) 99999-9999"
              {...step3Form.register("whatsappNumber")}
              className="rounded-l-none"
              data-testid="input-whatsapp"
            />
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Este será o número usado para atendimento aos seus pacientes
          </p>
          {step3Form.formState.errors.whatsappNumber && (
            <p className="text-sm text-destructive mt-1">
              {step3Form.formState.errors.whatsappNumber.message}
            </p>
          )}
        </div>

        <div className="bg-accent p-4 rounded-lg">
          <h4 className="font-medium text-accent-foreground mb-2">Configuração do Agente de IA</h4>
          <p className="text-sm text-muted-foreground mb-4">
            Personalize as mensagens automáticas do seu assistente virtual
          </p>
          
          <div className="space-y-4">
            <div>
              <Label htmlFor="welcomeMessage" className="block text-sm font-medium text-accent-foreground mb-1">
                Mensagem de Boas-vindas
              </Label>
              <Textarea
                id="welcomeMessage"
                placeholder="Olá! Sou o assistente virtual da Dra. [NOME]. Como posso ajudá-lo hoje?"
                rows={2}
                {...step3Form.register("welcomeMessage")}
                className="text-sm resize-none"
                data-testid="input-welcome-message"
              />
            </div>
            
            <div>
              <Label htmlFor="workingHours" className="block text-sm font-medium text-accent-foreground mb-1">
                Horário de Atendimento
              </Label>
              <Select onValueChange={(value) => step3Form.setValue("workingHours", value)}>
                <SelectTrigger className="text-sm" data-testid="select-working-hours">
                  <SelectValue placeholder="Horário comercial (8h às 18h)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="commercial">Horário comercial (8h às 18h)</SelectItem>
                  <SelectItem value="extended">Horário estendido (7h às 20h)</SelectItem>
                  <SelectItem value="24h">24 horas por dia</SelectItem>
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="termsAccepted"
            onCheckedChange={(checked) => step3Form.setValue("termsAccepted", !!checked)}
            data-testid="checkbox-terms"
          />
          <label htmlFor="termsAccepted" className="text-sm text-muted-foreground">
            Aceito os{" "}
            <a href="#" className="text-primary hover:underline">
              Termos de Uso
            </a>{" "}
            e{" "}
            <a href="#" className="text-primary hover:underline">
              Política de Privacidade
            </a>
          </label>
        </div>
        {step3Form.formState.errors.termsAccepted && (
          <p className="text-sm text-destructive">
            {step3Form.formState.errors.termsAccepted.message}
          </p>
        )}

        <div className="flex space-x-3">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => onStepChange(2)}
            data-testid="button-prev-step3"
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            <span>Anterior</span>
          </Button>
          <Button
            type="submit"
            className="flex-1"
            disabled={createNutritionistMutation.isPending}
            data-testid="button-create-account"
          >
            <span>
              {createNutritionistMutation.isPending ? "Criando..." : "Criar Conta"}
            </span>
            <Check className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </form>
    );
  }

  return null;
}
