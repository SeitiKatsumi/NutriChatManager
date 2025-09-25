import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle, CheckCircle, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe";

interface EmbeddedPaymentProps {
  planId: 'pro' | 'enterprise';
  planName: string;
  planPrice: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface PaymentFormProps {
  planName: string;
  planPrice: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

// Payment form component that uses Stripe Elements
function PaymentForm({ planName, planPrice, onSuccess, onCancel }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const { toast } = useToast();

  // Poll for subscription activation
  const pollForSubscriptionActivation = async () => {
    const maxAttempts = 10;
    const pollInterval = 2000; // 2 seconds
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[PaymentForm] Polling subscription status (attempt ${attempt}/${maxAttempts})`);
        
        // Invalidate and refetch subscription status
        await queryClient.invalidateQueries({ queryKey: ['/api/subscription/status'] });
        
        const response = await apiRequest('GET', '/api/subscription/status');
        if (response.ok) {
          const statusData = await response.json();
          console.log('[PaymentForm] Subscription status:', statusData);
          
          if (statusData.hasActiveSubscription) {
            console.log('[PaymentForm] Subscription is now active!');
            return;
          }
        }
        
        // Wait before next attempt (except on last attempt)
        if (attempt < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
        }
      } catch (error) {
        console.warn(`[PaymentForm] Error during polling attempt ${attempt}:`, error);
      }
    }
    
    console.warn('[PaymentForm] Subscription activation polling completed without success');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);
    setPaymentError(null);

    try {
      console.log('[PaymentForm] Submitting elements for validation...');
      
      // Step 1: Submit elements to validate payment information
      const { error: submitError } = await elements.submit();
      if (submitError) {
        console.error('[PaymentForm] Validation error:', submitError);
        setPaymentError(submitError.message || 'Erro na validação dos dados do cartão');
        
        toast({
          title: "Erro na validação",
          description: submitError.message || "Verifique os dados do cartão",
          variant: "destructive",
        });
        return;
      }

      console.log('[PaymentForm] Elements validated successfully, confirming payment...');

      // Step 2: Confirm payment after validation
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/dashboard`,
        },
        redirect: 'if_required'
      });

      if (error) {
        console.error('[PaymentForm] Payment confirmation error:', error);
        setPaymentError(error.message || 'Erro ao processar pagamento');
        
        toast({
          title: "Erro no pagamento",
          description: error.message || "Tente novamente",
          variant: "destructive",
        });
        return;
      }

      // Step 3: Handle different payment intent statuses
      console.log('[PaymentForm] Payment intent status:', paymentIntent?.status);
      
      switch (paymentIntent?.status) {
        case 'succeeded':
          console.log('[PaymentForm] Payment succeeded');
          setPaymentSuccess(true);
          
          // Poll for subscription activation
          await pollForSubscriptionActivation();
          
          toast({
            title: "Pagamento confirmado!",
            description: "Sua assinatura foi ativada com sucesso",
            variant: "default",
          });

          // Wait a moment then call success callback
          setTimeout(() => {
            onSuccess?.();
          }, 2000);
          break;

        case 'processing':
          console.log('[PaymentForm] Payment is processing');
          setPaymentSuccess(true);
          
          toast({
            title: "Pagamento processando",
            description: "Seu pagamento está sendo processado. Aguarde a confirmação.",
            variant: "default",
          });
          
          // Start polling for completion
          await pollForSubscriptionActivation();
          break;

        case 'requires_payment_method':
          console.log('[PaymentForm] Payment requires new payment method');
          setPaymentError('Método de pagamento rejeitado. Tente outro cartão.');
          
          toast({
            title: "Pagamento rejeitado",
            description: "Tente outro método de pagamento",
            variant: "destructive",
          });
          break;

        default:
          console.warn('[PaymentForm] Unexpected payment status:', paymentIntent?.status);
          setPaymentError('Status do pagamento inesperado. Entre em contato com o suporte.');
          
          toast({
            title: "Status inesperado",
            description: "Entre em contato com o suporte",
            variant: "destructive",
          });
      }
    } catch (error: any) {
      console.error('[PaymentForm] Unexpected error:', error);
      setPaymentError('Erro inesperado ao processar pagamento');
      
      toast({
        title: "Erro inesperado",
        description: "Tente novamente ou entre em contato com o suporte",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (paymentSuccess) {
    return (
      <div className="text-center space-y-4">
        <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle className="w-8 h-8 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Pagamento Confirmado!</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Sua assinatura do {planName} foi ativada com sucesso
          </p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4">
          <h4 className="font-medium text-foreground">{planName}</h4>
          <p className="text-xl font-bold text-green-600 dark:text-green-400">{planPrice}/mês</p>
        </div>
        <p className="text-xs text-muted-foreground">
          Redirecionando para o dashboard...
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Plan Summary */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h3 className="font-medium text-foreground flex items-center gap-2">
          <CreditCard className="w-4 h-4" />
          {planName}
        </h3>
        <p className="text-2xl font-bold text-primary">{planPrice}/mês</p>
      </div>

      {/* Payment Element */}
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            Informações do Cartão
          </label>
          <div className="border rounded-lg p-3 bg-background">
            <PaymentElement 
              data-testid="payment-element"
              options={{
                layout: 'tabs',
                paymentMethodOrder: ['card']
              }}
            />
          </div>
        </div>
      </div>

      {/* Error Display */}
      {paymentError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-destructive" />
            <p className="text-sm text-destructive font-medium">Erro no pagamento</p>
          </div>
          <p className="text-sm text-destructive/80 mt-1">{paymentError}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4">
        <Button 
          type="submit" 
          className="flex-1" 
          disabled={!stripe || isProcessing}
          data-testid="button-confirm-payment"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processando...
            </>
          ) : (
            `Confirmar Pagamento • ${planPrice}/mês`
          )}
        </Button>
        
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isProcessing}
            data-testid="button-cancel-payment"
          >
            Cancelar
          </Button>
        )}
      </div>

      {/* Security Notice */}
      <p className="text-xs text-muted-foreground text-center">
        🔒 Pagamento processado com segurança pela Stripe
      </p>
    </form>
  );
}

