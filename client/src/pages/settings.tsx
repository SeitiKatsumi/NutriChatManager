import { useAuth } from "@/contexts/auth-context";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, User, Bot, Lock, Shield } from "lucide-react";
import { useLocation } from "wouter";

// Schema for profile update
const profileSchema = z.object({
  fullName: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
  email: z.string().email("Email inválido"),
  phone: z.string().optional().refine((val) => {
    if (!val) return true;
    const cleaned = val.replace(/\D/g, "");
    return cleaned.length >= 10;
  }, "Telefone deve ter no mínimo 10 dígitos (DDD + número)"),
  whatsapp_clinica: z.string().optional().refine((val) => {
    if (!val) return true;
    const cleaned = val.replace(/\D/g, "");
    return cleaned.length >= 10;
  }, "WhatsApp deve ter no mínimo 10 dígitos (DDD + número)"),
  address: z.string().optional(),
  specialization: z.string().optional(),
});

// Schema for AI agent customization
const aiAgentSchema = z.object({
  nome_do_agente: z.string().min(2, "Nome do agente deve ter no mínimo 2 caracteres").optional(),
  mensagem_inicial: z.string().min(10, "Mensagem deve ter no mínimo 10 caracteres").optional(),
});

// Schema for password change
const passwordSchema = z.object({
  newPassword: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

type ProfileFormData = z.infer<typeof profileSchema>;
type AIAgentFormData = z.infer<typeof aiAgentSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

export default function Settings() {
  const { nutritionist } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Helper function to format phone number for display
  const formatPhoneNumber = (phone: string): string => {
    const cleaned = phone.replace(/\D/g, "");
    
    if (cleaned.length === 0) return "";
    
    // Format with country code mobile (13 digits): +55 (11) 98765-4321
    if (cleaned.length === 13 && cleaned.startsWith("55")) {
      return `+55 (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    }
    
    // Format with country code landline (12 digits): +55 (11) 3456-7890
    if (cleaned.length === 12 && cleaned.startsWith("55")) {
      return `+55 (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
    }
    
    // Format mobile with DDD (11 digits): (11) 98765-4321
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    }
    
    // Format landline with DDD (10 digits): (11) 3456-7890
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
    }
    
    // Partial formatting while typing
    if (cleaned.length > 2) {
      if (cleaned.length <= 6) {
        return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`;
      } else if (cleaned.length <= 10) {
        return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
      } else if (cleaned.length === 11) {
        return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
      } else if (cleaned.length === 12 && cleaned.startsWith("55")) {
        return `+55 (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 8)}-${cleaned.slice(8)}`;
      } else {
        return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
      }
    }
    
    return cleaned;
  };

  // Profile form
  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: nutritionist?.fullName || "",
      email: nutritionist?.email || "",
      phone: formatPhoneNumber(nutritionist?.phone || ""),
      whatsapp_clinica: formatPhoneNumber((nutritionist as any)?.whatsapp_clinica || ""),
      address: (nutritionist as any)?.address || "",
      specialization: nutritionist?.specialization || "",
    },
  });

  // AI Agent form
  const aiAgentForm = useForm<AIAgentFormData>({
    resolver: zodResolver(aiAgentSchema),
    defaultValues: {
      nome_do_agente: (nutritionist as any)?.nome_do_agente || "",
      mensagem_inicial: (nutritionist as any)?.mensagem_inicial || "",
    },
  });

  // Password form
  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  // Mutation for updating profile
  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const response = await apiRequest("PUT", `/api/nutritionists/${nutritionist?.id}`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Perfil atualizado",
        description: "Suas informações foram atualizadas com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar suas informações. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  // Mutation for updating AI agent
  const updateAIAgentMutation = useMutation({
    mutationFn: async (data: AIAgentFormData) => {
      const response = await apiRequest("PUT", `/api/nutritionists/${nutritionist?.id}`, data);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Agente personalizado",
        description: "As configurações do seu agente de IA foram atualizadas.",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível atualizar o agente. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  // Mutation for changing password
  const changePasswordMutation = useMutation({
    mutationFn: async (data: PasswordFormData) => {
      const response = await apiRequest("PUT", `/api/nutritionists/${nutritionist?.id}`, {
        password: data.newPassword,
      });
      return response;
    },
    onSuccess: () => {
      passwordForm.reset();
      toast({
        title: "Senha alterada",
        description: "Sua senha foi alterada com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao alterar senha",
        description: "Não foi possível alterar sua senha. Tente novamente.",
        variant: "destructive",
      });
    },
  });

  // Helper function to clean and normalize phone numbers for saving
  // Always adds country code 55 if not present
  const cleanPhoneNumber = (phone: string | undefined): string => {
    if (!phone) return "";
    
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, "");
    
    // Empty after cleaning
    if (cleaned.length === 0) return "";
    
    // If already has country code (12 or 13 digits starting with 55), return as is
    if ((cleaned.length === 12 || cleaned.length === 13) && cleaned.startsWith("55")) {
      return cleaned;
    }
    
    // If doesn't have country code (8-11 digits), add 55 prefix
    // This covers: 8-9 digits (no DDD), 10 digits (landline), 11 digits (mobile)
    if (cleaned.length >= 8 && cleaned.length <= 11) {
      return "55" + cleaned;
    }
    
    // For any other case, return cleaned digits
    return cleaned;
  };

  // Handler for phone input changes (applies formatting)
  const handlePhoneChange = (fieldName: "phone" | "whatsapp_clinica") => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const formatted = formatPhoneNumber(e.target.value);
    profileForm.setValue(fieldName, formatted);
  };

  const onProfileSubmit = (data: ProfileFormData) => {
    // Clean phone numbers before sending to API
    const cleanedData = {
      ...data,
      phone: cleanPhoneNumber(data.phone),
      whatsapp_clinica: cleanPhoneNumber(data.whatsapp_clinica),
    };
    updateProfileMutation.mutate(cleanedData);
  };

  const onAIAgentSubmit = (data: AIAgentFormData) => {
    updateAIAgentMutation.mutate(data);
  };

  const onPasswordSubmit = (data: PasswordFormData) => {
    changePasswordMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight" data-testid="title-settings">
            Configurações
          </h1>
          <p className="text-muted-foreground mt-2">
            Gerencie suas informações pessoais e personalize seu agente de IA
          </p>
        </div>

        <Separator />

        {/* Personal Information Section */}
        <Card data-testid="card-personal-info">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>Informações Pessoais</CardTitle>
                <CardDescription>
                  Atualize seus dados de cadastro e informações profissionais
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nome Completo</Label>
                  <Input
                    id="fullName"
                    {...profileForm.register("fullName")}
                    data-testid="input-fullname"
                  />
                  {profileForm.formState.errors.fullName && (
                    <p className="text-sm text-destructive">
                      {profileForm.formState.errors.fullName.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    {...profileForm.register("email")}
                    data-testid="input-email"
                  />
                  {profileForm.formState.errors.email && (
                    <p className="text-sm text-destructive">
                      {profileForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone Pessoal</Label>
                  <Input
                    id="phone"
                    value={profileForm.watch("phone") || ""}
                    onChange={handlePhoneChange("phone")}
                    placeholder="(11) 99999-9999"
                    data-testid="input-phone"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="whatsapp_clinica">WhatsApp da Clínica</Label>
                  <Input
                    id="whatsapp_clinica"
                    value={profileForm.watch("whatsapp_clinica") || ""}
                    onChange={handlePhoneChange("whatsapp_clinica")}
                    placeholder="(11) 99999-9999"
                    data-testid="input-whatsapp-clinica"
                  />
                </div>


                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">Endereço do Consultório</Label>
                  <Input
                    id="address"
                    {...profileForm.register("address")}
                    placeholder="Rua, número, bairro, cidade"
                    data-testid="input-address"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="specialization">Especialização</Label>
                  <Input
                    id="specialization"
                    {...profileForm.register("specialization")}
                    placeholder="Ex: Nutrição Esportiva"
                    data-testid="input-specialization"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={updateProfileMutation.isPending}
                  data-testid="button-save-profile"
                >
                  {updateProfileMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Salvar Alterações
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* AI Agent Customization Section */}
        <Card data-testid="card-ai-agent">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bot className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>Personalização do Agente de IA</CardTitle>
                <CardDescription>
                  Configure como seu agente de IA se apresenta aos pacientes
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={aiAgentForm.handleSubmit(onAIAgentSubmit)} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="nome_do_agente">Nome do Agente</Label>
                <Input
                  id="nome_do_agente"
                  {...aiAgentForm.register("nome_do_agente")}
                  placeholder="Ex: Assistente NutriBot"
                  data-testid="input-agent-name"
                />
                {aiAgentForm.formState.errors.nome_do_agente && (
                  <p className="text-sm text-destructive">
                    {aiAgentForm.formState.errors.nome_do_agente.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="mensagem_inicial">Mensagem de Apresentação</Label>
                <Textarea
                  id="mensagem_inicial"
                  {...aiAgentForm.register("mensagem_inicial")}
                  placeholder="Olá! Sou o assistente virtual da Dra. Ana. Como posso ajudá-lo hoje?"
                  className="min-h-32 resize-y"
                  data-testid="input-initial-message"
                />
                {aiAgentForm.formState.errors.mensagem_inicial && (
                  <p className="text-sm text-destructive">
                    {aiAgentForm.formState.errors.mensagem_inicial.message}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Esta mensagem será enviada automaticamente quando um paciente iniciar uma conversa
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={updateAIAgentMutation.isPending}
                  data-testid="button-save-agent"
                >
                  {updateAIAgentMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Salvar Configurações
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Change Password Section */}
        <Card data-testid="card-password">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle>Alterar Senha</CardTitle>
                <CardDescription>
                  Atualize sua senha de acesso ao sistema
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">Nova Senha</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    {...passwordForm.register("newPassword")}
                    data-testid="input-new-password"
                  />
                  {passwordForm.formState.errors.newPassword && (
                    <p className="text-sm text-destructive">
                      {passwordForm.formState.errors.newPassword.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirmar Nova Senha</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    {...passwordForm.register("confirmPassword")}
                    data-testid="input-confirm-password"
                  />
                  {passwordForm.formState.errors.confirmPassword && (
                    <p className="text-sm text-destructive">
                      {passwordForm.formState.errors.confirmPassword.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={changePasswordMutation.isPending}
                  data-testid="button-change-password"
                >
                  {changePasswordMutation.isPending && (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  )}
                  Alterar Senha
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="flex justify-center pt-4 pb-8">
          <button
            onClick={() => navigate("/admin")}
            className="text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors text-xs flex items-center gap-1"
          >
            <Shield className="w-3 h-3" />
            Admin
          </button>
        </div>
      </div>
    </div>
  );
}
