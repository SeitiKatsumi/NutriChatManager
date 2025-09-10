import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCodeSection from "@/components/whatsapp/qr-code-section";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export default function WhatsApp() {
  const [selectedInstance, setSelectedInstance] = useState<string | null>(null);

  const { data: instances, isLoading } = useQuery<any[]>({
    queryKey: ["/api/whatsapp-instances"],
  });

  const connectedInstances = instances?.filter((instance: any) => instance.status === "connected") || [];

  return (
    <main className="p-6">
      <div className="max-w-4xl mx-auto">
        {/* WhatsApp Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="whatsapp-title">
            Integração WhatsApp
          </h1>
          <p className="text-muted-foreground">
            Configure e gerencie suas conexões WhatsApp com a Evolution API
          </p>
        </div>

        {/* QR Code Section */}
        <QRCodeSection selectedInstance={selectedInstance} />

        {/* Connection Status and Settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Status da Conexão</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Estado:</span>
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                  <span className="text-sm text-foreground">Aguardando conexão</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Instância:</span>
                <span className="text-foreground font-mono text-sm">
                  {selectedInstance || "nutri_001"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Última atualização:</span>
                <span className="text-sm text-muted-foreground">Há 2 minutos</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Configurações do Agente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Nome do Agente
                </label>
                <input
                  type="text"
                  value="Assistente NutriBot"
                  className="w-full bg-input border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  data-testid="input-agent-name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Resposta Automática
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="auto-response"
                    defaultChecked
                    className="w-4 h-4 text-primary bg-input border-border rounded focus:ring-primary focus:ring-2"
                    data-testid="checkbox-auto-response"
                  />
                  <label htmlFor="auto-response" className="text-sm text-foreground">
                    Ativado
                  </label>
                </div>
              </div>
              <Button className="w-full" data-testid="button-save-settings">
                Salvar Configurações
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Active Connections */}
        <Card>
          <CardHeader>
            <CardTitle>Conexões Ativas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-muted/20 rounded-lg animate-pulse">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-muted rounded-full" />
                        <div>
                          <div className="h-4 bg-muted rounded w-32 mb-1" />
                          <div className="h-3 bg-muted rounded w-48" />
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="h-6 bg-muted rounded w-16" />
                        <div className="w-8 h-8 bg-muted rounded" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : connectedInstances.length > 0 ? (
                connectedInstances.map((instance: any) => (
                  <div
                    key={instance.id}
                    className="flex items-center justify-between p-4 bg-muted/20 rounded-lg"
                    data-testid={`connection-${instance.id}`}
                  >
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-green-500/10 rounded-full flex items-center justify-center">
                        <div className="w-5 h-5 bg-green-500 rounded-full" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          {instance.instanceName || "Conexão Principal"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {instance.phoneNumber || "+55 11 99999-0001"} • Conectado há{" "}
                          {Math.floor(Math.random() * 10) + 1} dias
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className="bg-green-100 text-green-800">Online</Badge>
                      <Button variant="ghost" size="sm" data-testid={`button-disconnect-${instance.id}`}>
                        <X className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-muted rounded-full mx-auto mb-4 flex items-center justify-center">
                    <div className="w-8 h-8 bg-muted-foreground rounded-full opacity-50" />
                  </div>
                  <p className="text-muted-foreground">Nenhuma conexão ativa</p>
                  <p className="text-sm text-muted-foreground">
                    Gere um QR Code para conectar seu WhatsApp
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
