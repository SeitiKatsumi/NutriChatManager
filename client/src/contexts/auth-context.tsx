import { createContext, useContext, useEffect, useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface User {
  id: string;
  email: string;
  name: string;
  nutritionistId: string;
}

interface Nutritionist {
  id: string;
  fullName: string;
  email: string;
  crn: string;
  phone: string | null;
  specialization: string | null;
  whatsappNumber: string | null;
  status: string | null;
  status_pagamento: "pendente" | "ativo" | "cancelado" | "expirado";
}

interface AuthContextType {
  user: User | null;
  nutritionist: Nutritionist | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [nutritionist, setNutritionist] = useState<Nutritionist | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = async () => {
    try {
      setIsLoading(true);
      const response = await apiRequest("GET", "/api/auth/me");
      const data = await response.json();
      setUser(data.user);
      setNutritionist(data.nutritionist);
    } catch (error) {
      setUser(null);
      setNutritionist(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await apiRequest("POST", "/api/auth/login", { email, password });
    const data = await response.json();
    
    setUser(data.user);
    setNutritionist(data.nutritionist);
    
    // Invalidate all queries to refetch data for the logged-in user
    queryClient.invalidateQueries();
  };

  const logout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
      setNutritionist(null);
      // Clear all cached queries
      queryClient.clear();
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const value: AuthContextType = {
    user,
    nutritionist,
    isLoading,
    login,
    logout,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}