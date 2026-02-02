// Hook para gerenciar campanhas com Supabase
import { useState, useEffect, useCallback } from 'react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface Campaign {
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

export function useCampaigns(userId: string | null) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-4be966ab/campaigns`;

  // ✅ CARREGAR CAMPANHAS DO BANCO
  const loadCampaigns = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      console.log('[useCampaigns] 📥 Carregando campanhas do banco...');
      setLoading(true);
      setError(null);

      const response = await fetch(`${baseUrl}/${userId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      
      if (data.success && data.campaigns) {
        console.log('[useCampaigns] ✅ Campanhas carregadas:', data.campaigns.length);
        setCampaigns(data.campaigns);
      } else {
        throw new Error(data.error || 'Erro ao carregar campanhas');
      }
    } catch (err: any) {
      console.error('[useCampaigns] ❌ Erro ao carregar campanhas:', err);
      setError(err.message);
      
      // Fallback: tentar carregar do localStorage
      const localCampaigns = localStorage.getItem('campaigns_list');
      if (localCampaigns) {
        console.log('[useCampaigns] 🔄 Usando fallback do localStorage');
        setCampaigns(JSON.parse(localCampaigns));
      }
    } finally {
      setLoading(false);
    }
  }, [userId, baseUrl]);

  // ✅ SALVAR CAMPANHA NO BANCO
  const saveCampaign = useCallback(async (campaign: Campaign) => {
    if (!userId) return false;

    try {
      console.log('[useCampaigns] 💾 Salvando campanha:', campaign.id);

      const response = await fetch(`${baseUrl}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
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
        console.log('[useCampaigns] ✅ Campanha salva com sucesso');
        
        // Atualizar lista local
        setCampaigns(prev => {
          const index = prev.findIndex(c => c.id === campaign.id);
          if (index >= 0) {
            // Atualizar existente
            const updated = [...prev];
            updated[index] = data.campaign;
            return updated;
          } else {
            // Adicionar nova
            return [data.campaign, ...prev];
          }
        });
        
        return true;
      } else {
        throw new Error(data.error || 'Erro ao salvar campanha');
      }
    } catch (err: any) {
      console.error('[useCampaigns] ❌ Erro ao salvar campanha:', err);
      setError(err.message);
      return false;
    }
  }, [userId, baseUrl]);

  // ✅ ATUALIZAR CAMPANHA (PROGRESSO)
  const updateCampaign = useCallback(async (campaignId: string, updates: Partial<Campaign>) => {
    if (!userId) return false;

    try {
      console.log('[useCampaigns] 🔄 Atualizando campanha:', campaignId);

      const response = await fetch(`${baseUrl}/${userId}/${campaignId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      
      if (data.success) {
        console.log('[useCampaigns] ✅ Campanha atualizada com sucesso');
        
        // Atualizar lista local
        setCampaigns(prev => 
          prev.map(c => c.id === campaignId ? data.campaign : c)
        );
        
        return true;
      } else {
        throw new Error(data.error || 'Erro ao atualizar campanha');
      }
    } catch (err: any) {
      console.error('[useCampaigns] ❌ Erro ao atualizar campanha:', err);
      setError(err.message);
      return false;
    }
  }, [userId, baseUrl]);

  // ✅ DELETAR CAMPANHA
  const deleteCampaign = useCallback(async (campaignId: string) => {
    if (!userId) return false;

    try {
      console.log('[useCampaigns] 🗑️ Deletando campanha:', campaignId);

      const response = await fetch(`${baseUrl}/${userId}/${campaignId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${publicAnonKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      
      if (data.success) {
        console.log('[useCampaigns] ✅ Campanha deletada com sucesso');
        
        // Remover da lista local
        setCampaigns(prev => prev.filter(c => c.id !== campaignId));
        
        return true;
      } else {
        throw new Error(data.error || 'Erro ao deletar campanha');
      }
    } catch (err: any) {
      console.error('[useCampaigns] ❌ Erro ao deletar campanha:', err);
      setError(err.message);
      return false;
    }
  }, [userId, baseUrl]);

  // ✅ CARREGAR CAMPANHAS AO MONTAR
  useEffect(() => {
    loadCampaigns();
  }, [loadCampaigns]);

  return {
    campaigns,
    loading,
    error,
    saveCampaign,
    updateCampaign,
    deleteCampaign,
    reloadCampaigns: loadCampaigns,
  };
}
