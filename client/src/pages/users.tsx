import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import UsersTable from "@/components/users/users-table";

export default function Users() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSpecialization, setSelectedSpecialization] = useState("");

  const { data: nutritionists, isLoading } = useQuery<any[]>({
    queryKey: ["/api/nutritionists"],
  });

  const filteredNutritionists = nutritionists?.filter((nutritionist: any) => {
    const matchesSearch = nutritionist.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         nutritionist.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSpecialization = !selectedSpecialization || selectedSpecialization === "all" || nutritionist.specialization === selectedSpecialization;
    return matchesSearch && matchesSpecialization;
  }) || [];

  return (
    <main className="p-6">
      <div className="max-w-7xl mx-auto">
        {/* Users Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="users-title">
              Gerenciar Usuários
            </h1>
            <p className="text-muted-foreground">
              Administre nutricionistas cadastrados no sistema
            </p>
          </div>
          <Button data-testid="button-add-user">
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Usuário
          </Button>
        </div>

        <UsersTable
          nutritionists={filteredNutritionists}
          isLoading={isLoading}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          selectedSpecialization={selectedSpecialization}
          onSpecializationChange={setSelectedSpecialization}
        />
      </div>
    </main>
  );
}
