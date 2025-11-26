import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  Users, MessageCircle, Phone, Calendar, TrendingUp, Clock, 
  Send, AlertCircle, CheckCircle2, Loader2, RefreshCw, Bot,
  CalendarClock, BarChart3, Sparkles
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth-context";

interface DashboardStats {
  totalPatients: number;
  activeSchedules: number;
  messagesSentToday: number;
  messagesSentThisWeek: number;
  pendingSchedules: number;
}

interface PatientWithSchedules {
  id: number;
  fullName: string;
  email: string;
  whatsappNumber: string;
  status: string;
  lastContact?: string;
  schedules?: {
    reactivation: { enabled: boolean; nextRun?: string };
    meal_feedback: { enabled: boolean; nextRun?: string };
    post_consultation: { enabled: boolean; nextRun?: string };
  };
}

export default function Dashboard() {
  const { user, nutritionist } = useAuth();

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 60000,
  });

  const { data: patients, isLoading: patientsLoading, refetch: refetchPatients } = useQuery<PatientWithSchedules[]>({
    queryKey: ["/api/patients"],
    select: (data: any[]) => data.slice(0, 10),
  });

  const { data: schedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ["/api/schedules"],
  });

  const handleRefresh = () => {
    refetchStats();
    refetchPatients();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Bom dia";
    if (hour < 18) return "Boa tarde";
    return "Boa noite";
  };

  const firstName = nutritionist?.fullName?.split(' ')[0] || user?.name?.split(' ')[0] || 'Nutricionista';

  return (
    <main className="p-6 bg-background min-h-screen">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-1" data-testid="dashboard-title">
              {getGreeting()}, {firstName}!
            </h1>
            <p className="text-muted-foreground">
              Gerencie seus pacientes e acompanhe suas mensagens automáticas
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              className="gap-2"
              data-testid="btn-refresh"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
            <Badge 
              variant={nutritionist?.evolutionInstanceName ? "default" : "secondary"}
              className="h-8 px-3"
            >
              <Phone className="w-3 h-3 mr-1.5" />
              {nutritionist?.evolutionInstanceName ? "WhatsApp Conectado" : "WhatsApp Desconectado"}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total de Pacientes
              </CardTitle>
              <Users className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-total-patients">
                {statsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : stats?.totalPatients || 0}
              </div>
              <Link href="/patients">
                <span className="text-xs text-blue-500 hover:underline cursor-pointer">
                  Ver todos →
                </span>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Agendamentos Ativos
              </CardTitle>
              <CalendarClock className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-active-schedules">
                {statsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : stats?.activeSchedules || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Enviando mensagens automáticas
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Mensagens Hoje
              </CardTitle>
              <Send className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-messages-today">
                {statsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : stats?.messagesSentToday || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Enviadas automaticamente
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-orange-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Mensagens na Semana
              </CardTitle>
              <BarChart3 className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-messages-week">
                {statsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : stats?.messagesSentThisWeek || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Últimos 7 dias
              </p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-yellow-500">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pendentes
              </CardTitle>
              <Clock className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stat-pending">
                {statsLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : stats?.pendingSchedules || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Próximos envios
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Pacientes Recentes
                  </CardTitle>
                  <CardDescription>
                    Últimos pacientes e status de agendamento
                  </CardDescription>
                </div>
                <Link href="/patients">
                  <Button variant="outline" size="sm" data-testid="btn-view-all-patients">
                    Ver todos
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {patientsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : patients && patients.length > 0 ? (
                <div className="space-y-3">
                  {patients.slice(0, 5).map((patient) => (
                    <div 
                      key={patient.id} 
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors"
                      data-testid={`patient-row-${patient.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-primary font-semibold">
                            {patient.fullName?.charAt(0).toUpperCase() || '?'}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            {patient.fullName || 'Nome não informado'}
                          </p>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {patient.whatsappNumber || 'Sem WhatsApp'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={patient.status === 'active' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {patient.status === 'active' ? 'Ativo' : 'Inativo'}
                        </Badge>
                        <Link href={`/patients/${patient.id}`}>
                          <Button variant="ghost" size="sm" data-testid={`btn-view-patient-${patient.id}`}>
                            Ver
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-2">Nenhum paciente cadastrado</p>
                  <Link href="/patients">
                    <Button variant="outline" size="sm">
                      Adicionar paciente
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-yellow-500" />
                Insights IA
              </CardTitle>
              <CardDescription>
                Recomendações baseadas nos seus dados
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <div className="flex items-start gap-3">
                  <Bot className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Reativação de Pacientes
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {stats?.totalPatients && stats.totalPatients > 0 
                        ? `Ative mensagens de reativação para manter contato com seus ${stats.totalPatients} pacientes.`
                        : 'Cadastre pacientes para receber recomendações personalizadas.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Feedback de Plano Alimentar
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Configure lembretes para acompanhar a evolução dos pacientes após 7 ou 15 dias.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <div className="flex items-start gap-3">
                  <MessageCircle className="h-5 w-5 text-purple-500 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Pós-Consulta
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Envie mensagens automáticas após consultas para acompanhar o progresso.
                    </p>
                  </div>
                </div>
              </div>

              {!nutritionist?.evolutionInstanceName && (
                <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        Configure o WhatsApp
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Conecte seu WhatsApp para habilitar mensagens automáticas.
                      </p>
                      <Link href="/whatsapp">
                        <Button variant="link" size="sm" className="p-0 h-auto text-yellow-600">
                          Configurar agora →
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClock className="h-5 w-5" />
                  Tipos de Agendamento
                </CardTitle>
                <CardDescription>
                  Configure mensagens automáticas para seus pacientes
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="reactivation" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="reactivation" className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  <span className="hidden sm:inline">Reativação</span>
                </TabsTrigger>
                <TabsTrigger value="meal_feedback" className="gap-2">
                  <TrendingUp className="h-4 w-4" />
                  <span className="hidden sm:inline">Feedback Plano</span>
                </TabsTrigger>
                <TabsTrigger value="post_consultation" className="gap-2">
                  <Calendar className="h-4 w-4" />
                  <span className="hidden sm:inline">Pós-Consulta</span>
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="reactivation" className="mt-4">
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-blue-500/10">
                      <RefreshCw className="h-6 w-6 text-blue-500" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-foreground mb-1">
                        Mensagens de Reativação
                      </h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Envie lembretes para pacientes que não entram em contato há algum tempo. 
                        Configure uma data e horário específico para cada paciente.
                      </p>
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-muted-foreground">Seletor de data e horário personalizado</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm mt-1">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-muted-foreground">Mensagem personalizada por paciente</span>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="meal_feedback" className="mt-4">
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-green-500/10">
                      <TrendingUp className="h-6 w-6 text-green-500" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-foreground mb-1">
                        Feedback do Plano Alimentar
                      </h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Acompanhe a evolução do paciente enviando mensagens automáticas após 
                        7 ou 15 dias da consulta inicial.
                      </p>
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-muted-foreground">Intervalo de 7 ou 15 dias configurável</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm mt-1">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-muted-foreground">Acompanhamento contínuo do progresso</span>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="post_consultation" className="mt-4">
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-lg bg-purple-500/10">
                      <Calendar className="h-6 w-6 text-purple-500" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-foreground mb-1">
                        Feedback Pós-Consulta
                      </h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Envie mensagens automáticas após cada consulta para verificar 
                        como o paciente está se sentindo e se tem dúvidas.
                      </p>
                      <div className="flex items-center gap-2 text-sm">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-muted-foreground">Configure dias após a consulta</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm mt-1">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span className="text-muted-foreground">Mensagem de acompanhamento personalizada</span>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="mt-6 p-4 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Como funciona?
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Os agendamentos são configurados individualmente na página de cada paciente. 
                    Acesse a ficha do paciente para ativar e personalizar cada tipo de mensagem automática.
                  </p>
                </div>
                <Link href="/patients">
                  <Button variant="outline" size="sm" data-testid="btn-configure-schedules">
                    Configurar agendamentos
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </main>
  );
}
