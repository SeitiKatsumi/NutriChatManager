import { useState } from "react";
import { 
  Search, 
  Trash2, 
  Edit, 
  MoreHorizontal, 
  ChevronDown,
  UserCheck,
  Clock,
  XCircle,
  Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

interface PatientsTableProps {
  patients: any[];
  isLoading: boolean;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  selectedStatus: string;
  onStatusChange: (status: string) => void;
  onDelete: (id: string, name: string) => void;
  onEdit: (patient: any) => void;
  onView: (patient: any) => void;
}

export default function PatientsTable({
  patients,
  isLoading,
  searchTerm,
  onSearchChange,
  selectedStatus,
  onStatusChange,
  onDelete,
  onEdit,
  onView,
}: PatientsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      inactive: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      completed: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    };
    return colors[status] || "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200";
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <UserCheck className="w-3 h-3" />;
      case 'inactive':
        return <XCircle className="w-3 h-3" />;
      case 'completed':
        return <Clock className="w-3 h-3" />;
      default:
        return <UserCheck className="w-3 h-3" />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active':
        return 'Ativo';
      case 'inactive':
        return 'Inativo';
      case 'completed':
        return 'Concluído';
      default:
        return 'Ativo';
    }
  };

  const totalPages = Math.ceil(patients.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedPatients = patients.slice(startIndex, startIndex + itemsPerPage);

  return (
    <Card>
      <CardContent className="p-6">
        {/* Filters */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Input
                placeholder="Buscar por nome, email ou telefone..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-10 w-80"
                data-testid="input-search-patients"
              />
              <Search className="absolute left-3 top-3.5 w-4 h-4 text-muted-foreground" />
            </div>
            <Select value={selectedStatus} onValueChange={onStatusChange}>
              <SelectTrigger className="w-48" data-testid="select-status-filter">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
                <SelectItem value="completed">Concluídos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground">
            {patients.length} paciente(s) total
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 font-medium text-foreground">
                  Paciente
                </th>
                <th className="text-left py-3 px-4 font-medium text-foreground">
                  Contato
                </th>
                <th className="text-left py-3 px-4 font-medium text-foreground">
                  Informações
                </th>
                <th className="text-left py-3 px-4 font-medium text-foreground">
                  Status
                </th>
                <th className="text-left py-3 px-4 font-medium text-foreground">
                  Última Consulta
                </th>
                <th className="text-center py-3 px-4 font-medium text-foreground">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                // Loading skeleton
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-border animate-pulse">
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-muted rounded-full" />
                        <div className="space-y-2">
                          <div className="h-4 bg-muted rounded w-32" />
                          <div className="h-3 bg-muted rounded w-24" />
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="space-y-2">
                        <div className="h-3 bg-muted rounded w-40" />
                        <div className="h-3 bg-muted rounded w-32" />
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="space-y-2">
                        <div className="h-3 bg-muted rounded w-20" />
                        <div className="h-3 bg-muted rounded w-16" />
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="h-5 bg-muted rounded-full w-16" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="h-3 bg-muted rounded w-20" />
                    </td>
                    <td className="py-4 px-4 text-center">
                      <div className="h-8 w-8 bg-muted rounded mx-auto" />
                    </td>
                  </tr>
                ))
              ) : paginatedPatients.length > 0 ? (
                paginatedPatients.map((patient: any) => (
                  <tr key={patient.id} className="border-b border-border hover:bg-muted/50">
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                          <UserCheck className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium text-foreground" data-testid={`patient-name-${patient.id}`}>
                            {patient.fullName}
                          </div>
                          {patient.dateOfBirth && (
                            <div className="text-sm text-muted-foreground">
                              {new Date().getFullYear() - new Date(patient.dateOfBirth).getFullYear()} anos
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="space-y-1">
                        {patient.email && (
                          <div className="text-sm text-foreground" data-testid={`patient-email-${patient.id}`}>
                            {patient.email}
                          </div>
                        )}
                        {patient.phone && (
                          <div className="text-sm text-muted-foreground" data-testid={`patient-phone-${patient.id}`}>
                            {patient.phone}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="space-y-1">
                        {patient.weight && (
                          <div className="text-sm text-foreground">
                            {patient.weight} kg
                          </div>
                        )}
                        {patient.height && (
                          <div className="text-sm text-muted-foreground">
                            {patient.height} cm
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <Badge 
                        className={`${getStatusColor(patient.status || 'active')} inline-flex items-center gap-1`}
                        data-testid={`patient-status-${patient.id}`}
                      >
                        {getStatusIcon(patient.status || 'active')}
                        {getStatusLabel(patient.status || 'active')}
                      </Badge>
                    </td>
                    <td className="py-4 px-4">
                      <div className="text-sm text-muted-foreground">
                        {patient.lastConsultation 
                          ? new Date(patient.lastConsultation).toLocaleDateString('pt-BR')
                          : 'Nunca'
                        }
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            data-testid={`patient-actions-${patient.id}`}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => onView(patient)}
                            data-testid={`view-patient-${patient.id}`}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Visualizar
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => onEdit(patient)}
                            data-testid={`edit-patient-${patient.id}`}
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem 
                            onClick={() => onDelete(patient.id, patient.fullName)}
                            className="text-destructive focus:text-destructive"
                            data-testid={`delete-patient-${patient.id}`}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="text-muted-foreground">
                      <UserCheck className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg mb-2">Nenhum paciente encontrado</p>
                      <p className="text-sm">
                        {searchTerm || selectedStatus !== "all"
                          ? "Tente ajustar os filtros de busca"
                          : "Adicione seu primeiro paciente para começar"
                        }
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <div className="text-sm text-muted-foreground">
              Mostrando {startIndex + 1} a {Math.min(startIndex + itemsPerPage, patients.length)} de {patients.length} pacientes
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                data-testid="previous-page-patients"
              >
                Anterior
              </Button>
              <div className="flex items-center space-x-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                    className="w-8 h-8 p-0"
                    data-testid={`page-${page}-patients`}
                  >
                    {page}
                  </Button>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                data-testid="next-page-patients"
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}