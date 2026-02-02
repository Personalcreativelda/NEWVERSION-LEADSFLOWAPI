// Utility functions for plan and trial management

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  plan: 'free' | 'business' | 'enterprise';
  isTrial?: boolean;
  trialEndsAt?: string;
  limits: {
    leads: number;
    messages: number;
    massMessages: number;
    campaigns?: number;
  };
  usage: {
    leads: number;
    messages: number;
    massMessages: number;
    campaigns?: number;
  };
}

/**
 * Check if user is currently in trial period
 */
export function isInTrial(user: UserProfile | null): boolean {
  if (!user || !user.isTrial || !user.trialEndsAt) {
    return false;
  }
  
  const now = new Date();
  const trialEnd = new Date(user.trialEndsAt);
  
  return now < trialEnd;
}

/**
 * Get days remaining in trial
 */
export function getTrialDaysRemaining(user: UserProfile | null): number {
  if (!user || !user.isTrial || !user.trialEndsAt) {
    return 0;
  }
  
  const now = new Date();
  const trialEnd = new Date(user.trialEndsAt);
  const diffTime = trialEnd.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
}

/**
 * Check if user has access to premium features
 * During trial, ALL features are unlocked
 * After trial, only paid plans have access
 */
export function hasPremiumAccess(user: UserProfile | null): boolean {
  if (!user) return false;
  
  // If in trial, unlock ALL features
  if (isInTrial(user)) {
    return true;
  }
  
  // After trial, only paid plans have premium access
  return user.plan === 'business' || user.plan === 'enterprise';
}

/**
 * Check if user can use a specific feature
 */
export function canUseFeature(user: UserProfile | null, feature: 'http_endpoint' | 'mass_whatsapp' | 'email_marketing' | 'advanced_automation'): boolean {
  if (!user) return false;
  
  // During trial, ALL features are available
  if (isInTrial(user)) {
    return true;
  }
  
  // After trial, check plan restrictions
  switch (feature) {
    case 'http_endpoint':
      return user.plan === 'business' || user.plan === 'enterprise';
    case 'mass_whatsapp':
      return true; // Available to all plans, but with limits
    case 'email_marketing':
      return true; // Available to all plans, but with limits
    case 'advanced_automation':
      return user.plan === 'business' || user.plan === 'enterprise';
    default:
      return false;
  }
}

/**
 * Get trial banner message
 */
export function getTrialBannerMessage(user: UserProfile | null): string | null {
  if (!user || !isInTrial(user)) {
    return null;
  }
  
  const daysRemaining = getTrialDaysRemaining(user);
  
  if (daysRemaining === 0) {
    return '⏰ Seu trial expira hoje! Aproveite todos os recursos premium.';
  } else if (daysRemaining === 1) {
    return '⏰ 1 dia restante no seu trial com todos os recursos premium!';
  } else {
    return `🎉 ${daysRemaining} dias restantes no seu trial com TODOS os recursos desbloqueados!`;
  }
}
