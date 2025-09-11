import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MessageCircle, QrCode, Settings, CheckCircle, RefreshCw, Loader2, Smartphone, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export default function WhatsApp() {
  const { toast } = useToast();
  const [qrCode, setQrCode] = useState("");
  const [showQRCode, setShowQRCode] = useState(false);

  // Get current user info
  const { data: userInfo } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });

  // Get current nutritionist data (self-only after security fix)
  const { data: nutritionists, isLoading: loadingNutritionist } = useQuery<any[]>({
    queryKey: ["/api/nutritionists"],
    enabled: !!userInfo,
  });

  const currentNutritionist = nutritionists?.[0];

  // Get WhatsApp status
  const { data: whatsappStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery<any>({
    queryKey: ["/api/whatsapp/status", currentNutritionist?.id],
    enabled: !!currentNutritionist?.id && !!currentNutritionist?.evolutionInstanceName,
    refetchInterval: 5000, // Poll every 5 seconds
  });

  // Generate QR Code mutation
  const qrCodeMutation = useMutation({
    mutationFn: async () => {
      if (!currentNutritionist?.id) {
        throw new Error("Nutricionista não encontrado. Faça login novamente.");
      }
      
      const response = await apiRequest("GET", `/api/whatsapp/qrcode/${currentNutritionist?.id}`);
      const data = await response.json();
      
      if (!data.base64) {
        throw new Error("QR Code não foi gerado corretamente.");
      }
      
      return data;
    },
    onSuccess: (data) => {
      setQrCode(data.base64);
      setShowQRCode(true);
      toast({
        title: "QR Code gerado!",
        description: "Escaneie o código com seu WhatsApp para conectar.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao gerar QR Code",
        description: error.message || "Tente novamente mais tarde.",
        variant: "destructive",
      });
    },
  });

  const handleGenerateQRCode = () => {
    setShowQRCode(false); // Hide old QR code
    setQrCode(""); // Clear old QR code
    qrCodeMutation.mutate();
  };

  const handleRefreshStatus = () => {
    refetchStatus();
  };

  const isConnected = whatsappStatus?.state === "open";
  const hasEvolutionInstance = !!currentNutritionist?.evolutionInstanceName;

  return (
    <main className="p-6">
      <div className="max-w-4xl mx-auto">
        {/* WhatsApp Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="whatsapp-title">
            Integração WhatsApp
          </h1>
          <p className="text-muted-foreground">
            Configure e gerencie sua conexão WhatsApp com a Evolution API
          </p>
        </div>

        {/* Main QR Code and Status Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* QR Code Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5" />
                Conexão WhatsApp
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingNutritionist ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="ml-2">Carregando dados...</span>
                </div>
              ) : !hasEvolutionInstance ? (
                <div className="text-center p-6 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
                  <AlertCircle className="w-16 h-16 mx-auto mb-4 text-yellow-600" />
                  <p className="font-medium text-yellow-800 dark:text-yellow-200">Instância não configurada</p>
                  <p className="text-sm text-yellow-600 mt-2">
                    Sua conta precisa ser reconfigurada para usar o WhatsApp.
                    Entre em contato com o suporte.
                  </p>
                </div>
              ) : isConnected ? (
                <div className="text-center p-6 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-600" />
                  <p className="font-medium text-green-800 dark:text-green-200">WhatsApp Conectado!</p>
                  <p className="text-sm text-green-600 mt-2">
                    Seu bot está ativo e pronto para atender pacientes.
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleRefreshStatus}
                    disabled={statusLoading}
                    className="mt-4"
                    data-testid="button-refresh-status"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${statusLoading ? 'animate-spin' : ''}`} />
                    Atualizar Status
                  </Button>
                </div>
              ) : showQRCode && qrCode ? (
                <div className="text-center">
                  <img 
                    src={qrCode} 
                    alt="QR Code WhatsApp" 
                    className="mx-auto mb-4 border rounded-lg max-w-64 w-full" 
                    data-testid="qr-code-image"
                  />
                  <p className="text-sm text-muted-foreground mb-2">
                    Escaneie este código com seu WhatsApp
                  </p>
                  <p className="text-xs text-muted-foreground">
                    O código expira em alguns minutos. Atualize a página se necessário.
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleRefreshStatus}
                    disabled={statusLoading}
                    className="mt-4"
                  >
                    <RefreshCw className={`w-4 h-4 mr-2 ${statusLoading ? 'animate-spin' : ''}`} />
                    Verificar Conexão
                  </Button>
                </div>
              ) : (
                <div className="text-center text-muted-foreground p-6">
                  <Smartphone className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="font-medium">Conecte seu WhatsApp</p>
                  <p className="text-sm mt-2 mb-4">
                    Gere um QR Code para conectar seu número ao sistema
                  </p>
                  <Button 
                    onClick={handleGenerateQRCode} 
                    disabled={qrCodeMutation.isPending}
                    className="min-w-48"
                    data-testid="button-generate-qr"
                  >
                    {qrCodeMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Gerando QR Code...
                      </>
                    ) : (
                      <>
                        <QrCode className="w-4 h-4 mr-2" />
                        Gerar QR Code
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Status and Info Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Status da Conexão
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Estado:</span>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${
                    statusLoading ? 'bg-yellow-500' :
                    isConnected ? 'bg-green-500' : 'bg-red-500'
                  }`} />
                  <Badge variant={isConnected ? "default" : "secondary"}>
                    {statusLoading ? "Verificando..." : 
                     isConnected ? "Conectado" : "Desconectado"}
                  </Badge>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Instância:</span>
                <span className="text-foreground font-mono text-sm">
                  {currentNutritionist?.evolutionInstanceName || "Não configurado"}
                </span>
              </div>
              
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">WhatsApp:</span>
                <span className="text-sm text-foreground">
                  {currentNutritionist?.whatsappIA ? 
                    `+${currentNutritionist.whatsappIA.replace(/(\d{2})(\d{2})(\d{5})(\d{4})/, '$1 $2 $3-$4')}` : 
                    "Não configurado"
                  }
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">API Status:</span>
                <span className="text-sm text-muted-foreground">
                  {whatsappStatus ? "Conectada" : "Aguardando"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Configuration Section */}
        <Card>
          <CardHeader>
            <CardTitle>Configuração do Agente de IA</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label>Mensagem de Boas-vindas</Label>
                <Input
                  value={currentNutritionist?.welcomeMessage || "Não configurado"}
                  readOnly
                  className="bg-muted"
                  data-testid="text-welcome-message"
                />
              </div>
              
              <div>
                <Label>Horário de Funcionamento</Label>
                <Input
                  value={
                    currentNutritionist?.workingHours === "commercial" 
                      ? "Comercial (9h-18h)" 
                      : currentNutritionist?.workingHours || "Não configurado"
                  }
                  readOnly
                  className="bg-muted"
                  data-testid="text-working-hours"
                />
              </div>
              
              <div>
                <Label>Token da Instância</Label>
                <Input
                  value={currentNutritionist?.evolutionToken ? "••••••••••••••••••••" : "Não configurado"}
                  readOnly
                  className="bg-muted font-mono"
                  data-testid="text-instance-token"
                />
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Informação:</strong> As configurações do agente são definidas durante o registro.
                  Para alterar essas configurações, entre em contato com o suporte.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}