import { useQuery } from '@tanstack/react-query';

interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  subscriptionStatus: string;
  planId: string | null;
  subscriptionStartDate: string | null;
  subscriptionEndDate: string | null;
  stripeCustomerId: string | null;
  needsSubscription: boolean;
}

export function useSubscriptionStatus(enabled: boolean = true) {
  return useQuery<SubscriptionStatus>({
    queryKey: ['/api/subscription/status'],
    enabled: enabled,
    retry: 1,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}