import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  ArrowLeft, 
  Clock, 
  RefreshCw, 
  TrendingUp, 
  Calendar,
  Search,
  Filter,
  MessageCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Send
} from "lucide-react";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Patient } from "@shared/schema";

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
  date_created: string;
}

interface ScheduleWithPatient extends Schedule {
  patient?: Patient;
}

const scheduleTypeConfig = {
  reactivation: { 
    label: "Reativação", 
    icon: RefreshCw, 
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500"
  },
  meal_feedback: { 
    label: "Feedback do Plano", 
    icon: TrendingUp, 
    color: "text-green-500",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500"
  },
  post_consultation: { 
    label: "Pós-Consulta", 
    icon: Calendar, 
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500"
  },
};

const statusConfig = {
  enabled: { label: "Ativo", color: "bg-green-500", textColor: "text-green-500" },
  disabled: { label: "Inativo", color: "bg-gray-500", textColor: "text-gray-500" },
  paused: { label: "Pausado", color: "bg-yellow-500", textColor: "text-yellow-500" },
  completed: { label: "Concluído", color: "bg-blue-500", textColor: "text-blue-500" },
};

export default function ScheduledMessages() {
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: schedules, isLoading: schedulesLoading } = useQuery<Schedule[]>({
    queryKey: ["/api/schedules"],
  });

  const { data: patients, isLoading: patientsLoading } = useQuery<Patient[]>({
    queryKey: ["/api/patients"],
  });

  const isLoading = schedulesLoading || patientsLoading;

  const schedulesWithPatients: ScheduleWithPatient[] = (schedules || []).map(schedule => ({
    ...schedule,
    patient: patients?.find(p => parseInt(p.id) === schedule.patient_id)
  }));

  const filteredSchedules = schedulesWithPatients.filter(schedule => {
    const matchesSearch = !searchTerm || 
      schedule.patient?.fullName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || schedule.type === typeFilter;
    const matchesStatus = statusFilter === "all" || schedule.status === statusFilter;
    return matchesSearch && matchesType && matchesStatus;
  });

  const pendingSchedules = filteredSchedules.filter(s => 
    s.status === "enabled" && s.next_run_at
  );

  const formatNextRun = (dateStr: string | null) => {
    if (!dateStr) return "Não agendado";
    const date = new Date(dateStr);
    if (isPast(date)) {
      return "Aguardando processamento";
    }
    return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: ptBR });
  };

  return (
    <main className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="mb-6">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="mb-4" data-testid="btn-back-dashboard">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar ao Dashboard
          </Button>
        </Link>
        
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <MessageCircle className="h-7 w-7 text-primary" />
              Automações de WhatsApp
            </h1>
            <p className="text-muted-foreground mt-1">
              Visualize e gerencie todas as automações de mensagens
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-yellow-500 border-yellow-500">
              <Clock className="h-3 w-3 mr-1" />
              {pendingSchedules.length} pendentes
            </Badge>
          </div>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por paciente..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search-patient"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger data-testid="select-type-filter">
                <SelectValue placeholder="Tipo de mensagem" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="reactivation">Reativação</SelectItem>
                <SelectItem value="meal_feedback">Feedback do Plano</SelectItem>
                <SelectItem value="post_consultation">Pós-Consulta</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="enabled">Ativo</SelectItem>
                <SelectItem value="disabled">Inativo</SelectItem>
                <SelectItem value="paused">Pausado</SelectItem>
                <SelectItem value="completed">Concluído</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Automações
          </CardTitle>
          <CardDescription>
            {filteredSchedules.length} automação(ões) encontrada(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredSchedules.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Nenhuma automação encontrada
              </h3>
              <p className="text-muted-foreground">
                {searchTerm || typeFilter !== "all" || statusFilter !== "all" 
                  ? "Tente ajustar os filtros de busca"
                  : "Configure automações nos perfis dos pacientes"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Paciente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Próximo Envio</TableHead>
                    <TableHead>Último Envio</TableHead>
                    <TableHead>Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSchedules.map((schedule) => {
                    const typeConfig = scheduleTypeConfig[schedule.type];
                    const TypeIcon = typeConfig?.icon || MessageCircle;
                    const status = statusConfig[schedule.status];
                    
                    return (
                      <TableRow 
                        key={schedule.id}
                        data-testid={`schedule-row-${schedule.id}`}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-primary font-semibold text-sm">
                                {schedule.patient?.fullName?.charAt(0).toUpperCase() || '?'}
                              </span>
                            </div>
                            <div>
                              <p className="font-medium">
                                {schedule.patient?.fullName || 'Paciente não encontrado'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {schedule.patient?.whatsappNumber || '-'}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className={`inline-flex items-center gap-2 px-2 py-1 rounded-md ${typeConfig?.bgColor}`}>
                            <TypeIcon className={`h-4 w-4 ${typeConfig?.color}`} />
                            <span className={`text-sm font-medium ${typeConfig?.color}`}>
                              {typeConfig?.label}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={`${status?.textColor} border-current`}
                          >
                            {schedule.status === "enabled" && <CheckCircle2 className="h-3 w-3 mr-1" />}
                            {schedule.status === "disabled" && <AlertCircle className="h-3 w-3 mr-1" />}
                            {status?.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className={schedule.next_run_at && isPast(new Date(schedule.next_run_at)) ? "text-yellow-500" : ""}>
                              {formatNextRun(schedule.next_run_at)}
                            </span>
                          </div>
                          {schedule.next_run_at && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDate(schedule.next_run_at)}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          {schedule.last_run_at ? (
                            <div>
                              <p className="text-sm">{formatDate(schedule.last_run_at)}</p>
                              {schedule.failure_count > 0 && (
                                <p className="text-xs text-red-500">
                                  {schedule.failure_count} falha(s)
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground">
                            {schedule.type === "reactivation" && schedule.config?.send_at && (
                              <span>Data única: {formatDate(schedule.config.send_at)}</span>
                            )}
                            {schedule.type === "meal_feedback" && schedule.config?.interval_days && (
                              <span>A cada {schedule.config.interval_days} dias</span>
                            )}
                            {schedule.type === "post_consultation" && schedule.config?.days_after && (
                              <span>{schedule.config.days_after} dias após consulta</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Resumo por Tipo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(["reactivation", "meal_feedback", "post_consultation"] as const).map((type) => {
              const config = scheduleTypeConfig[type];
              const TypeIcon = config.icon;
              const typeSchedules = schedulesWithPatients.filter(s => s.type === type);
              const activeCount = typeSchedules.filter(s => s.status === "enabled").length;
              
              return (
                <Card key={type} className={`border-l-4 ${config.borderColor}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-lg ${config.bgColor}`}>
                          <TypeIcon className={`h-5 w-5 ${config.color}`} />
                        </div>
                        <div>
                          <p className="font-medium">{config.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {typeSchedules.length} total
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-2xl font-bold ${config.color}`}>{activeCount}</p>
                        <p className="text-xs text-muted-foreground">ativos</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
