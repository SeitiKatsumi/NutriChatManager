import { useState, useEffect } from "react";
import { useLocation, Redirect } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Users, UserCheck, Calendar, Phone, Mail, LogOut, Eye, Bot, RotateCcw, Save, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface Nutritionist {
  id: string;
  fullName: string;
  email: string;
  cpfCnpj: string;
  phone: string;
  address: string;
  specialization: string;
  whatsappNumber: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastAccess: string;
  twilioSender: string | null;
}

interface Patient {
  id: string;
  nutritionistId: string;
  fullName: string;
  whatsapp: string;
  phone: string;
  birthDate: string;
  gender: string;
  weight: string;
  height: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface AIConfig {
  agent_type: string;
  label: string;
  system_prompt: string;
  model: string;
  max_tokens: number;
  temperature: number;
  updated_at: string;
}

interface AIConfigResponse {
  configs: AIConfig[];
  availableModels: string[];
}

function AIConfigSection({ config, availableModels, onSaved }: { config: AIConfig; availableModels: string[]; onSaved: () => void }) {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState(config.system_prompt);
  const [model, setModel] = useState(config.model);
  const [maxTokens, setMaxTokens] = useState(config.max_tokens);
  const [temperature, setTemperature] = useState(config.temperature);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setPrompt(config.system_prompt);
    setModel(config.model);
    setMaxTokens(config.max_tokens);
    setTemperature(config.temperature);
    setHasChanges(false);
  }, [config]);

  useEffect(() => {
    const changed = prompt !== config.system_prompt || model !== config.model || maxTokens !== config.max_tokens || temperature !== config.temperature;
    setHasChanges(changed);
  }, [prompt, model, maxTokens, temperature, config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/admin/ai-config/${config.agent_type}`, {
        system_prompt: prompt,
        model,
        max_tokens: maxTokens,
        temperature,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Configuração salva", description: `${config.label} atualizado com sucesso` });
      onSaved();
      setHasChanges(false);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/ai-config/reset/${config.agent_type}`);
      return res.json();
    },
    onSuccess: (data: AIConfig) => {
      setPrompt(data.system_prompt);
      setModel(data.model);
      setMaxTokens(data.max_tokens);
      setTemperature(data.temperature);
      toast({ title: "Padrão restaurado", description: `${config.label} restaurado aos valores padrão` });
      onSaved();
      setHasChanges(false);
    },
    onError: (error: any) => {
      toast({ title: "Erro ao restaurar", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Prompt do Sistema</Label>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="min-h-[300px] font-mono text-sm"
          placeholder="Prompt do sistema para este agente..."
        />
        <p className="text-xs text-muted-foreground">
          Variáveis disponíveis: {"{agentName}"}, {"{patientContext}"} (substituídas automaticamente)
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label className="text-sm font-medium">Modelo OpenAI</Label>
          <Select value={model} onValueChange={setModel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableModels.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Max Tokens</Label>
          <Input
            type="number"
            value={maxTokens}
            onChange={(e) => setMaxTokens(Math.max(100, Math.min(16000, parseInt(e.target.value) || 100)))}
            min={100}
            max={16000}
          />
          <p className="text-xs text-muted-foreground">100 - 16000</p>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium">Temperatura: {temperature.toFixed(2)}</Label>
          <Slider
            value={[temperature]}
            onValueChange={([v]) => setTemperature(Math.round(v * 100) / 100)}
            min={0}
            max={2}
            step={0.05}
            className="mt-3"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Preciso (0)</span>
            <span>Criativo (2)</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-2 border-t">
        <div className="text-xs text-muted-foreground">
          Atualizado: {config.updated_at ? format(new Date(config.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR }) : "—"}
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
          >
            {resetMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-1" />}
            Restaurar Padrão
          </Button>
          <Button
            size="sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !hasChanges}
          >
            {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const [, navigate] = useLocation();
  const [admin, setAdmin] = useState<any>(() => {
    const stored = localStorage.getItem("admin");
    return stored ? JSON.parse(stored) : null;
  });
  const [checkingAuth, setCheckingAuth] = useState(!localStorage.getItem("admin"));
  const [selectedNutritionist, setSelectedNutritionist] = useState<Nutritionist | null>(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const { toast } = useToast();

  useEffect(() => {
    if (!admin) {
      fetch("/api/auth/me", { credentials: "include" })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (data?.user?.email) {
            const adminData = { id: data.user.id, email: data.user.email, name: data.user.fullName || data.user.email, isAdmin: true };
            localStorage.setItem("admin", JSON.stringify(adminData));
            setAdmin(adminData);
          }
          setCheckingAuth(false);
        })
        .catch(() => setCheckingAuth(false));
    }
  }, [admin]);

  const { data: nutritionists = [], isLoading: loadingNutritionists } = useQuery<Nutritionist[]>({
    queryKey: ["/api/admin/nutritionists"],
    enabled: !!admin,
  });

  const { data: patients = [], isLoading: loadingPatients } = useQuery<Patient[]>({
    queryKey: ["/api/admin/patients"],
    enabled: !!admin,
  });

  const { data: aiConfigData, isLoading: loadingAIConfig } = useQuery<AIConfigResponse>({
    queryKey: ["/api/admin/ai-config"],
    enabled: !!admin && activeTab === "ai-config",
  });

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      localStorage.removeItem("admin");
      navigate("/admin/login");
      toast({
        title: "Logout realizado",
        description: "Você foi desconectado com sucesso",
      });
    } catch (error) {
      console.error("Erro no logout:", error);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "Nunca";
    try {
      return format(new Date(dateString), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return dateString;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active":
        return "default";
      case "inactive":
        return "secondary";
      default:
        return "outline";
    }
  };

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!admin) {
    return <Redirect to="/admin/login" />;
  }

  if (loadingNutritionists || loadingPatients) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="title-admin-panel">
              Painel Administrativo
            </h1>
            <p className="text-sm text-muted-foreground">
              Bem-vindo, {admin.name}
            </p>
          </div>
          <Button onClick={handleLogout} variant="outline" data-testid="button-admin-logout">
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="dashboard" className="gap-2">
              <Users className="w-4 h-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="ai-config" className="gap-2" data-testid="tab-ai-config">
              <Bot className="w-4 h-4" />
              Configuração de IA
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Nutricionistas</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-nutritionists">
                    {nutritionists.length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Cadastrados na plataforma
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Pacientes</CardTitle>
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-patients">
                    {patients.length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Em acompanhamento
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Nutricionistas Ativos</CardTitle>
                  <UserCheck className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-active-nutritionists">
                    {nutritionists.filter((n: Nutritionist) => n.status === "active").length}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Com status ativo
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Nutricionistas Cadastrados</CardTitle>
                <CardDescription>
                  Lista completa de todos os nutricionistas da plataforma
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>CPF/CNPJ</TableHead>
                      <TableHead>WhatsApp</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Último Acesso</TableHead>
                      <TableHead>Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nutritionists.map((nutritionist: Nutritionist) => (
                      <TableRow key={nutritionist.id} data-testid={`row-nutritionist-${nutritionist.id}`}>
                        <TableCell className="font-medium">
                          {nutritionist.fullName}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <Mail className="w-4 h-4 mr-2 text-muted-foreground" />
                            {nutritionist.email}
                          </div>
                        </TableCell>
                        <TableCell>{nutritionist.cpfCnpj || "Não informado"}</TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <Phone className="w-4 h-4 mr-2 text-muted-foreground" />
                            {nutritionist.whatsappNumber || "Não informado"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(nutritionist.status)}>
                            {nutritionist.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center">
                            <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                            {formatDate(nutritionist.lastAccess)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setSelectedNutritionist(nutritionist)}
                                data-testid={`button-view-nutritionist-${nutritionist.id}`}
                              >
                                <Eye className="w-4 h-4 mr-2" />
                                Ver Detalhes
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle>Detalhes do Nutricionista</DialogTitle>
                                <DialogDescription>
                                  Informações completas do nutricionista
                                </DialogDescription>
                              </DialogHeader>
                              {selectedNutritionist && (
                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <h4 className="font-semibold mb-2">Informações Pessoais</h4>
                                    <div className="space-y-2 text-sm">
                                      <p><strong>Nome:</strong> {selectedNutritionist.fullName}</p>
                                      <p><strong>Email:</strong> {selectedNutritionist.email}</p>
                                      <p><strong>CPF/CNPJ:</strong> {selectedNutritionist.cpfCnpj || "Não informado"}</p>
                                      <p><strong>Telefone:</strong> {selectedNutritionist.phone || "Não informado"}</p>
                                      <p><strong>WhatsApp:</strong> {selectedNutritionist.whatsappNumber || "Não informado"}</p>
                                    </div>
                                  </div>
                                  <div>
                                    <h4 className="font-semibold mb-2">Informações da Conta</h4>
                                    <div className="space-y-2 text-sm">
                                      <p><strong>Status:</strong> {selectedNutritionist.status}</p>
                                      <p><strong>Especialização:</strong> {selectedNutritionist.specialization || "Não informado"}</p>
                                      <p><strong>Cadastrado em:</strong> {formatDate(selectedNutritionist.createdAt)}</p>
                                      <p><strong>Último acesso:</strong> {formatDate(selectedNutritionist.lastAccess)}</p>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ai-config" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="w-5 h-5" />
                  Configuração de IA
                </CardTitle>
                <CardDescription>
                  Gerencie os prompts, modelos e parâmetros de cada agente de IA da plataforma.
                  As alterações são aplicadas imediatamente.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingAIConfig ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    <span className="text-muted-foreground">Carregando configurações...</span>
                  </div>
                ) : aiConfigData?.configs ? (
                  <Tabs defaultValue={aiConfigData.configs[0]?.agent_type}>
                    <TabsList className="flex flex-wrap h-auto gap-1 mb-6">
                      {aiConfigData.configs.map((c) => (
                        <TabsTrigger key={c.agent_type} value={c.agent_type} className="text-xs">
                          {c.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {aiConfigData.configs.map((c) => (
                      <TabsContent key={c.agent_type} value={c.agent_type}>
                        <AIConfigSection
                          config={c}
                          availableModels={aiConfigData.availableModels}
                          onSaved={() => queryClient.invalidateQueries({ queryKey: ["/api/admin/ai-config"] })}
                        />
                      </TabsContent>
                    ))}
                  </Tabs>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Nenhuma configuração encontrada.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
