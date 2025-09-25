import { useState, useEffect } from "react";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { stripePromise } from "@/lib/stripe";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";

interface EmbeddedPaymentProps {
  planId: 'pro' | 'enterprise';
  planName: string;
  planPrice: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

// Payment form component that uses Stripe Elements
function PaymentForm({ planId, planName, planPrice, onSuccess, onCancel }: EmbeddedPaymentProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');

  const confirmPaymentMutation = useMutation({
    mutationFn: async () => {
      if (!stripe || !elements) {
        throw new Error("Stripe ainda não carregou");
      }

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
        confirmParams: {
          return_url: `${window.location.origin}/dashboard/assinatura`,
        },
      });

      if (error) {
        throw new Error(error.message || "Erro no pagamento");
      }

      return paymentIntent;
    },
    onSuccess: (paymentIntent) => {
      console.log("Payment successful:", paymentIntent);
      setPaymentStatus('success');
      
      // Invalidate cache to refresh subscription status
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      
      toast({
        title: "Pagamento realizado com sucesso!",
        description: `Sua assinatura do ${planName} foi ativada.`,
      });

      // Call success callback after a short delay
      setTimeout(() => {
        onSuccess?.();
      }, 2000);
    },
    onError: (error: any) => {
      console.error("Payment failed:", error);
      setPaymentStatus('error');
      
      toast({
        title: "Erro no pagamento",
        description: error.message || "Tente novamente ou entre em contato com o suporte.",
        variant: "destructive",
      });
    }
  });

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!stripe || !elements || isProcessing) return;

    setIsProcessing(true);
    setPaymentStatus('processing');
    
    try {
      // Confirm the payment
      await confirmPaymentMutation.mutateAsync();
    } catch (error) {
      console.error("Payment error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const isDisabled = !stripe || !elements || isProcessing || paymentStatus === 'success';

  return (
    <form onSubmit={handlePayment} className="space-y-6">
      {/* Payment Status Display */}
      {paymentStatus === 'success' && (
        <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
            <CheckCircle className="w-5 h-5" />
            <span className="font-medium">Pagamento realizado com sucesso!</span>
          </div>
          <p className="text-sm text-green-700 dark:text-green-300 mt-1">
            Sua assinatura foi ativada. Redirecionando...
          </p>
        </div>
      )}

      {paymentStatus === 'error' && (
        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">Erro no pagamento</span>
          </div>
          <p className="text-sm text-red-700 dark:text-red-300 mt-1">
            Verifique os dados do cartão e tente novamente.
          </p>
        </div>
      )}

      {/* Plan Summary */}
      <div className="bg-muted/50 rounded-lg p-4">
        <h3 className="font-medium text-foreground">{planName}</h3>
        <p className="text-2xl font-bold text-primary">{planPrice}/mês</p>
      </div>

      {/* Payment Element */}
      <div className="border rounded-lg p-4 bg-background">
        <PaymentElement
          options={{
            layout: 'tabs',
            terms: {
              card: 'auto'
            }
          }}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <Button
          type="submit"
          className="flex-1"
          disabled={isDisabled}
          data-testid="button-confirm-payment"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Processando...
            </>
          ) : paymentStatus === 'success' ? (
            'Pagamento Realizado'
          ) : (
            `Confirmar Pagamento - ${planPrice}/mês`
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
        🔒 Pagamento seguro processado pela Stripe. Seus dados estão protegidos.
      </p>
    </form>
  );
}

// Main wrapper component that provides Stripe Elements context
export default function EmbeddedPayment(props: EmbeddedPaymentProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Create payment intent when component mounts
  useEffect(() => {
    const createPaymentIntent = async () => {
      try {
        setIsLoading(true);
        
        const response = await apiRequest("POST", "/api/subscription/create-payment-intent", {
          planId: props.planId,
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Erro ao criar pagamento");
        }
        
        const data = await response.json();
        setClientSecret(data.clientSecret);
      } catch (error: any) {
        console.error("Error creating payment intent:", error);
        setError(error.message || "Erro ao inicializar pagamento");
        
        toast({
          title: "Erro ao carregar pagamento",
          description: error.message || "Tente recarregar a página",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    createPaymentIntent();
  }, [props.planId, toast]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center space-x-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span>Carregando pagamento...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !clientSecret) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            Erro no Pagamento
          </CardTitle>
          <CardDescription>
            {error || "Não foi possível inicializar o pagamento"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => window.location.reload()} variant="outline">
            Tentar Novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  const options = {
    clientSecret,
    appearance: {
      theme: 'stripe' as const,
      variables: {
        colorPrimary: 'hsl(var(--primary))',
        colorBackground: 'hsl(var(--background))',
        colorText: 'hsl(var(--foreground))',
        colorDanger: 'hsl(var(--destructive))',
        fontFamily: 'system-ui, sans-serif',
        spacingUnit: '4px',
        borderRadius: '6px',
      },
    },
  };

  return (
    <Card data-testid="embedded-payment">
      <CardHeader>
        <CardTitle>Finalizar Pagamento</CardTitle>
        <CardDescription>
          Complete seu pagamento de forma segura sem sair do NutriChatBot
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Elements stripe={stripePromise} options={options}>
          <PaymentForm {...props} />
        </Elements>
      </CardContent>
    </Card>
  );
}