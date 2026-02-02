// Helper para salvar campanhas no banco via API
import { apiRequest } from './api';
import { getApiBaseUrl } from './api-client';
import { projectId, publicAnonKey } from './supabase/info';

const apiBaseUrl = getApiBaseUrl();
const legacyBaseUrl = projectId
  ? `https://${projectId}.supabase.co/functions/v1/make-server-4be966ab/campaigns`
  : '';

const useLegacy = !apiBaseUrl;

const authHeaders = {
  Authorization: `Bearer ${publicAnonKey}`,
  'Content-Type': 'application/json',
};

export interface Campaign {
  id: string;
  userId: string;
  name: string;
  type: 'whatsapp' | 'email' | 'sms';
  status: 'active' | 'completed' | 'paused' | 'scheduled';
  totalRecipients: number;
  sent: number;
  delivered: number;
  read: number;
  failed?: number;
  progress: number;
  deliveryRate: number;
  estimatedTime?: number;
  scheduledDate?: string;
  completedDate?: string;
  createdAt: string;
  updatedAt: string;
}

// ✅ Salvar campanha no banco
export async function saveCampaignToDatabase(userId: string, campaign: Campaign): Promise<boolean> {
  try {
    console.log('[CampaignsHelper] 💾 Salvando campanha no banco:', campaign.id);
    if (!useLegacy && apiBaseUrl) {
      const payload = { ...campaign, userId };
      const createdCampaign = await apiRequest('/campaigns', 'POST', payload);
      const success = Boolean(createdCampaign);
      console.log('[CampaignsHelper] ✅ Campanha salva com backend API');
      return success;
    }

    if (!legacyBaseUrl) {
      throw new Error('Nenhum endpoint configurado para salvar campanhas.');
    }

    const response = await fetch(legacyBaseUrl, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ userId, campaign }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();

    if (data.success) {
      console.log('[CampaignsHelper] ✅ Campanha salva com sucesso no banco (legacy)');
      return true;
    }

    console.error('[CampaignsHelper] ❌ Erro ao salvar (legacy):', data.error);
    return false;
  } catch (error: any) {
    console.error('[CampaignsHelper] ❌ Erro ao salvar campanha:', error);
    return false;
  }
}

// ✅ Carregar campanhas do banco
export async function loadCampaignsFromDatabase(userId: string): Promise<Campaign[]> {
  try {
    console.log('[CampaignsHelper] 📥 Carregando campanhas do banco...');

    if (!useLegacy && apiBaseUrl) {
      const query = userId ? `/campaigns?userId=${encodeURIComponent(userId)}` : '/campaigns';
      const campaigns = await apiRequest(query, 'GET');
      const list = Array.isArray(campaigns) ? campaigns : [];
      console.log('[CampaignsHelper] ✅ Campanhas carregadas via backend:', list.length);
      return list;
    }

    if (!legacyBaseUrl) {
      throw new Error('Nenhum endpoint configurado para carregar campanhas.');
    }

    const response = await fetch(`${legacyBaseUrl}/${userId}`, {
      method: 'GET',
      headers: authHeaders,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();

    if (data.success && data.campaigns) {
      console.log('[CampaignsHelper] ✅ Campanhas carregadas (legacy):', data.campaigns.length);
      return data.campaigns;
    }

    console.error('[CampaignsHelper] ❌ Erro ao carregar (legacy):', data.error);
    return [];
  } catch (error: any) {
    console.error('[CampaignsHelper] ❌ Erro ao carregar campanhas:', error);
    
    // Fallback: tentar carregar do localStorage
    try {
      const localCampaigns = localStorage.getItem('campaigns_list');
      if (localCampaigns) {
        console.log('[CampaignsHelper] 🔄 Usando fallback do localStorage');
        return JSON.parse(localCampaigns);
      }
    } catch (e) {
      console.error('[CampaignsHelper] ❌ Erro ao carregar do localStorage:', e);
    }
    
    return [];
  }
}

// ✅ Atualizar progresso da campanha
export async function updateCampaignProgress(
  userId: string,
  campaignId: string,
  updates: Partial<Campaign>
): Promise<boolean> {
  try {
    console.log('[CampaignsHelper] 🔄 Atualizando campanha:', campaignId);

    if (!useLegacy && apiBaseUrl) {
      const payload = { ...updates, userId };
      await apiRequest(`/campaigns/${campaignId}`, 'PUT', payload);
      console.log('[CampaignsHelper] ✅ Campanha atualizada via backend');
      return true;
    }

    if (!legacyBaseUrl) {
      throw new Error('Nenhum endpoint configurado para atualizar campanhas.');
    }

    const response = await fetch(`${legacyBaseUrl}/${userId}/${campaignId}`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();

    if (data.success) {
      console.log('[CampaignsHelper] ✅ Campanha atualizada com sucesso (legacy)');
      return true;
    }

    console.error('[CampaignsHelper] ❌ Erro ao atualizar (legacy):', data.error);
    return false;
  } catch (error: any) {
    console.error('[CampaignsHelper] ❌ Erro ao atualizar campanha:', error);
    return false;
  }
}

// ✅ Deletar campanha
export async function deleteCampaignFromDatabase(userId: string, campaignId: string): Promise<boolean> {
  try {
    console.log('[CampaignsHelper] 🗑️ Deletando campanha:', campaignId);

    if (!useLegacy && apiBaseUrl) {
      const query = userId ? `/campaigns/${campaignId}?userId=${encodeURIComponent(userId)}` : `/campaigns/${campaignId}`;
      await apiRequest(query, 'DELETE');
      console.log('[CampaignsHelper] ✅ Campanha deletada via backend');
      return true;
    }

    if (!legacyBaseUrl) {
      throw new Error('Nenhum endpoint configurado para deletar campanhas.');
    }

    const response = await fetch(`${legacyBaseUrl}/${userId}/${campaignId}`, {
      method: 'DELETE',
      headers: authHeaders,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();

    if (data.success) {
      console.log('[CampaignsHelper] ✅ Campanha deletada com sucesso (legacy)');
      return true;
    }

    console.error('[CampaignsHelper] ❌ Erro ao deletar (legacy):', data.error);
    return false;
  } catch (error: any) {
    console.error('[CampaignsHelper] ❌ Erro ao deletar campanha:', error);
    return false;
  }
}

// ✅ Sincronizar campanhas locais com o banco (migração)
export async function syncLocalCampaignsToDatabase(userId: string): Promise<void> {
  try {
    const localCampaigns = localStorage.getItem('campaigns_list');
    
    if (!localCampaigns) {
      console.log('[CampaignsHelper] Nenhuma campanha local para sincronizar');
      return;
    }

    const campaigns: Campaign[] = JSON.parse(localCampaigns);
    
    console.log('[CampaignsHelper] 🔄 Sincronizando', campaigns.length, 'campanhas locais para o banco...');

    for (const campaign of campaigns) {
      const enrichedCampaign = {
        ...campaign,
        userId,
        updatedAt: campaign.updatedAt || new Date().toISOString(),
        createdAt: campaign.createdAt || new Date().toISOString(),
      };

      await saveCampaignToDatabase(userId, enrichedCampaign);
    }

    console.log('[CampaignsHelper] ✅ Sincronização completa!');
  } catch (error) {
    console.error('[CampaignsHelper] ❌ Erro na sincronização:', error);
  }
}
