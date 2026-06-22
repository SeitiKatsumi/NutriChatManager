import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, CheckCircle, CreditCard, MessageCircle, RefreshCw, Settings } from "lucide-react";
import { Link } from "wouter";

export default function WhatsApp() {
  const { data: userInfo } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

  const { data: nutritionists, isLoading: loadingNutritionist } = useQuery<any[]>({
    queryKey: ["/api/nutritionists"],
    enabled: !!userInfo,
  });

  const currentNutritionist = nutritionists?.[0];

  const {
    data: whatsappStatus,
    isLoading: statusLoading,
    refetch: refetchStatus,
    error: statusError,
  } = useQuery<any>({
    queryKey: ["/api/whatsapp/status", currentNutritionist?.id],
    enabled: !!currentNutritionist?.id,
    refetchInterval: 15000,
  });

  const connectionState = whatsappStatus?.instance?.state?.toLowerCase();
  const isConfigured = connectionState === "open";
  const sender = whatsappStatus?.sender || "Nao configurado";

  const hasActivePaymentStatus = currentNutritionist?.status_pagamento === "ativo";
  const hasActiveSubscription = currentNutritionist?.subscriptionStatus === "active";
  const isSubscriptionActive = hasActivePaymentStatus || hasActiveSubscription;

  const isSubscriptionError =
    (statusError && (statusError as any)?.status === 402) ||
    (!isSubscriptionActive && currentNutritionist?.subscriptionStatus === "canceled");

  return (
    <main className="p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="whatsapp-title">
            Integracao WhatsApp
          </h1>
          <p className="text-muted-foreground">
            Comunicacao oficial via Twilio para todos os nutricionistas
          </p>
        </div>

        {isSubscriptionError && (
          <Alert variant="destructive" className="mb-6 border-orange-500 bg-orange-500/10">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            <AlertTitle className="text-orange-500 font-semibold">
              Sua assinatura expirou
            </AlertTitle>
            <AlertDescription className="text-orange-400">
              <p className="mb-3">
                Para continuar utilizando o WhatsApp e todos os recursos da plataforma, renove sua assinatura.
              </p>
              <Link href="/dashboard/assinatura">
                <Button variant="outline" className="border-orange-500 text-orange-500 hover:bg-orange-500/20">
                  <CreditCard className="w-4 h-4 mr-2" />
                  Renovar Assinatura
                </Button>
              </Link>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                Sender oficial
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingNutritionist || statusLoading ? (
                <div className="flex items-center justify-center p-8">
                  <RefreshCw className="w-6 h-6 animate-spin" />
                  <span className="ml-2">Verificando Twilio...</span>
                </div>
              ) : isConfigured ? (
                <div className="text-center p-6 rounded-lg border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                  <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-600" />
                  <p className="font-medium text-green-800 dark:text-green-200">
                    Twilio WhatsApp ativo
                  </p>
                  <p className="text-sm mt-2 text-green-600">
                    O bot responde pelo sender global oficial configurado no servidor.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchStatus()}
                    disabled={statusLoading}
                    className="mt-4"
                    data-testid="button-refresh-status"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${statusLoading ? "animate-spin" : ""}`} />
                    Atualizar Status
                  </Button>
                </div>
              ) : (
                <div className="text-center p-6 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <AlertCircle className="w-16 h-16 mx-auto mb-4 text-yellow-600" />
                  <p className="font-medium text-yellow-800 dark:text-yellow-200">Twilio nao configurado</p>
                  <p className="text-sm text-yellow-600 mt-2">
                    Configure as credenciais Twilio e o WhatsApp sender global nas variaveis de ambiente.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Status da conexao
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Estado:</span>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${isConfigured ? "bg-green-500" : "bg-yellow-500"}`} />
                  <Badge variant={isConfigured ? "default" : "secondary"}>
                    {statusLoading ? "Verificando..." : isConfigured ? "Conectado" : "Pendente"}
                  </Badge>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Numero global:</span>
                <span className="text-sm text-foreground break-all text-right">{sender}</span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Provider:</span>
                <span className="text-sm text-foreground">Twilio Official API</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              Configuracao do agente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>Nome do Agente</Label>
                <Input
                  value={currentNutritionist?.nome_do_agente || "Nutri ChatBot"}
                  readOnly
                  className="bg-muted"
                  data-testid="text-agent-name"
                />
              </div>

              <div>
                <Label>Mensagem de boas-vindas</Label>
                <Input
                  value={currentNutritionist?.mensagem_inicial || currentNutritionist?.welcomeMessage || "Nao configurado"}
                  readOnly
                  className="bg-muted"
                  data-testid="text-welcome-message"
                />
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Webhook Twilio:</strong> /api/twilio/whatsapp/webhook
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
