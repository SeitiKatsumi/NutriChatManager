import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  RefreshCw, 
  TrendingUp, 
  Calendar, 
  Clock, 
  Send, 
  ChevronDown, 
  Loader2,
  CheckCircle2,
  AlertCircle,
  MessageCircle
} from "lucide-react";
import { Patient } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface PatientSchedulesProps {
  patient: Patient;
}

interface Schedule {
  id: number;
  patient_id: number;
  nutritionist_id: string;
  type: "reactivation" | "meal_feedback" | "post_consultation";
  status: "disabled" | "enabled" | "paused" | "completed";
  message_template: string | null;
  config: any;
  next_run_at: string | null;
  last_run_at: string | null;
  failure_count: number;
  last_error: string | null;
}

const scheduleTypeLabels = {
  reactivation: { 
    label: "Reativação", 
    icon: RefreshCw, 
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    description: "Envie lembretes para pacientes que não entram em contato há algum tempo."
  },
  meal_feedback: { 
    label: "Feedback do Plano", 
    icon: TrendingUp, 
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    description: "Acompanhe a evolução do paciente após 7 ou 15 dias."
  },
  post_consultation: { 
    label: "Pós-Consulta", 
    icon: Calendar, 
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    description: "Envie mensagens automáticas após cada consulta."
  },
};

