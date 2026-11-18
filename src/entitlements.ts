import { PlanEntitlements, PlanTier, User } from './types.js';

export const FREE_ENTITLEMENTS: Omit<PlanEntitlements, 'plan' | 'isPremium' | 'planExpiresAt'> = {
  maxChildren: 1,
  maxPlaylists: 1,
  maxActivePresets: 1,
  allowCustomTagRules: false,
  allowPrivateChannels: false,
  allowAttentionTracking: false,
  allowWeeklyInsights: false,
  dailySearchRequestLimit: 3
};

export const PREMIUM_ENTITLEMENTS: Omit<PlanEntitlements, 'plan' | 'isPremium' | 'planExpiresAt'> = {
  maxChildren: null,
  maxPlaylists: null,
  maxActivePresets: null,
  allowCustomTagRules: true,
  allowPrivateChannels: true,
  allowAttentionTracking: true,
  allowWeeklyInsights: true,
  dailySearchRequestLimit: null
};

export function resolveUserPlan(user?: Pick<User, 'plan' | 'planExpiresAt'> | null): PlanTier {
  if (!user || user.plan !== 'PREMIUM') return 'FREE';
  if (user.planExpiresAt) {
    const expiresMs = Date.parse(user.planExpiresAt);
    if (!Number.isNaN(expiresMs) && expiresMs <= Date.now()) {
      return 'FREE';
    }
  }
  return 'PREMIUM';
}

export function getEntitlementsForPlan(
  plan: PlanTier,
  planExpiresAt?: string | null
): PlanEntitlements {
  const base = plan === 'PREMIUM' ? PREMIUM_ENTITLEMENTS : FREE_ENTITLEMENTS;
  return {
    plan,
    isPremium: plan === 'PREMIUM',
    planExpiresAt: plan === 'PREMIUM' ? (planExpiresAt ?? null) : null,
    ...base
  };
}

export function buildPremiumRequiredPayload(
  feature: string,
  message: string,
  limit?: number | null
) {
  return {
    success: false,
    code: 'PREMIUM_REQUIRED',
    feature,
    ...(limit !== undefined ? { limit } : {}),
    message
  };
}
