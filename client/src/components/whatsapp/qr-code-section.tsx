import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { QrCode, Loader2 } from "lucide-react";

interface QRCodeSectionProps {
  selectedInstance: string | null;
}

export default function QRCodeSection({ selectedInstance }: QRCodeSectionProps) {
  const { toast } = useToast();
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [instanceId] = useState(selectedInstance || `nutri_${Date.now()}`);

  const generateQRMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/evolution/generate-qr/${instanceId}`);
      return response.json();
    },
    onSuccess: (data) => {
      setQrCode(data.qrCode);
      toast({
        title: "QR Code gerado com sucesso!",
        description: "Escaneie o código com seu WhatsApp para conectar.",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao gerar QR Code",
        description: "Tente novamente mais tarde.",
        variant: "destructive",
      });
    },
  });

  return (
    <Card className="mb-8">
      <CardContent className="p-8">
        <div className="text-center">
          <div className="w-64 h-64 bg-muted rounded-xl mx-auto mb-6 flex items-center justify-center">
            {generateQRMutation.isPending ? (
              <div className="text-center">
                <Loader2 className="w-16 h-16 mx-auto mb-4 text-muted-foreground animate-spin" />
                <p className="text-muted-foreground">Gerando QR Code...</p>
              </div>
            ) : qrCode ? (
              <div className="w-full h-full p-4">
                <img 
                  src={qrCode} 
                  alt="QR Code para WhatsApp" 
                  className="w-full h-full object-contain rounded-lg"
                  data-testid="qr-code-image"
                />
              </div>
            ) : (
              <div className="text-center">
                <QrCode className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">QR Code aparecerá aqui</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Clique em "Gerar QR Code" para iniciar
                </p>
              </div>
            )}
          </div>
          
          <div className="space-y-4">
            <Button
              onClick={() => generateQRMutation.mutate()}
              disabled={generateQRMutation.isPending}
              className="mx-auto"
              data-testid="button-generate-qr"
            >
              <QrCode className="w-5 h-5 mr-2" />
              {generateQRMutation.isPending ? "Gerando..." : "Gerar QR Code"}
            </Button>
            
            <div className="text-sm text-muted-foreground">
              <p><strong>Como conectar:</strong></p>
              <ol className="list-decimal list-inside mt-2 space-y-1 text-left max-w-md mx-auto">
                <li>Abra o WhatsApp no seu celular</li>
                <li>Toque em "Dispositivos conectados"</li>
                <li>Toque em "Conectar um dispositivo"</li>
                <li>Aponte a câmera para o QR Code</li>
              </ol>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
