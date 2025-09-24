import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Loader2, AlertCircle, ArrowRight } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

export default function SubscriptionSuccess() {
  const [, navigate] = useLocation();
  const [verificationStatus, setVerificationStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Get session_id from URL
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session_id');

  const verifyCheckoutMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) {
        throw new Error("Session ID não encontrado na URL");
      }

      const response = await apiRequest("GET", `/api/subscription/checkout-success?session_id=${sessionId}`);
      return await response.json();
    },
    onSuccess: (data) => {
      console.log("Checkout verification successful:", data);
      setVerificationStatus('success');
      
      // Invalidate user cache to reflect new subscription status
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      queryClient.invalidateQueries({ queryKey: ['user'] });
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      
      // Redirect to dashboard after a short delay
      setTimeout(() => {
        navigate('/dashboard');
      }, 3000);
    },
    onError: (error: any) => {
      console.error("Checkout verification failed:", error);
      setVerificationStatus('error');
      
      // Handle authentication error
      if (error.message?.includes('401') || error.message?.includes('Authentication required')) {
        setErrorMessage("Você precisa fazer login para verificar o pagamento.");
      } else {
        setErrorMessage(error.message || "Erro ao verificar pagamento. Tente novamente.");
      }
    }
  });

  useEffect(() => {
    if (sessionId) {
      verifyCheckoutMutation.mutate();
    } else {
      setVerificationStatus('error');
      setErrorMessage("Session ID não encontrado. Verifique se você veio do checkout do Stripe.");
    }
  }, [sessionId]);

  const handleRetry = () => {
    if (sessionId) {
      setVerificationStatus('loading');
      verifyCheckoutMutation.mutate();
    }
  };

  const handleGoToDashboard = () => {
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md" data-testid="card-subscription-success">
        <CardHeader className="text-center">
          {verificationStatus === 'loading' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-full flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
              <CardTitle data-testid="title-processing">Processando Pagamento</CardTitle>
              <CardDescription data-testid="text-processing-description">
                Verificando seu pagamento e ativando sua conta...
              </CardDescription>
            </>
          )}

          {verificationStatus === 'success' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <CardTitle className="text-green-600" data-testid="title-success">
                Pagamento Aprovado!
              </CardTitle>
              <CardDescription data-testid="text-success-description">
                Sua assinatura foi ativada com sucesso. Você será redirecionado para o dashboard em alguns segundos.
              </CardDescription>
            </>
          )}

          {verificationStatus === 'error' && (
            <>
              <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <CardTitle className="text-red-600" data-testid="title-error">
                Erro na Verificação
              </CardTitle>
              <CardDescription data-testid="text-error-description">
                {errorMessage}
              </CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent className="text-center space-y-4">
          {verificationStatus === 'success' && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg" data-testid="success-message">
                <p className="text-sm text-green-700 dark:text-green-300">
                  🎉 Bem-vindo ao NutriChatBot! Sua conta está ativa e pronta para uso.
                </p>
              </div>
              
              <Button 
                onClick={handleGoToDashboard} 
                className="w-full"
                data-testid="button-go-dashboard"
              >
                Ir para Dashboard
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {verificationStatus === 'error' && (
            <div className="space-y-4">
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg" data-testid="error-message">
                <p className="text-sm text-red-700 dark:text-red-300">
                  Houve um problema ao verificar seu pagamento. Nossa equipe foi notificada.
                </p>
              </div>
              
              <div className="space-y-2">
                <Button 
                  onClick={handleRetry} 
                  variant="outline" 
                  className="w-full"
                  disabled={verifyCheckoutMutation.isPending}
                  data-testid="button-retry"
                >
                  {verifyCheckoutMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Tentando novamente...
                    </>
                  ) : (
                    "Tentar Novamente"
                  )}
                </Button>
                
                <div className="flex gap-2">
                  <Button 
                    onClick={() => navigate('/login')} 
                    variant="ghost" 
                    className="w-full"
                    data-testid="button-login"
                  >
                    Fazer Login
                  </Button>
                  <Button 
                    onClick={() => navigate('/subscription/plans')} 
                    variant="ghost" 
                    className="w-full"
                    data-testid="button-back-plans"
                  >
                    Voltar aos Planos
                  </Button>
                </div>
              </div>
            </div>
          )}

          {verificationStatus === 'loading' && (
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg" data-testid="loading-message">
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Este processo pode levar alguns segundos. Por favor, aguarde...
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}