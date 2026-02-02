import { useMemo } from 'react';

interface UserProfile {
  id: string;
  email: string;
  name: string;
  plan: 'free' | 'business' | 'enterprise';
  limits: {
    leads: number;
    messages: number;
    massMessages?: number;
    campaigns?: number;
  };
  usage: {
    leads: number;
    messages: number;
    massMessages?: number;
    campaigns?: number;
  };
  subscriptionEndsAt?: string | null;
  isTrial?: boolean;
  trialEndsAt?: string | null;
}

interface PlanValidation {
  // Verificações de limites
  canAddLead: boolean;
  canSendMessage: boolean;
  canImportLeads: boolean;
  canExportLeads: boolean;
  canEditLead: boolean;
  
  // Verificações de plano
  isPlanActive: boolean;
  isPlanExpired: boolean;
  daysUntilExpiration: number | null;
  
  // Verificações de recursos premium
  hasPremiumAccess: boolean; // True durante trial ou planos pagos
  isTrialActive: boolean; // True se trial ainda ativo
  isTrialExpired: boolean; // True se trial expirou
  
  // TODAS as funcionalidades estão disponíveis em TODOS os planos
  // A diferença entre os planos está apenas nos LIMITES de uso
  hasImportFeature: boolean; // Disponível para todos os planos
  hasExportFeature: boolean; // Disponível para todos os planos
  hasWhatsAppFeature: boolean; // Disponível para trial e planos pagos
  hasCampaignsFeature: boolean; // Disponível para trial e planos pagos
  hasMassWhatsAppN8N: boolean; // Disponível APENAS para Enterprise (envio em massa via N8N)
  
  // Limites restantes
  remainingLeads: number;
  remainingMessages: number;
  
  // Percentual de uso
  leadsUsagePercent: number;
  messagesUsagePercent: number;
  
  // Mensagens
  getExpirationWarning: () => string | null;
  getLimitWarning: (type: 'leads' | 'messages') => string | null;
}

