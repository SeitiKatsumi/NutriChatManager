import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Loader2, Crown, Zap, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";

const plans = [
  {
    id: "basic",
    name: "Básico",
    description: "Perfeito para nutricionistas iniciantes",
    price: "R$ 49",
    period: "/mês",
    icon: Star,
    features: [
      "Até 50 pacientes",
      "WhatsApp integrado",
      "IA consultiva básica",
      "Relatórios simples",
      "Suporte por email"
    ],
    popular: false
  },
  {
    id: "professional",
    name: "Profissional",
    description: "Para nutricionistas estabelecidos",
    price: "R$ 99",
    period: "/mês",
    icon: Zap,
    features: [
      "Até 200 pacientes",
      "WhatsApp integrado",
      "IA consultiva avançada",
      "Relatórios completos",
      "Automações personalizadas",
      "Suporte prioritário",
      "Integrações premium"
    ],
    popular: true
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Para clínicas e grandes práticas",
    price: "R$ 199",
    period: "/mês",
    icon: Crown,
    features: [
      "Pacientes ilimitados",
      "WhatsApp integrado",
      "IA consultiva completa",
      "Relatórios avançados",
      "Automações ilimitadas",
      "Suporte dedicado",
      "API personalizada",
      "Treinamento incluso"
    ],
    popular: false
  }
];

export default function SubscriptionPlans() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const createCheckoutMutation = useMutation({
    mutationFn: async (planId: string) => {
      const plan = plans.find(p => p.id === planId);
      if (!plan) throw new Error("Plano não encontrado");

      const response = await apiRequest("POST", `/api/subscription/create-checkout`, {
        planId: plan.id, // Send only planId, let backend map to priceId
        mode: "subscription",
        successUrl: `${window.location.origin}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/subscription/plans`,
        metadata: {
          planName: plan.name
        }
      });
      return await response.json();
    },
    onSuccess: (data) => {
      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      console.error("Erro ao criar checkout:", error);
      
      // Handle authentication error
      if (error.message?.includes('401') || error.message?.includes('Authentication required')) {
        toast({
          title: "Login necessário",
          description: "Você precisa fazer login para assinar um plano.",
          variant: "destructive"
        });
        navigate('/login');
        return;
      }
      
      toast({
        title: "Erro",
        description: error.message || "Erro ao processar assinatura. Tente novamente.",
        variant: "destructive"
      });
      setSelectedPlan(null);
    }
  });

  const handleSubscribe = (planId: string) => {
    setSelectedPlan(planId);
    createCheckoutMutation.mutate(planId);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-foreground mb-4" data-testid="title-subscription-plans">
            Escolha seu Plano
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto" data-testid="text-subscription-description">
            Potencialize sua prática nutricional com nossa plataforma completa de IA e WhatsApp integrado
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan) => {
            const Icon = plan.icon;
            const isLoading = selectedPlan === plan.id && createCheckoutMutation.isPending;
            
            return (
              <Card 
                key={plan.id} 
                className={`relative ${plan.popular ? 'border-primary shadow-lg scale-105' : 'border-border'}`}
                data-testid={`card-plan-${plan.id}`}
              >
                {plan.popular && (
                  <Badge 
                    className="absolute -top-3 left-1/2 transform -translate-x-1/2"
                    data-testid="badge-popular"
                  >
                    Mais Popular
                  </Badge>
                )}
                
                <CardHeader className="text-center pb-8">
                  <div className="w-12 h-12 mx-auto mb-4 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle className="text-2xl" data-testid={`text-plan-name-${plan.id}`}>
                    {plan.name}
                  </CardTitle>
                  <CardDescription data-testid={`text-plan-description-${plan.id}`}>
                    {plan.description}
                  </CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-foreground" data-testid={`text-plan-price-${plan.id}`}>
                      {plan.price}
                    </span>
                    <span className="text-muted-foreground">{plan.period}</span>
                  </div>
                </CardHeader>

                <CardContent>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, index) => (
                      <li key={index} className="flex items-center gap-3" data-testid={`feature-${plan.id}-${index}`}>
                        <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
                        <span className="text-sm text-muted-foreground">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button 
                    className="w-full" 
                    size="lg"
                    variant={plan.popular ? "default" : "outline"}
                    onClick={() => handleSubscribe(plan.id)}
                    disabled={createCheckoutMutation.isPending}
                    data-testid={`button-subscribe-${plan.id}`}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processando...
                      </>
                    ) : (
                      "Assinar Plano"
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="text-center mt-16">
          <p className="text-sm text-muted-foreground mb-4" data-testid="text-guarantee">
            ✅ Garantia de 7 dias • Cancele a qualquer momento • Suporte dedicado
          </p>
          <p className="text-xs text-muted-foreground" data-testid="text-payment-info">
            Pagamento seguro processado pelo Stripe. Todos os preços em Real (BRL).
          </p>
        </div>
      </div>
    </div>
  );
}