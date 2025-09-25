import { useLocation, Redirect } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

export function SubscriptionGuard({ children }: SubscriptionGuardProps) {
  const { user, isLoading: authLoading } = useAuth();
  const [location] = useLocation();

  // Don't protect these routes
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
  
  // Only check subscription status for authenticated users on non-public routes
  const shouldCheckSubscription = !!user && !isPublicRoute;
  const { data: subscriptionStatus, isLoading: subscriptionLoading } = useSubscriptionStatus(shouldCheckSubscription);

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

  // If user is not logged in, redirect to registration page
  if (!user) {
    return <Redirect to="/register" />;
  }

  // Show loading while checking subscription status
  if (subscriptionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  // If user doesn't have active subscription, redirect to plans
  if (subscriptionStatus?.needsSubscription) {
    return <Redirect to="/subscription/plans" />;
  }

  // User has active subscription, allow access
  return <>{children}</>;
}