import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, UserCheck, Calendar, Phone, Mail, LogOut, Eye } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface Nutritionist {
  id: string;
  fullName: string;
  email: string;
  crn: string;
  phone: string;
  address: string;
  specialization: string;
  whatsappNumber: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastAccess: string;
  evolutionInstance: string;
  whatsappIA: string;
}

interface Patient {
  id: string;
  nutritionistId: string;
  fullName: string;
  whatsapp: string;
  phone: string;
  birthDate: string;
  gender: string;
  weight: string;
  height: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export default function Admin() {
  const [, navigate] = useLocation();
  const [admin, setAdmin] = useState<any>(null);
  const [selectedNutritionist, setSelectedNutritionist] = useState<Nutritionist | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const adminData = localStorage.getItem("admin");
    if (!adminData) {
      navigate("/admin/login");
      return;
    }
    setAdmin(JSON.parse(adminData));
  }, [navigate]);

  const { data: nutritionists = [], isLoading: loadingNutritionists } = useQuery<Nutritionist[]>({
    queryKey: ["/api/admin/nutritionists"],
    enabled: !!admin,
  });

  const { data: patients = [], isLoading: loadingPatients } = useQuery<Patient[]>({
    queryKey: ["/api/admin/patients"],
    enabled: !!admin,
  });

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      localStorage.removeItem("admin");
      navigate("/admin/login");
      toast({
        title: "Logout realizado",
        description: "Você foi desconectado com sucesso",
      });
    } catch (error) {
      console.error("Erro no logout:", error);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "Nunca";
    try {
      return format(new Date(dateString), "dd/MM/yyyy HH:mm", { locale: ptBR });
    } catch {
      return dateString;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status?.toLowerCase()) {
      case "active":
        return "default";
      case "inactive":
        return "secondary";
      default:
        return "outline";
    }
  };

  if (!admin) {
    return null;
  }

  if (loadingNutritionists || loadingPatients) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando dados...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="title-admin-panel">
              Painel Administrativo
            </h1>
            <p className="text-sm text-muted-foreground">
              Bem-vindo, {admin.name}
            </p>
          </div>
          <Button onClick={handleLogout} variant="outline" data-testid="button-admin-logout">
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Nutricionistas</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-nutritionists">
                {nutritionists.length}
              </div>
              <p className="text-xs text-muted-foreground">
                Cadastrados na plataforma
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Pacientes</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-patients">
                {patients.length}
              </div>
              <p className="text-xs text-muted-foreground">
                Em acompanhamento
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Nutricionistas Ativos</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-active-nutritionists">
                {nutritionists.filter((n: Nutritionist) => n.status === "active").length}
              </div>
              <p className="text-xs text-muted-foreground">
                Com status ativo
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Nutritionists Table */}
        <Card>
          <CardHeader>
            <CardTitle>Nutricionistas Cadastrados</CardTitle>
            <CardDescription>
              Lista completa de todos os nutricionistas da plataforma
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>CRN</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Último Acesso</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nutritionists.map((nutritionist: Nutritionist) => (
                  <TableRow key={nutritionist.id} data-testid={`row-nutritionist-${nutritionist.id}`}>
                    <TableCell className="font-medium">
                      {nutritionist.fullName}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Mail className="w-4 h-4 mr-2 text-muted-foreground" />
                        {nutritionist.email}
                      </div>
                    </TableCell>
                    <TableCell>{nutritionist.crn || "Não informado"}</TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Phone className="w-4 h-4 mr-2 text-muted-foreground" />
                        {nutritionist.whatsappNumber || "Não informado"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(nutritionist.status)}>
                        {nutritionist.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                        {formatDate(nutritionist.lastAccess)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedNutritionist(nutritionist)}
                            data-testid={`button-view-nutritionist-${nutritionist.id}`}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            Ver Detalhes
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                          <DialogHeader>
                            <DialogTitle>Detalhes do Nutricionista</DialogTitle>
                            <DialogDescription>
                              Informações completas do nutricionista
                            </DialogDescription>
                          </DialogHeader>
                          {selectedNutritionist && (
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <h4 className="font-semibold mb-2">Informações Pessoais</h4>
                                <div className="space-y-2 text-sm">
                                  <p><strong>Nome:</strong> {selectedNutritionist.fullName}</p>
                                  <p><strong>Email:</strong> {selectedNutritionist.email}</p>
                                  <p><strong>CRN:</strong> {selectedNutritionist.crn || "Não informado"}</p>
                                  <p><strong>Telefone:</strong> {selectedNutritionist.phone || "Não informado"}</p>
                                  <p><strong>WhatsApp:</strong> {selectedNutritionist.whatsappNumber || "Não informado"}</p>
                                </div>
                              </div>
                              <div>
                                <h4 className="font-semibold mb-2">Informações da Conta</h4>
                                <div className="space-y-2 text-sm">
                                  <p><strong>Status:</strong> {selectedNutritionist.status}</p>
                                  <p><strong>Especialização:</strong> {selectedNutritionist.specialization || "Não informado"}</p>
                                  <p><strong>Cadastrado em:</strong> {formatDate(selectedNutritionist.createdAt)}</p>
                                  <p><strong>Último acesso:</strong> {formatDate(selectedNutritionist.lastAccess)}</p>
                                  <p><strong>Instância Evolution:</strong> {selectedNutritionist.evolutionInstance || "Não configurado"}</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}