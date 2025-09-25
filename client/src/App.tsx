import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { SubscriptionGuard } from "@/components/SubscriptionGuard";
import NotFound from "@/pages/not-found";
import Register from "@/pages/register";
import LoginPage from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Users from "@/pages/users";
import Patients from "@/pages/patients";
import WhatsApp from "@/pages/whatsapp";
import AdminLogin from "@/pages/admin-login";
import Admin from "@/pages/admin";
import SubscriptionPlans from "@/pages/subscription-plans";
import SubscriptionSuccess from "@/pages/subscription-success";
import DashboardAssinatura from "@/pages/dashboard-assinatura";
import Header from "@/components/layout/header";
import { useEffect } from "react";

// Protected route wrapper
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}

// Public route wrapper (redirects to dashboard if already logged in)
function PublicRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && user) {
      // Let SubscriptionGuard handle the redirect logic instead of going directly to dashboard
      navigate("/dashboard");
    }
  }, [user, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (user) {
    return null;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <div className="min-h-screen bg-background">
      <SubscriptionGuard>
        <Switch>
          {/* Hidden Admin routes - no navigation, no header */}
          <Route path="/admin/login">
            <AdminLogin />
          </Route>
          <Route path="/admin">
            <Admin />
          </Route>
          
          {/* Public routes */}
          <Route path="/login">
            <PublicRoute>
              <LoginPage />
            </PublicRoute>
          </Route>
          <Route path="/register">
            <PublicRoute>
              <Register />
            </PublicRoute>
          </Route>
          
          {/* Subscription routes - Public routes handled by SubscriptionGuard */}
          <Route path="/subscription/plans">
            <SubscriptionPlans />
          </Route>
          <Route path="/subscription/success">
            <SubscriptionSuccess />
          </Route>
          
          {/* Main app routes - Protected by SubscriptionGuard only */}
          <Route path="/">
            <Header />
            <Dashboard />
          </Route>
          <Route path="/dashboard">
            <Header />
            <Dashboard />
          </Route>
          <Route path="/users">
            <Header />
            <Users />
          </Route>
          <Route path="/patients">
            <Header />
            <Patients />
          </Route>
          <Route path="/whatsapp">
            <Header />
            <WhatsApp />
          </Route>
          <Route path="/dashboard/assinatura">
            <Header />
            <DashboardAssinatura />
          </Route>
          
          <Route component={NotFound} />
        </Switch>
      </SubscriptionGuard>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
