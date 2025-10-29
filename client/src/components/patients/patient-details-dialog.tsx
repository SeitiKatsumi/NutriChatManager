import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { 
  UserCheck, 
  Mail, 
  Phone, 
  Calendar, 
  Scale, 
  Ruler, 
  FileText, 
  Clock,
  Pill,
  MessageSquare,
  Activity
} from "lucide-react";
import { Patient } from "@shared/schema";
import AIInsights from "./ai-insights";

interface PatientDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient | null;
}

export default function PatientDetailsDialog({ 
  isOpen, 
  onClose, 
  patient 
}: PatientDetailsDialogProps) {
  if (!patient) return null;

  const getStatusColor = (status: string) => {
    const colors = {
      "active": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
      "inactive": "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
      "completed": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      "Aguardando agendamento": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
    };
    return colors[status as keyof typeof colors] || colors.active;
  };

  const formatDate = (date: Date | string | null) => {
    if (!date) return "Não informado";
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('pt-BR');
  };

  // Função para processar texto com quebras de linha em bullets
  const formatTextAsBullets = (text: string | null) => {
    if (!text) return null;
    
    const lines = text.split('\n').filter(line => line.trim());
    
    return (
      <ul className="space-y-2">
        {lines.map((line, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="w-1.5 h-1.5 bg-primary rounded-full mt-2 flex-shrink-0" />
            <span className="text-sm">{line.trim()}</span>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="w-5 h-5" />
            Detalhes do Paciente
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações Básicas */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Informações Pessoais</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">Nome:</span>
                    <span>{patient.fullName}</span>
                  </div>
                  
                  {patient.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Email:</span>
                      <span>{patient.email}</span>
                    </div>
                  )}
                  
                  {patient.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Telefone:</span>
                      <span>{patient.phone}</span>
                    </div>
                  )}
                  
                  {patient.dateOfBirth && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Data de Nascimento:</span>
                      <span>{formatDate(patient.dateOfBirth)}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  {patient.gender && (
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Gênero:</span>
                      <span>{patient.gender}</span>
                    </div>
                  )}
                  
                  {patient.weight && (
                    <div className="flex items-center gap-2">
                      <Scale className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Peso:</span>
                      <span>{patient.weight} kg</span>
                    </div>
                  )}
                  
                  {patient.height && (
                    <div className="flex items-center gap-2">
                      <Ruler className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">Altura:</span>
                      <span>{patient.height} cm</span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">Status:</span>
                    <Badge className={getStatusColor(patient.status || 'active')}>
                      {patient.status || 'Ativo'}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Anamnese Inicial e Recordatório 24h */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {patient.anamnese_inicial && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <FileText className="w-5 h-5" />
                    Anamnese Inicial
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm leading-relaxed bg-muted/30 p-4 rounded-lg">
                    {patient.anamnese_inicial.split('\n').map((paragraph, index) => (
                      <p key={index} className="mb-2 last:mb-0">
                        {paragraph}
                      </p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {patient.recordatorio_24h && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Clock className="w-5 h-5" />
                    Recordatório 24 Horas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm leading-relaxed bg-muted/30 p-4 rounded-lg">
                    {patient.recordatorio_24h.split('\n').map((entry, index) => (
                      <div key={index} className="mb-2 last:mb-0">
                        {entry}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Suplementos e Medicamentos */}
          {patient.suplementos_medicamentos && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Pill className="w-5 h-5" />
                  Suplementos e Medicamentos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="bg-muted/30 p-4 rounded-lg">
                  {formatTextAsBullets(patient.suplementos_medicamentos)}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Feedbacks */}
          {patient.feedbacks && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <MessageSquare className="w-5 h-5" />
                  Feedbacks e Histórico
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm leading-relaxed bg-muted/30 p-4 rounded-lg">
                  {patient.feedbacks.split('\n').map((feedback, index) => (
                    <p key={index} className="mb-3 last:mb-0">
                      {feedback}
                    </p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Informações Médicas */}
          {(patient.medicalHistory || patient.dietaryRestrictions || patient.goals) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Informações Médicas e Objetivos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {patient.medicalHistory && (
                  <div>
                    <h4 className="font-medium mb-2">Histórico:</h4>
                    <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded">
                      {patient.medicalHistory}
                    </p>
                  </div>
                )}
                
                {patient.dietaryRestrictions && (
                  <div>
                    <h4 className="font-medium mb-2">Restrições Alimentares:</h4>
                    <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded">
                      {patient.dietaryRestrictions}
                    </p>
                  </div>
                )}
                
                {patient.goals && (
                  <div>
                    <h4 className="font-medium mb-2">Objetivos:</h4>
                    <p className="text-sm text-muted-foreground bg-muted/30 p-3 rounded">
                      {patient.goals}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Observações */}
          {patient.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Observações do Nutricionista</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground bg-muted/30 p-4 rounded-lg">
                  {patient.notes}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Insights de IA */}
          <AIInsights patient={patient} />

          {/* Última Consulta */}
          {patient.lastConsultation && (
            <div className="text-center text-sm text-muted-foreground">
              <Separator className="mb-4" />
              Última consulta: {formatDate(patient.lastConsultation)}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}