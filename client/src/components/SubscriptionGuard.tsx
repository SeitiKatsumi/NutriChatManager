import { useLocation, Redirect } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

export function SubscriptionGuard({ children }: SubscriptionGuardProps) {
  const { user, isLoading: authLoading } = useAuth();
  const [location] = useLocation();

  // Public routes that don't require authentication
  const publicRoutes = [
    '/login', 
    '/register', 
    '/subscription/plans', 
    '/subscription/success',
    '/subscription/cancel',
    '/admin/login',
    '/admin'
  ];

  const isPublicRoute = publicRoutes.some(route => location.startsWith(route));
  
  // If on public routes, allow access
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // If user is not logged in, redirect to login page
  if (!user) {
    return <Redirect to="/login" />;
  }

  // User is authenticated - allow access to dashboard (subscription managed inside)
  return <>{children}</>;
}