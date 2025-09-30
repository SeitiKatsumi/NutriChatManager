import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Check, Crown, Zap, CreditCard, AlertTriangle, RefreshCw } from "lucide-react";
import EmbeddedPayment from "@/components/embedded-payment";

export default function DashboardAssinatura() {
  const { nutritionist, checkAuth } = useAuth();
  const [selectedPlan, setSelectedPlan] = useState<'pro' | 'enterprise' | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const plans = [
    {
      id: 'pro',
      name: 'Nutri ChatBot Pro',
      price: 'R$ 49',
      period: '/mês',
      description: 'Ideal para nutricionistas que atendem até 100 pacientes',
      features: [
        'Até 100 pacientes cadastrados',
        'WhatsApp integrado com IA',
        'Relatórios básicos',
        'Suporte por email',
        'Dashboard completo'
      ],
      icon: <Zap className="w-6 h-6" />,
      popular: true
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 'R$ 99,99',
      period: '/mês',
      description: 'Para nutricionistas e clínicas com alto volume',
      features: [
        'Pacientes ilimitados',
        'WhatsApp integrado com IA avançada',
        'Relatórios avançados e analytics',
        'Suporte prioritário 24/7',
        'Dashboard completo',
        'API personalizada',
        'Backup automático'
      ],
      icon: <Crown className="w-6 h-6" />,
      popular: false
    }
  ];

  const currentStatus = nutritionist?.status_pagamento || 'pendente';

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ativo':
        return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Ativo</Badge>;
      case 'cancelado':
        return <Badge variant="destructive">Cancelado</Badge>;
      case 'expirado':
        return <Badge variant="secondary">Expirado</Badge>;
      default:
        return <Badge variant="outline">Pendente</Badge>;
    }
  };

  const handlePlanSelect = (planId: 'pro' | 'enterprise') => {
    setSelectedPlan(planId);
    console.log('Selected plan:', planId);
  };

  const handleRefreshStatus = async () => {
    setIsRefreshing(true);
    try {
      await checkAuth();
    } catch (error) {
      console.error('Error refreshing status:', error);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl" data-testid="dashboard-assinatura">
      <div className="space-y-6">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Gerenciar Assinatura</h1>
          <p className="text-muted-foreground">
            Controle sua assinatura e acesse recursos premium do NutriChatBot
          </p>
        </div>

        {/* Current Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              Status Atual da Assinatura
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Status do pagamento</p>
                <div className="flex items-center gap-2">
                  {getStatusBadge(currentStatus)}
                  <span className="text-sm text-muted-foreground">
                    {currentStatus === 'pendente' && 'Aguardando pagamento'}
                    {currentStatus === 'ativo' && 'Sua assinatura está ativa'}
                    {currentStatus === 'cancelado' && 'Assinatura cancelada'}
                    {currentStatus === 'expirado' && 'Assinatura expirada'}
                  </span>
                </div>
              </div>
              
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshStatus}
                disabled={isRefreshing}
                data-testid="button-refresh-status"
                className="flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Atualizando...' : 'Atualizar Status'}
              </Button>
            </div>

            {currentStatus === 'pendente' && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start gap-2 text-blue-700 dark:text-blue-300">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="text-sm space-y-1">
                    <p className="font-medium">
                      Após o pagamento, sua assinatura pode levar até 10 minutos para ser validada.
                    </p>
                    <p className="text-xs opacity-90">
                      Use o botão "Atualizar Status" para verificar se seu pagamento já foi processado.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {currentStatus !== 'ativo' && currentStatus !== 'pendente' && (
              <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-sm font-medium">
                    Escolha um plano para acessar todos os recursos do NutriChatBot
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Separator />

        {/* Plans */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Escolha seu Plano</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {plans.map((plan) => (
              <Card key={plan.id} className={`relative ${plan.popular ? 'border-primary shadow-lg' : ''}`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground">Mais Popular</Badge>
                  </div>
                )}
                
                <CardHeader className="text-center space-y-2">
                  <div className="flex justify-center mb-2">
                    <div className="p-3 bg-primary/10 rounded-full text-primary">
                      {plan.icon}
                    </div>
                  </div>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <ul className="space-y-3">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button 
                    className="w-full" 
                    variant={plan.popular ? "default" : "outline"}
                    onClick={() => handlePlanSelect(plan.id as 'pro' | 'enterprise')}
                    data-testid={`button-select-${plan.id}`}
                  >
                    {currentStatus === 'ativo' ? 'Plano Atual' : 'Escolher Plano'}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Embedded Payment Section */}
        {selectedPlan && (
          <EmbeddedPayment
            planId={selectedPlan}
            planName={plans.find(p => p.id === selectedPlan)?.name || ''}
            planPrice={plans.find(p => p.id === selectedPlan)?.price || ''}
            onSuccess={() => {
              setSelectedPlan(null);
              // Refresh the page to show updated subscription status
              setTimeout(() => window.location.reload(), 1000);
            }}
            onCancel={() => setSelectedPlan(null)}
          />
        )}
      </div>
    </div>
  );
}