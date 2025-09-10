import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Activity, Users, MessageCircle, Phone, UserCheck, Calendar, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data: dashboardData, isLoading } = useQuery<{
    nutritionist: any;
    stats: {
      totalPatients: number;
      activePatients: number;
      totalConsultations: number;
      totalMessages: number;
      whatsappConnected: boolean;
      responseRate: string;
    };
    recentPatients: any[];
    recentMessages: any[];
  }>({
    queryKey: ["/api/dashboard"],
  });

  return (
    <main className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Dashboard Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="dashboard-title">
                {dashboardData?.nutritionist?.fullName ? `Olá, ${dashboardData.nutritionist.fullName.split(' ')[0]}!` : 'Dashboard'}
              </h1>
              <p className="text-muted-foreground">
                Painel do Nutricionista - Gerencie seus pacientes e atendimentos
              </p>
            </div>
            <div className="text-right">
              <div className="flex items-center space-x-2 mb-1">
                <Badge variant={dashboardData?.stats.whatsappConnected ? "default" : "secondary"}>
                  <Phone className="w-3 h-3 mr-1" />
                  {dashboardData?.stats.whatsappConnected ? "WhatsApp Conectado" : "WhatsApp Desconectado"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                CRN: {dashboardData?.nutritionist?.crn || 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* Individual Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Pacientes</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stats-total-patients">
                {isLoading ? "..." : dashboardData?.stats.totalPatients || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                {dashboardData?.stats.activePatients || 0} ativos
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Consultas Realizadas</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stats-consultations">
                {isLoading ? "..." : dashboardData?.stats.totalConsultations || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Total de atendimentos
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Mensagens</CardTitle>
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stats-messages">
                {isLoading ? "..." : dashboardData?.stats.totalMessages || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Via WhatsApp
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Taxa de Resposta</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="stats-response-rate">
                {isLoading ? "..." : dashboardData?.stats.responseRate || "0%"}
              </div>
              <p className="text-xs text-muted-foreground">
                Média mensal
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts and Recent Data */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="w-5 h-5" />
                <span>Evolução de Pacientes</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <BarChart3 className="w-16 h-16 mx-auto mb-4" />
                  <p className="text-sm">Gráfico de novos pacientes por mês</p>
                  <p className="text-xs mt-2">Em breve: visualização detalhada</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="w-5 h-5" />
                <span>Atividade de Consultas</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Activity className="w-16 h-16 mx-auto mb-4" />
                  <p className="text-sm">Distribuição de consultas por período</p>
                  <p className="text-xs mt-2">Em breve: análise de horários</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Patients */}
        <Card>
          <CardHeader>
            <CardTitle>Pacientes Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="flex items-center space-x-4 animate-pulse">
                      <div className="w-8 h-8 bg-muted rounded-full" />
                      <div className="flex-1">
                        <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                        <div className="h-3 bg-muted rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : dashboardData?.recentPatients?.length ? (
                dashboardData.recentPatients.map((patient: any, index: number) => (
                  <div key={patient.id} className="flex items-center space-x-4 p-3 rounded-lg border">
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                      <UserCheck className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="text-foreground font-medium">
                        {patient.fullName || `Paciente ${index + 1}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {patient.email || 'Email não informado'} • 
                        {patient.status === 'active' ? 'Ativo' : 'Inativo'}
                      </p>
                    </div>
                    <Badge variant={patient.status === 'active' ? 'default' : 'secondary'}>
                      {patient.status === 'active' ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground mb-2">Nenhum paciente cadastrado ainda</p>
                  <p className="text-sm text-muted-foreground">Seus pacientes da coleção "Cadastro_de_Pacientes" aparecerão aqui</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
