import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Search, Filter, Download, Edit, Trash2 } from "lucide-react";

interface UsersTableProps {
  nutritionists: any[];
  isLoading: boolean;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  selectedSpecialization: string;
  onSpecializationChange: (spec: string) => void;
}

export default function UsersTable({
  nutritionists,
  isLoading,
  searchTerm,
  onSearchChange,
  selectedSpecialization,
  onSpecializationChange,
}: UsersTableProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const deleteNutritionistMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/nutritionists/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/nutritionists"] });
      toast({
        title: "Usuário removido",
        description: "O nutricionista foi removido com sucesso.",
      });
    },
    onError: () => {
      toast({
        title: "Erro ao remover usuário",
        description: "Tente novamente mais tarde.",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`Tem certeza que deseja remover ${name}?`)) {
      deleteNutritionistMutation.mutate(id);
    }
  };

  const getSpecializationColor = (spec: string) => {
    const colors: Record<string, string> = {
      clinica: "bg-blue-100 text-blue-800",
      esportiva: "bg-green-100 text-green-800",
      pediatrica: "bg-purple-100 text-purple-800",
      geriatrica: "bg-orange-100 text-orange-800",
      estetica: "bg-pink-100 text-pink-800",
    };
    return colors[spec] || "bg-gray-100 text-gray-800";
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      active: "bg-green-100 text-green-800",
      inactive: "bg-red-100 text-red-800",
      pending: "bg-yellow-100 text-yellow-800",
    };
    return colors[status] || "bg-gray-100 text-gray-800";
  };

  const totalPages = Math.ceil(nutritionists.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedNutritionists = nutritionists.slice(startIndex, startIndex + itemsPerPage);

  return (
    <Card>
      <CardContent className="p-6">
        {/* Filters */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Input
                placeholder="Buscar nutricionistas..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-10 w-64"
                data-testid="input-search-users"
              />
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
            </div>
            <Select value={selectedSpecialization} onValueChange={onSpecializationChange}>
              <SelectTrigger className="w-48" data-testid="select-specialization-filter">
                <SelectValue placeholder="Todas as especializações" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas as especializações</SelectItem>
                <SelectItem value="clinica">Nutrição Clínica</SelectItem>
                <SelectItem value="esportiva">Nutrição Esportiva</SelectItem>
                <SelectItem value="pediatrica">Nutrição Pediátrica</SelectItem>
                <SelectItem value="geriatrica">Nutrição Geriátrica</SelectItem>
                <SelectItem value="estetica">Nutrição Estética</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="sm" data-testid="button-filter">
              <Filter className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" data-testid="button-export">
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                  Nutricionista
                </th>
                <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                  Contato
                </th>
                <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                  Especialização
                </th>
                <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                  WhatsApp
                </th>
                <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                  Status
                </th>
                <th className="text-left py-4 px-6 text-sm font-medium text-muted-foreground">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-muted rounded-full" />
                        <div>
                          <div className="h-4 bg-muted rounded w-32 mb-1" />
                          <div className="h-3 bg-muted rounded w-20" />
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div className="h-4 bg-muted rounded w-40 mb-1" />
                      <div className="h-3 bg-muted rounded w-24" />
                    </td>
                    <td className="py-4 px-6">
                      <div className="h-6 bg-muted rounded w-24" />
                    </td>
                    <td className="py-4 px-6">
                      <div className="h-4 bg-muted rounded w-20" />
                    </td>
                    <td className="py-4 px-6">
                      <div className="h-6 bg-muted rounded w-16" />
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex space-x-2">
                        <div className="w-8 h-8 bg-muted rounded" />
                        <div className="w-8 h-8 bg-muted rounded" />
                      </div>
                    </td>
                  </tr>
                ))
              ) : paginatedNutritionists.length > 0 ? (
                paginatedNutritionists.map((nutritionist) => (
                  <tr
                    key={nutritionist.id}
                    className="hover:bg-muted/20 transition-colors"
                    data-testid={`user-row-${nutritionist.id}`}
                  >
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium text-primary">
                            {nutritionist.fullName.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{nutritionist.fullName}</p>
                          <p className="text-sm text-muted-foreground">{nutritionist.crn}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <div>
                        <p className="text-foreground">{nutritionist.email}</p>
                        <p className="text-sm text-muted-foreground">{nutritionist.phone}</p>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <Badge className={getSpecializationColor(nutritionist.specialization)}>
                        {nutritionist.specialization === "clinica" && "Nutrição Clínica"}
                        {nutritionist.specialization === "esportiva" && "Nutrição Esportiva"}
                        {nutritionist.specialization === "pediatrica" && "Nutrição Pediátrica"}
                        {nutritionist.specialization === "geriatrica" && "Nutrição Geriátrica"}
                        {nutritionist.specialization === "estetica" && "Nutrição Estética"}
                      </Badge>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-2">
                        <div className={`w-2 h-2 rounded-full ${
                          nutritionist.whatsappNumber ? "bg-green-500" : "bg-yellow-500"
                        }`} />
                        <span className="text-sm text-foreground">
                          {nutritionist.whatsappNumber ? "Conectado" : "Pendente"}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <Badge className={getStatusColor(nutritionist.status || "active")}>
                        {nutritionist.status === "active" && "Ativo"}
                        {nutritionist.status === "inactive" && "Inativo"}
                        {nutritionist.status === "pending" && "Aguardando"}
                      </Badge>
                    </td>
                    <td className="py-4 px-6">
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          data-testid={`button-edit-${nutritionist.id}`}
                        >
                          <Edit className="w-4 h-4 text-blue-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(nutritionist.id, nutritionist.fullName)}
                          data-testid={`button-delete-${nutritionist.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="text-muted-foreground">
                      <Search className="w-12 h-12 mx-auto mb-4" />
                      <p>Nenhum nutricionista encontrado</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 pt-6 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Mostrando {startIndex + 1}-{Math.min(startIndex + itemsPerPage, nutritionists.length)} de {nutritionists.length} resultados
            </p>
            <div className="flex items-center space-x-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                data-testid="button-prev-page"
              >
                Anterior
              </Button>
              <div className="flex items-center space-x-1">
                {[...Array(Math.min(3, totalPages))].map((_, i) => {
                  const page = i + 1;
                  return (
                    <Button
                      key={page}
                      variant={currentPage === page ? "default" : "secondary"}
                      size="sm"
                      onClick={() => setCurrentPage(page)}
                      className="w-8 h-8"
                      data-testid={`button-page-${page}`}
                    >
                      {page}
                    </Button>
                  );
                })}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                data-testid="button-next-page"
              >
                Próximo
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
