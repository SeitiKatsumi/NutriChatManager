import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface EmbeddedPaymentProps {
  planId: 'pro' | 'enterprise';
  planName: string;
  planPrice: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function EmbeddedPayment({ planId, planName, planPrice, onSuccess, onCancel }: EmbeddedPaymentProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Create checkout session and redirect immediately when component mounts
  useEffect(() => {
    const createCheckoutAndRedirect = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        console.log('[EmbeddedPayment] Creating checkout session for plan:', planId);
        
        const response = await apiRequest("POST", "/api/subscription/create-checkout", {
          planId: planId,
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Erro ao criar checkout");
        }
        
        const data = await response.json();
        console.log('[EmbeddedPayment] Checkout session created:', data);
        
        // Redirect to Stripe Checkout
        if (data.url) {
          console.log('[EmbeddedPayment] Redirecting to checkout:', data.url);
          window.location.href = data.url;
        } else {
          throw new Error("URL de checkout não recebida");
        }
      } catch (error: any) {
        console.error('[EmbeddedPayment] Error creating checkout session:', error);
        setError(error.message || "Erro ao inicializar checkout");
        
        toast({
          title: "Erro ao carregar checkout",
          description: error.message || "Tente recarregar a página",
          variant: "destructive",
        });
        setIsLoading(false);
      }
    };

    createCheckoutAndRedirect();
  }, [planId, toast]);

  // Retry function for failed checkout creation
  const handleRetry = () => {
    setIsLoading(true);
    setError(null);
    
    // Trigger useEffect again by updating a dependency
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  if (isLoading) {
    return (
      <Card data-testid="embedded-payment">
        <CardHeader>
          <CardTitle>Redirecionando para Pagamento</CardTitle>
          <CardDescription>
            Preparando seu checkout seguro...
          </CardDescription>
        </CardHeader>
        <CardContent className="p-8">
          <div className="flex items-center justify-center space-x-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" data-testid="loading-spinner" />
            <span className="text-lg">Carregando pagamento...</span>
          </div>
          
          {/* Plan Summary */}
          <div className="bg-muted/50 rounded-lg p-4 mt-6">
            <h3 className="font-medium text-foreground">{planName}</h3>
            <p className="text-2xl font-bold text-primary">{planPrice}/mês</p>
          </div>
          
          <p className="text-sm text-muted-foreground text-center mt-4">
            🔒 Você será redirecionado para o checkout seguro da Stripe
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card data-testid="embedded-payment">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            Erro no Pagamento
          </CardTitle>
          <CardDescription>
            {error}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Plan Summary */}
          <div className="bg-muted/50 rounded-lg p-4 mb-6">
            <h3 className="font-medium text-foreground">{planName}</h3>
            <p className="text-2xl font-bold text-primary">{planPrice}/mês</p>
          </div>

          {/* Error Actions */}
          <div className="flex gap-3">
            <Button 
              onClick={handleRetry} 
              className="flex-1"
              data-testid="button-retry-payment"
            >
              <ExternalLink className="w-4 h-4 mr-2" />
              Tentar Novamente
            </Button>
            
            {onCancel && (
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                data-testid="button-cancel-payment"
              >
                Cancelar
              </Button>
            )}
          </div>

          {/* Help Text */}
          <div className="mt-6 p-4 bg-muted/30 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>Dica:</strong> Se o problema persistir, tente:
            </p>
            <ul className="text-sm text-muted-foreground mt-2 space-y-1">
              <li>• Verificar sua conexão com a internet</li>
              <li>• Recarregar a página</li>
              <li>• Entrar em contato com o suporte</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    );
  }

  // This should never be reached since we redirect immediately
  return null;
}