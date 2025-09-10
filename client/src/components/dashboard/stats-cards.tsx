import { Card, CardContent } from "@/components/ui/card";
import { Users, MessageCircle, CheckCircle, TrendingUp } from "lucide-react";

interface StatsCardsProps {
  stats?: {
    nutritionists: number;
    connectedWhatsapp: number;
    messages: number;
    responseRate: string;
  };
  isLoading: boolean;
}

export default function StatsCards({ stats, isLoading }: StatsCardsProps) {
  const cards = [
    {
      title: "Nutricionistas Cadastrados",
      value: stats?.nutritionists || 0,
      change: "+12%",
      icon: Users,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "WhatsApp Conectados",
      value: stats?.connectedWhatsapp || 0,
      change: "+8%",
      icon: MessageCircle,
      color: "text-green-500",
      bgColor: "bg-green-500/10",
    },
    {
      title: "Mensagens Processadas",
      value: stats?.messages || 0,
      change: "+24%",
      icon: MessageCircle,
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Taxa de Resposta",
      value: stats?.responseRate || "0%",
      change: "+2.1%",
      icon: CheckCircle,
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-20" />
                  <div className="h-8 bg-muted rounded w-16" />
                </div>
                <div className="w-12 h-12 bg-muted rounded-lg" />
              </div>
              <div className="flex items-center mt-4">
                <div className="h-4 bg-muted rounded w-12" />
                <div className="h-4 bg-muted rounded w-20 ml-2" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {cards.map((card, index) => {
        const Icon = card.icon;
        return (
          <Card key={index} data-testid={`stats-card-${index}`}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="text-2xl font-bold text-foreground" data-testid={`stats-value-${index}`}>
                    {typeof card.value === 'number' 
                      ? card.value.toLocaleString() 
                      : card.value
                    }
                  </p>
                </div>
                <div className={`w-12 h-12 ${card.bgColor} rounded-lg flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 ${card.color}`} />
                </div>
              </div>
              <div className="flex items-center mt-4">
                <TrendingUp className={`w-4 h-4 ${card.color}`} />
                <span className={`text-sm ${card.color} ml-1`}>{card.change}</span>
                <span className="text-muted-foreground text-sm ml-2">vs. mês anterior</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
