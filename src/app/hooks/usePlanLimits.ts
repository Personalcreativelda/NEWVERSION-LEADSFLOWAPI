import { useMemo } from 'react';

// Mirrors backend getPlanLimits — single source of truth for feature gates
const PLAN_FEATURE_LIMITS = {
  free: {
    leads: 100,
    messages: 100,
    massMessages: 50,
    channels: 1,
    customAssistants: 0,
    voiceAgents: 0,
    activeCampaigns: 1,
    marketplaceAssistants: false,
    analytics: 'basic' as const,
    automations: false,
    apiAccess: false,
  },
  business: {
    leads: 2000,
    messages: 1000,
    massMessages: 5000,
    channels: 5,
    customAssistants: 3,
    voiceAgents: 1,
    activeCampaigns: 10,
    marketplaceAssistants: true,
    analytics: 'full' as const,
    automations: true,
    apiAccess: false,
  },
  enterprise: {
    leads: -1,
    messages: -1,
    massMessages: -1,
    channels: -1,
    customAssistants: -1,
    voiceAgents: -1,
    activeCampaigns: -1,
    marketplaceAssistants: true,
    analytics: 'advanced' as const,
    automations: true,
    apiAccess: true,
  },
} as const;

type Plan = 'free' | 'business' | 'enterprise';

function readUserFromStorage(): { plan: Plan; limits: any; usage: any } {
  try {
    const raw = localStorage.getItem('leadflow_user');
    if (raw) {
      const u = JSON.parse(raw);
      const plan = ((u.plan || 'free').toLowerCase()) as Plan;
      return {
        plan: ['free', 'business', 'enterprise'].includes(plan) ? plan : 'free',
        limits: u.limits || null,
        usage: u.usage || null,
      };
    }
  } catch { /* ignore */ }
  return { plan: 'free', limits: null, usage: null };
}

/** Returns -1 for unlimited, otherwise the positive limit */
function resolveLimit(fromProfile: number | undefined | null, fromHardcoded: number): number {
  if (fromProfile !== undefined && fromProfile !== null) return fromProfile;
  return fromHardcoded;
}

function canCreate(limit: number, currentCount: number): boolean {
  if (limit === -1) return true; // unlimited
  return currentCount < limit;
}

function limitLabel(limit: number): string {
  return limit === -1 ? 'Ilimitado' : String(limit);
}

export function usePlanLimits() {
  return useMemo(() => {
    const { plan, limits: profileLimits, usage: profileUsage } = readUserFromStorage();
    const config = PLAN_FEATURE_LIMITS[plan] ?? PLAN_FEATURE_LIMITS.free;

    const limits = {
      leads:            resolveLimit(profileLimits?.leads, config.leads),
      messages:         resolveLimit(profileLimits?.messages, config.messages),
      massMessages:     resolveLimit(profileLimits?.massMessages, config.massMessages),
      channels:         resolveLimit(profileLimits?.channels, config.channels),
      customAssistants: resolveLimit(profileLimits?.customAssistants, config.customAssistants),
      voiceAgents:      resolveLimit(profileLimits?.voiceAgents, config.voiceAgents),
      activeCampaigns:  resolveLimit(profileLimits?.activeCampaigns, config.activeCampaigns),
    };

    const usage = {
      leads:            (profileUsage?.leads ?? 0) as number,
      messages:         (profileUsage?.messages ?? 0) as number,
      massMessages:     (profileUsage?.massMessages ?? 0) as number,
      channels:         (profileUsage?.channels ?? 0) as number,
      customAssistants: (profileUsage?.customAssistants ?? 0) as number,
      voiceAgents:      (profileUsage?.voiceAgents ?? 0) as number,
      activeCampaigns:  (profileUsage?.activeCampaigns ?? 0) as number,
    };

    const features = {
      marketplaceAssistants: config.marketplaceAssistants,
      analytics: config.analytics,
      automations: config.automations,
      apiAccess: config.apiAccess,
    };

    return {
      plan,
      limits,
      usage,
      features,
      isFreePlan: plan === 'free',
      isPaidPlan: plan !== 'free',
      isEnterprisePlan: plan === 'enterprise',

      // Usage-aware check functions — only block when limit is actually reached
      canAddLead:           () => canCreate(limits.leads, usage.leads),
      canSendMessage:       () => canCreate(limits.messages, usage.messages),
      canSendMassCampaign:  () => canCreate(limits.massMessages, usage.massMessages),
      // Pass current count from page state so we check real usage, not profile snapshot
      canAddChannel:             (currentCount: number) => canCreate(limits.channels, currentCount),
      canCreateCustomAssistant:  (currentCount: number) => canCreate(limits.customAssistants, currentCount),
      canCreateVoiceAgent:       (currentCount: number) => canCreate(limits.voiceAgents, currentCount),
      canCreateActiveCampaign:   (currentCount: number) => canCreate(limits.activeCampaigns, currentCount),

      // Human-readable limit labels for UI tooltips / messages
      limitLabel: {
        channels:         limitLabel(limits.channels),
        customAssistants: limitLabel(limits.customAssistants),
        voiceAgents:      limitLabel(limits.voiceAgents),
        activeCampaigns:  limitLabel(limits.activeCampaigns),
        leads:            limitLabel(limits.leads),
        messages:         limitLabel(limits.messages),
      },

      openUpgradeModal: () => window.dispatchEvent(new CustomEvent('leadflow:open-upgrade')),
    };
  }, []);
}
