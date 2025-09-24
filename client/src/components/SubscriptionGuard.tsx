import { useLocation, Redirect } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { LoadingSpinner } from "@/components/ui/loading-spinner";

interface SubscriptionGuardProps {
  children: React.ReactNode;
}

export function SubscriptionGuard({ children }: SubscriptionGuardProps) {
  const { user, isLoading: authLoading } = useAuth();
  const { data: subscriptionStatus, isLoading: subscriptionLoading } = useSubscriptionStatus();
  const [location] = useLocation();

  // Don't protect these routes
  const publicRoutes = [
    '/login', 
    '/register', 
    '/subscription/plans', 
    '/subscription/success',
    '/subscription/cancel'
  ];

  const isPublicRoute = publicRoutes.some(route => location.startsWith(route));

  // If user is not logged in or on public routes, allow access
  if (!user || isPublicRoute) {
    return <>{children}</>;
  }

  // Show loading while checking subscription status
  if (authLoading || subscriptionLoading) {
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