export function usePlanValidation(user: UserProfile | null): PlanValidation {
  return useMemo(() => {
    if (!user) {
      return {
        canAddLead: false,
        canSendMessage: false,
        canImportLeads: false,
        canExportLeads: false,
        canEditLead: false,
        isPlanActive: false,
        isPlanExpired: true,
        daysUntilExpiration: null,
        hasPremiumAccess: false,
        isTrialActive: false,
        isTrialExpired: false,
        hasImportFeature: false,
        hasExportFeature: false,
        hasWhatsAppFeature: false,
        hasCampaignsFeature: false,
        hasMassWhatsAppN8N: false,
        remainingLeads: 0,
        remainingMessages: 0,
        leadsUsagePercent: 0,
        messagesUsagePercent: 0,
        getExpirationWarning: () => null,
        getLimitWarning: () => null,
      };
    }

    const now = new Date();
    let expirationDate: Date | null = null;
    let isPlanExpired = false;
    let daysUntilExpiration: number | null = null;

    // Verificar se está em trial
    let isTrialActive = false;
    let isTrialExpired = false;
    
    if (user.isTrial && user.trialEndsAt) {
      const trialEndDate = new Date(user.trialEndsAt);
      isTrialActive = trialEndDate > now;
      isTrialExpired = trialEndDate <= now;
      
      if (isTrialActive) {
        const timeDiff = trialEndDate.getTime() - now.getTime();
        daysUntilExpiration = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
      }
    }

    // Verificar data de expiração da assinatura
    if (user.subscriptionEndsAt) {
      expirationDate = new Date(user.subscriptionEndsAt);
      isPlanExpired = expirationDate < now;
      
      if (!isPlanExpired && !isTrialActive) {
        const timeDiff = expirationDate.getTime() - now.getTime();
        daysUntilExpiration = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
      }
    }

    // Plano está ativo se não estiver expirado
    const isPlanActive = !isPlanExpired;

    // Recursos premium disponíveis durante trial ou planos pagos
    const hasPremiumAccess = isTrialActive || user.plan === 'business' || user.plan === 'enterprise';

    // Funcionalidades baseadas em acesso premium
    const hasImportFeature = hasPremiumAccess; // Disponível apenas com premium
    const hasExportFeature = hasPremiumAccess; // Disponível apenas com premium
    const hasWhatsAppFeature = hasPremiumAccess; // Disponível apenas com premium
    const hasCampaignsFeature = hasPremiumAccess; // Disponível apenas com premium
    const hasMassWhatsAppN8N = user.plan === 'enterprise'; // Disponível APENAS para Enterprise

    // Calcular limites restantes
    const leadsLimit = user.limits?.leads || 0;
    const messagesLimit = user.limits?.messages || 0;
    const leadsUsed = user.usage?.leads || 0;
    const messagesUsed = user.usage?.messages || 0;

    // Para planos ilimitados, retornar -1 significa ilimitado
    const isUnlimitedLeads = leadsLimit === -1;
    const isUnlimitedMessages = messagesLimit === -1;

    const remainingLeads = isUnlimitedLeads ? -1 : Math.max(0, leadsLimit - leadsUsed);
    const remainingMessages = isUnlimitedMessages ? -1 : Math.max(0, messagesLimit - messagesUsed);

    // Calcular percentual de uso
    const leadsUsagePercent = isUnlimitedLeads ? 0 : leadsLimit > 0 ? (leadsUsed / leadsLimit) * 100 : 0;
    const messagesUsagePercent = isUnlimitedMessages ? 0 : messagesLimit > 0 ? (messagesUsed / messagesLimit) * 100 : 0;

    // Verificações de permissões
    // IMPORTANTE: Adicionar e importar leads está disponível para TODOS os planos, apenas respeitando limites
    const canAddLead = isPlanActive && (isUnlimitedLeads || remainingLeads > 0);
    const canSendMessage = isPlanActive && (isUnlimitedMessages || remainingMessages > 0);
    const canImportLeads = isPlanActive && (isUnlimitedLeads || remainingLeads > 0);
    const canExportLeads = isPlanActive && hasPremiumAccess;
    const canEditLead = isPlanActive; // Sempre disponível se plano ativo

    // Função para obter aviso de expiração
    const getExpirationWarning = (): string | null => {
      if (!isPlanActive) {
        return '⚠️ Seu plano expirou. Renove agora para continuar usando todas as funcionalidades.';
      }

      if (daysUntilExpiration !== null) {
        if (daysUntilExpiration <= 3) {
          return `⏰ Seu plano expira em ${daysUntilExpiration} ${daysUntilExpiration === 1 ? 'dia' : 'dias'}. Renove agora para não perder o acesso!`;
        } else if (daysUntilExpiration <= 7) {
          return `📅 Seu plano expira em ${daysUntilExpiration} dias. Considere renovar em breve.`;
        }
      }

      return null;
    };

    // Função para obter aviso de limite
    const getLimitWarning = (type: 'leads' | 'messages'): string | null => {
      if (!isPlanActive) {
        return 'Plano expirado. Renove para continuar.';
      }

      if (type === 'leads') {
        if (isUnlimitedLeads) return null;
        
        if (remainingLeads === 0) {
          return '❌ Limite de leads atingido. Faça upgrade para adicionar mais leads.';
        } else if (leadsUsagePercent >= 90) {
          return `⚠️ Você usou ${Math.round(leadsUsagePercent)}% do limite de leads. Considere fazer upgrade.`;
        } else if (leadsUsagePercent >= 75) {
          return `📊 Você usou ${Math.round(leadsUsagePercent)}% do limite de leads.`;
        }
      } else if (type === 'messages') {
        if (isUnlimitedMessages) return null;
        
        if (remainingMessages === 0) {
          return '❌ Limite de mensagens atingido. Faça upgrade para enviar mais mensagens.';
        } else if (messagesUsagePercent >= 90) {
          return `⚠️ Você usou ${Math.round(messagesUsagePercent)}% do limite de mensagens. Considere fazer upgrade.`;
        } else if (messagesUsagePercent >= 75) {
          return `📊 Você usou ${Math.round(messagesUsagePercent)}% do limite de mensagens.`;
        }
      }

      return null;
    };

    return {
      canAddLead,
      canSendMessage,
      canImportLeads,
      canExportLeads,
      canEditLead,
      isPlanActive,
      isPlanExpired,
      daysUntilExpiration,
      hasPremiumAccess,
      isTrialActive,
      isTrialExpired,
      hasImportFeature,
      hasExportFeature,
      hasWhatsAppFeature,
      hasCampaignsFeature,
      hasMassWhatsAppN8N,
      remainingLeads,
      remainingMessages,
      leadsUsagePercent,
      messagesUsagePercent,
      getExpirationWarning,
      getLimitWarning,
    };
  }, [user]);
}
