// Helper para Campanhas V2 - Com envio assíncrono e status em tempo real
import { getApiBaseUrl } from './api-client';
import { projectId, publicAnonKey } from './supabase/info';

const apiBaseUrl = getApiBaseUrl();
const apiHost = apiBaseUrl ? apiBaseUrl.replace(/\/api$/, '') : '';
const legacyBase = projectId
  ? `https://${projectId}.supabase.co/functions/v1/make-server-4be966ab`
  : '';
const resolvedBase = (apiHost ? `${apiHost}/api` : `${legacyBase}/api`).replace(/\/$/, '');

const defaultHeaders = {
  Authorization: `Bearer ${publicAnonKey}`,
  'Content-Type': 'application/json',
};

export interface Recipient {
  phone: string;
  name: string;
  status?: 'pending' | 'sending' | 'sent' | 'error';
  errorMessage?: string;
  sentAt?: string;
}

export interface Attachment {
  name: string;
  type: string;
  size: number;
  base64?: string;
  url?: string;
  caption?: string;
}

export interface CampaignV2 {
  id: string;
  userId: string;
  name: string;
  message: string;
  instanceName?: string;
  status: 'draft' | 'sending' | 'completed' | 'failed' | 'cancelled';
  totalRecipients: number;
  sentCount: number;
  errorCount: number;
  scheduledAt?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  recipients: Recipient[];
  attachments?: Attachment[];
  type: 'whatsapp' | 'email' | 'sms';
  recipientMode?: string;
}

// ✅ 1. CRIAR/SALVAR CAMPANHA (DRAFT)
export async function saveCampaignV2(userId: string, campaign: Partial<CampaignV2>): Promise<CampaignV2 | null> {
  try {
    console.log('[CampaignsV2Helper] 💾 Salvando campanha:', campaign.name);

    if (!resolvedBase) {
      console.error('[CampaignsV2Helper] ❌ Nenhuma URL configurada para campanhas V2');
      return null;
    }

    const response = await fetch(`${resolvedBase}/campaigns`, {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify({
        userId,
        campaign,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    
    if (data.success) {
      console.log('[CampaignsV2Helper] ✅ Campanha salva:', data.campaign.id);
      return data.campaign;
    } else {
      throw new Error(data.error || 'Erro ao salvar campanha');
    }
  } catch (error: any) {
    console.error('[CampaignsV2Helper] ❌ Erro ao salvar campanha:', error);
    return null;
  }
}

// ✅ 2. INICIAR ENVIO DA CAMPANHA
export async function startCampaignSending(userId: string, campaignId: string): Promise<boolean> {
  try {
    console.log('[CampaignsV2Helper] 🚀 Iniciando envio:', campaignId);

    if (!resolvedBase) {
      console.error('[CampaignsV2Helper] ❌ Nenhuma URL configurada para campanhas V2');
      return false;
    }

    const response = await fetch(`${resolvedBase}/campaigns/${campaignId}/send`, {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    
    if (data.success) {
      console.log('[CampaignsV2Helper] ✅ Envio iniciado:', campaignId);
      return true;
    } else {
      throw new Error(data.error || 'Erro ao iniciar envio');
    }
  } catch (error: any) {
    console.error('[CampaignsV2Helper] ❌ Erro ao iniciar envio:', error);
    return false;
  }
}

// ✅ 3. OBTER STATUS DA CAMPANHA
export async function getCampaignStatus(userId: string, campaignId: string): Promise<any | null> {
  try {
    if (!resolvedBase) {
      console.error('[CampaignsV2Helper] ❌ Nenhuma URL configurada para campanhas V2');
      return null;
    }

    const response = await fetch(`${resolvedBase}/campaigns/${campaignId}/status?userId=${userId}`, {
      method: 'GET',
      headers: defaultHeaders,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    
    if (data.success) {
      return data;
    } else {
      throw new Error(data.error || 'Erro ao obter status');
    }
  } catch (error: any) {
    console.error('[CampaignsV2Helper] ❌ Erro ao obter status:', error);
    return null;
  }
}

// ✅ 4. LISTAR CAMPANHAS
export async function listCampaigns(userId: string, status: string = 'all'): Promise<CampaignV2[]> {
  try {
    console.log('[CampaignsV2Helper] 📋 Listando campanhas...');

    if (!resolvedBase) {
      console.error('[CampaignsV2Helper] ❌ Nenhuma URL configurada para campanhas V2');
      return [];
    }

    const response = await fetch(`${resolvedBase}/campaigns?userId=${userId}&status=${status}`, {
      method: 'GET',
      headers: defaultHeaders,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    
    if (data.success) {
      console.log('[CampaignsV2Helper] ✅ Campanhas carregadas:', data.campaigns.length);
      return data.campaigns;
    } else {
      throw new Error(data.error || 'Erro ao listar campanhas');
    }
  } catch (error: any) {
    console.error('[CampaignsV2Helper] ❌ Erro ao listar campanhas:', error);
    return [];
  }
}

// ✅ 5. CANCELAR CAMPANHA
export async function cancelCampaign(userId: string, campaignId: string): Promise<boolean> {
  try {
    console.log('[CampaignsV2Helper] 🛑 Cancelando campanha:', campaignId);

    if (!resolvedBase) {
      console.error('[CampaignsV2Helper] ❌ Nenhuma URL configurada para campanhas V2');
      return false;
    }

    const response = await fetch(`${resolvedBase}/campaigns/${campaignId}/cancel`, {
      method: 'POST',
      headers: defaultHeaders,
      body: JSON.stringify({ userId }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    
    if (data.success) {
      console.log('[CampaignsV2Helper] ✅ Campanha cancelada');
      return true;
    } else {
      throw new Error(data.error || 'Erro ao cancelar campanha');
    }
  } catch (error: any) {
    console.error('[CampaignsV2Helper] ❌ Erro ao cancelar campanha:', error);
    return false;
  }
}

// ✅ 6. DELETAR CAMPANHA
export async function deleteCampaign(userId: string, campaignId: string): Promise<boolean> {
  try {
    console.log('[CampaignsV2Helper] 🗑️ Deletando campanha:', campaignId);

    if (!resolvedBase) {
      console.error('[CampaignsV2Helper] ❌ Nenhuma URL configurada para campanhas V2');
      return false;
    }

    const response = await fetch(`${resolvedBase}/campaigns/${campaignId}?userId=${userId}`, {
      method: 'DELETE',
      headers: defaultHeaders,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    
    if (data.success) {
      console.log('[CampaignsV2Helper] ✅ Campanha deletada');
      return true;
    } else {
      throw new Error(data.error || 'Erro ao deletar campanha');
    }
  } catch (error: any) {
    console.error('[CampaignsV2Helper] ❌ Erro ao deletar campanha:', error);
    return false;
  }
}