export default function EmbeddedPayment({ planId, planName, planPrice, onSuccess, onCancel }: EmbeddedPaymentProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoadingPayment, setIsLoadingPayment] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Create embedded subscription when component mounts
  useEffect(() => {
    const createEmbeddedSubscription = async () => {
      try {
        setIsLoadingPayment(true);
        setError(null);
        
        console.log('[EmbeddedPayment] Creating embedded subscription for plan:', planId);
        
        const response = await apiRequest("POST", "/api/subscription/create-embedded-subscription", {
          planId: planId,
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Erro ao criar assinatura");
        }
        
        const data = await response.json();
        console.log('[EmbeddedPayment] Embedded subscription created:', data);
        
        if (data.clientSecret) {
          setClientSecret(data.clientSecret);
          console.log('[EmbeddedPayment] Client secret received, initializing payment element');
        } else {
          throw new Error("Client secret não recebido");
        }
      } catch (error: any) {
        console.error('[EmbeddedPayment] Error creating embedded subscription:', error);
        setError(error.message || "Erro ao inicializar pagamento");
        
        toast({
          title: "Erro ao carregar pagamento",
          description: error.message || "Tente recarregar a página",
          variant: "destructive",
        });
      } finally {
        setIsLoadingPayment(false);
      }
    };

    createEmbeddedSubscription();
  }, [planId, toast]);

  // Retry function for failed payment creation
  const handleRetry = async () => {
    try {
      setIsLoadingPayment(true);
      setError(null);
      setClientSecret(null);
      
      console.log('[EmbeddedPayment] Retrying payment setup...');
      
      const response = await apiRequest("POST", "/api/subscription/create-embedded-subscription", {
        planId: planId,
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao criar assinatura");
      }
      
      const data = await response.json();
      console.log('[EmbeddedPayment] Retry successful, client secret received');
      
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
      } else {
        throw new Error("Client secret não recebido");
      }
    } catch (error: any) {
      console.error('[EmbeddedPayment] Retry failed:', error);
      setError(error.message || "Erro ao reinicializar pagamento");
      
      toast({
        title: "Erro ao tentar novamente",
        description: error.message || "Tente recarregar a página",
        variant: "destructive",
      });
    } finally {
      setIsLoadingPayment(false);
    }
  };

  if (isLoadingPayment) {
    return (
      <Card data-testid="embedded-payment">
        <CardHeader>
          <CardTitle>Preparando Pagamento</CardTitle>
          <CardDescription>
            Configurando seu pagamento seguro...
          </CardDescription>
        </CardHeader>
        <CardContent className="p-8">
          <div className="flex items-center justify-center space-x-3">
            <Loader2 className="w-6 h-6 animate-spin text-primary" data-testid="loading-spinner" />
            <span className="text-lg">Carregando...</span>
          </div>
          
          {/* Plan Summary */}
          <div className="bg-muted/50 rounded-lg p-4 mt-6">
            <h3 className="font-medium text-foreground">{planName}</h3>
            <p className="text-2xl font-bold text-primary">{planPrice}/mês</p>
          </div>
          
          <p className="text-sm text-muted-foreground text-center mt-4">
            🔒 Preparando pagamento seguro no seu navegador
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

  // Render the payment form with Stripe Elements
  if (clientSecret) {
    return (
      <Card data-testid="embedded-payment">
        <CardHeader>
          <CardTitle>Finalizar Assinatura</CardTitle>
          <CardDescription>
            Complete seu pagamento de forma segura
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Elements 
            stripe={getStripe()} 
            options={{
              clientSecret,
              appearance: {
                theme: 'stripe',
                variables: {
                  colorPrimary: '#00ff80', // hsl(152, 100%, 50%)
                  colorBackground: '#2a3441', // hsl(215, 28%, 21%)
                  colorText: '#ffffff', // hsl(0, 0%, 100%)
                  colorDanger: '#f56565', // hsl(0, 84%, 60%)
                  fontFamily: 'Inter, system-ui, sans-serif',
                  spacingUnit: '4px',
                  borderRadius: '6px',
                  colorTextSecondary: '#9ca3af', // muted foreground
                  colorTextPlaceholder: '#6b7280',
                }
              },
              locale: 'pt-BR'
            }}
          >
            <PaymentForm
              planName={planName}
              planPrice={planPrice}
              onSuccess={onSuccess}
              onCancel={onCancel}
            />
          </Elements>
        </CardContent>
      </Card>
    );
  }

  return null;
}