export default function PatientSchedules({ patient }: PatientSchedulesProps) {
  const { toast } = useToast();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [editingSchedules, setEditingSchedules] = useState<Record<string, any>>({});
  const [optimisticStates, setOptimisticStates] = useState<Record<string, boolean>>({});
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});

  const patientId = parseInt(patient.id);

  const { data: schedules, isLoading, refetch } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules/patient", patientId],
    queryFn: async () => {
      const response = await fetch(`/api/schedules/patient/${patientId}`);
      if (!response.ok) throw new Error("Failed to fetch schedules");
      return response.json();
    },
  });

  const createScheduleMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/schedules", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules/patient", patientId] });
      toast({ title: "Agendamento criado com sucesso!" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro ao criar agendamento", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const updateScheduleMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: any }) => {
      return apiRequest("PATCH", `/api/schedules/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules/patient", patientId] });
      toast({ title: "Agendamento atualizado!" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro ao atualizar agendamento", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const sendNowMutation = useMutation({
    mutationFn: async (scheduleId: number) => {
      return apiRequest("POST", `/api/schedules/${scheduleId}/send-now`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/schedules/patient", patientId] });
      toast({ title: "Mensagem enviada com sucesso!" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Erro ao enviar mensagem", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const getScheduleByType = (type: string) => {
    return schedules?.find(s => s.type === type) || null;
  };

  const toggleSection = (type: string) => {
    setOpenSections(prev => ({ ...prev, [type]: !prev[type] }));
  };

  const handleToggleSchedule = async (type: string, enabled: boolean) => {
    const existingSchedule = getScheduleByType(type);
    
    setOptimisticStates(prev => ({ ...prev, [type]: enabled }));
    setLoadingStates(prev => ({ ...prev, [type]: true }));
    
    try {
      if (existingSchedule) {
        await updateScheduleMutation.mutateAsync({
          id: existingSchedule.id,
          updates: { status: enabled ? "enabled" : "disabled" },
        });
      } else if (enabled) {
        const defaultConfig = getDefaultConfig(type);
        await createScheduleMutation.mutateAsync({
          patient_id: patientId,
          type,
          status: "enabled",
          config: defaultConfig,
        });
      }
    } catch (error) {
      setOptimisticStates(prev => ({ ...prev, [type]: !enabled }));
    } finally {
      setLoadingStates(prev => ({ ...prev, [type]: false }));
      setOptimisticStates(prev => {
        const newState = { ...prev };
        delete newState[type];
        return newState;
      });
    }
  };

  const isScheduleEnabled = (type: string) => {
    if (type in optimisticStates) {
      return optimisticStates[type];
    }
    return getScheduleByType(type)?.status === "enabled";
  };

  const getDefaultConfig = (type: string) => {
    switch (type) {
      case "reactivation":
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(10, 0, 0, 0);
        return { send_at: tomorrow.toISOString() };
      case "meal_feedback":
        return { interval_days: "7", start_date: new Date().toISOString() };
      case "post_consultation":
        return { days_after: 3 };
      default:
        return {};
    }
  };

  const handleSaveConfig = async (type: string) => {
    const existingSchedule = getScheduleByType(type);
    const editData = editingSchedules[type];
    
    if (!editData) return;

    if (existingSchedule) {
      await updateScheduleMutation.mutateAsync({
        id: existingSchedule.id,
        updates: {
          config: editData.config,
          message_template: editData.message_template,
        },
      });
    } else {
      await createScheduleMutation.mutateAsync({
        patient_id: patientId,
        type,
        status: "disabled",
        config: editData.config,
        message_template: editData.message_template,
      });
    }
    
    setEditingSchedules(prev => {
      const updated = { ...prev };
      delete updated[type];
      return updated;
    });
  };

  const initEditState = (type: string) => {
    const existingSchedule = getScheduleByType(type);
    setEditingSchedules(prev => ({
      ...prev,
      [type]: {
        config: existingSchedule?.config || getDefaultConfig(type),
        message_template: existingSchedule?.message_template || "",
      },
    }));
  };

  const formatDateTime = (isoString: string | null) => {
    if (!isoString) return "Não agendado";
    const date = new Date(isoString);
    return date.toLocaleString('pt-BR', { 
      dateStyle: 'short', 
      timeStyle: 'short' 
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Agendamentos Automáticos
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const renderScheduleConfig = (type: "reactivation" | "meal_feedback" | "post_consultation") => {
    const schedule = getScheduleByType(type);
    const isEnabled = isScheduleEnabled(type);
    const isToggling = loadingStates[type];
    const editData = editingSchedules[type];
    const isEditing = !!editData;
    const typeInfo = scheduleTypeLabels[type];
    const Icon = typeInfo.icon;

    return (
      <Collapsible 
        key={type}
        open={openSections[type]} 
        onOpenChange={() => toggleSection(type)}
      >
        <div className={`p-4 rounded-lg border transition-colors ${isEnabled ? 'border-primary/30 bg-primary/5' : ''}`}>
          <CollapsibleTrigger className="w-full">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${typeInfo.bgColor}`}>
                  <Icon className={`h-5 w-5 ${typeInfo.color}`} />
                </div>
                <div className="text-left">
                  <h4 className="font-medium">{typeInfo.label}</h4>
                  <p className="text-xs text-muted-foreground">
                    {typeInfo.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  {isToggling && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    </div>
                  )}
                  <Switch
                    checked={isEnabled}
                    onCheckedChange={(checked) => handleToggleSchedule(type, checked)}
                    onClick={(e) => e.stopPropagation()}
                    disabled={isToggling}
                    className={isToggling ? 'opacity-50' : ''}
                    data-testid={`switch-schedule-${type}`}
                  />
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${openSections[type] ? 'rotate-180' : ''}`} />
              </div>
            </div>
          </CollapsibleTrigger>

          <CollapsibleContent className="pt-4">
            <Separator className="mb-4" />
            
            {schedule && (
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <Badge variant={isEnabled ? "default" : "secondary"}>
                  {isEnabled ? "Ativo" : "Desativado"}
                </Badge>
                {schedule.last_run_at && (
                  <span className="text-xs text-muted-foreground">
                    Último envio: {formatDateTime(schedule.last_run_at)}
                  </span>
                )}
                {schedule.next_run_at && isEnabled && (
                  <span className="text-xs text-muted-foreground">
                    Próximo: {formatDateTime(schedule.next_run_at)}
                  </span>
                )}
                {schedule.failure_count > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {schedule.failure_count} falhas
                  </Badge>
                )}
              </div>
            )}

            <div className="space-y-4">
              {type === "reactivation" && (
                <div className="space-y-3">
                  <Label htmlFor={`${type}-datetime`}>Data e Hora do Envio</Label>
                  <Input
                    id={`${type}-datetime`}
                    type="datetime-local"
                    value={
                      isEditing 
                        ? (editData.config?.send_at?.slice(0, 16) || "") 
                        : (schedule?.config?.send_at?.slice(0, 16) || "")
                    }
                    onChange={(e) => {
                      if (!isEditing) initEditState(type);
                      setEditingSchedules(prev => ({
                        ...prev,
                        [type]: {
                          ...prev[type],
                          config: { send_at: new Date(e.target.value).toISOString() },
                        },
                      }));
                    }}
                    data-testid={`input-schedule-datetime-${type}`}
                  />
                </div>
              )}

              {type === "meal_feedback" && (
                <div className="space-y-3">
                  <Label htmlFor={`${type}-interval`}>Intervalo de Acompanhamento</Label>
                  <Select
                    value={
                      isEditing 
                        ? editData.config?.interval_days 
                        : (schedule?.config?.interval_days || "7")
                    }
                    onValueChange={(value) => {
                      if (!isEditing) initEditState(type);
                      setEditingSchedules(prev => ({
                        ...prev,
                        [type]: {
                          ...prev[type],
                          config: { 
                            ...prev[type]?.config,
                            interval_days: value 
                          },
                        },
                      }));
                    }}
                  >
                    <SelectTrigger id={`${type}-interval`} data-testid={`select-interval-${type}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">A cada 7 dias</SelectItem>
                      <SelectItem value="15">A cada 15 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {type === "post_consultation" && (
                <div className="space-y-3">
                  <Label htmlFor={`${type}-days`}>Dias após a consulta</Label>
                  <Select
                    value={String(
                      isEditing 
                        ? editData.config?.days_after 
                        : (schedule?.config?.days_after || 3)
                    )}
                    onValueChange={(value) => {
                      if (!isEditing) initEditState(type);
                      setEditingSchedules(prev => ({
                        ...prev,
                        [type]: {
                          ...prev[type],
                          config: { days_after: parseInt(value) },
                        },
                      }));
                    }}
                  >
                    <SelectTrigger id={`${type}-days`} data-testid={`select-days-${type}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 dia após</SelectItem>
                      <SelectItem value="2">2 dias após</SelectItem>
                      <SelectItem value="3">3 dias após</SelectItem>
                      <SelectItem value="5">5 dias após</SelectItem>
                      <SelectItem value="7">7 dias após</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-3">
                <Label htmlFor={`${type}-message`}>
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    Mensagem Personalizada
                  </div>
                </Label>
                <Textarea
                  id={`${type}-message`}
                  placeholder="Deixe em branco para usar a mensagem padrão..."
                  value={
                    isEditing 
                      ? editData.message_template 
                      : (schedule?.message_template || "")
                  }
                  onChange={(e) => {
                    if (!isEditing) initEditState(type);
                    setEditingSchedules(prev => ({
                      ...prev,
                      [type]: {
                        ...prev[type],
                        message_template: e.target.value,
                      },
                    }));
                  }}
                  rows={3}
                  data-testid={`textarea-message-${type}`}
                />
                <p className="text-xs text-muted-foreground">
                  Use {"{nome}"} para inserir o primeiro nome do paciente automaticamente.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                {isEditing && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => handleSaveConfig(type)}
                      disabled={updateScheduleMutation.isPending || createScheduleMutation.isPending}
                      data-testid={`btn-save-schedule-${type}`}
                    >
                      {(updateScheduleMutation.isPending || createScheduleMutation.isPending) ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                      )}
                      Salvar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingSchedules(prev => {
                          const updated = { ...prev };
                          delete updated[type];
                          return updated;
                        });
                      }}
                    >
                      Cancelar
                    </Button>
                  </>
                )}
                
                {schedule && !isEditing && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => sendNowMutation.mutate(schedule.id)}
                    disabled={sendNowMutation.isPending || !patient.whatsappNumber}
                    data-testid={`btn-send-now-${type}`}
                  >
                    {sendNowMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Send className="h-4 w-4 mr-1" />
                    )}
                    Enviar Agora
                  </Button>
                )}
              </div>

              {!patient.whatsappNumber && (
                <p className="text-xs text-yellow-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Paciente não possui número de WhatsApp cadastrado.
                </p>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Agendamentos Automáticos
        </CardTitle>
        <CardDescription>
          Configure mensagens automáticas para este paciente. Todos os agendamentos 
          são desativados por padrão.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {renderScheduleConfig("reactivation")}
        {renderScheduleConfig("meal_feedback")}
        {renderScheduleConfig("post_consultation")}
      </CardContent>
    </Card>
  );
}
