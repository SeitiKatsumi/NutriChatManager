import { useQuery } from "@tanstack/react-query";
import StatsCards from "@/components/dashboard/stats-cards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Activity, Users, MessageCircle } from "lucide-react";

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery<{
    nutritionists: number;
    connectedWhatsapp: number;
    messages: number;
    responseRate: string;
  }>({
    queryKey: ["/api/stats"],
  });

  const { data: recentActivities } = useQuery<any[]>({
    queryKey: ["/api/nutritionists"],
    select: (data: any[]) => data?.slice(0, 5) || [],
  });

  return (
    <main className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Dashboard Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="dashboard-title">
            Dashboard
          </h1>
          <p className="text-muted-foreground">
            Visão geral do seu painel de gestão NutriChatBot
          </p>
        </div>

        {/* Stats Cards */}
        <StatsCards stats={stats} isLoading={isLoading} />

        {/* Charts and Activities */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BarChart3 className="w-5 h-5" />
                <span>Crescimento de Usuários</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <BarChart3 className="w-16 h-16 mx-auto mb-4" />
                  <p className="text-sm">Gráfico de crescimento mensal</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Activity className="w-5 h-5" />
                <span>Atividade por Hora</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <Activity className="w-16 h-16 mx-auto mb-4" />
                  <p className="text-sm">Gráfico de atividade por período</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle>Atividades Recentes</CardTitle>
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
              ) : recentActivities?.length ? (
                recentActivities.map((nutritionist: any, index: number) => (
                  <div key={nutritionist.id} className="flex items-center space-x-4">
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                      {index === 0 ? (
                        <Users className="w-4 h-4 text-primary" />
                      ) : index === 1 ? (
                        <MessageCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <Activity className="w-4 h-4 text-blue-500" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-foreground font-medium">
                        {index === 0 && `${nutritionist.fullName} se cadastrou`}
                        {index === 1 && `WhatsApp conectado - ${nutritionist.fullName}`}
                        {index >= 2 && `Configuração atualizada - ${nutritionist.fullName}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Há {Math.floor(Math.random() * 60) + 1} minutos
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <Activity className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Nenhuma atividade recente</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
