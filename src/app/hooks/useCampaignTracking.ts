// Hook para rastreamento em tempo real de campanhas WhatsApp
import { useEffect, useCallback } from 'react';

interface CampaignProgress {
  campaignId: string;
  totalRecipients: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  pending: number;
  progress: number;
  deliveryRate: number;
  readRate: number;
  status: 'active' | 'completed' | 'paused' | 'scheduled';
}

interface UseCampaignTrackingProps {
  campaigns: any[];
  onUpdateCampaign: (campaign: any) => void;
}

export function useCampaignTracking({ campaigns, onUpdateCampaign }: UseCampaignTrackingProps) {
  
  // Função para consultar progresso de uma campanha específica
  const checkCampaignProgress = useCallback(async (campaignId: string): Promise<CampaignProgress | null> => {
    try {
      // URL do webhook de progresso (você pode configurar no localStorage)
      const progressUrl = localStorage.getItem('n8n_progress_url');
      
      if (!progressUrl) {
        console.warn('[CampaignTracking] URL de progresso não configurada');
        return null;
      }

      const response = await fetch(`${progressUrl}?campaignId=${campaignId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn('[CampaignTracking] Erro ao consultar progresso:', response.status);
        return null;
      }

      const data = await response.json();
      console.log('[CampaignTracking] Progresso recebido:', data);
      
      return data;
    } catch (error) {
      console.error('[CampaignTracking] Erro ao consultar progresso:', error);
      return null;
    }
  }, []);

  // Função para atualizar campanha com dados do servidor
  const updateCampaignFromProgress = useCallback((campaign: any, progress: CampaignProgress) => {
    const updatedCampaign = {
      ...campaign,
      sent: progress.sent,
      delivered: progress.delivered,
      read: progress.read,
      progress: progress.progress,
      deliveryRate: progress.deliveryRate,
      status: progress.status,
    };

    // Se a campanha foi concluída
    if (progress.progress >= 100 || progress.sent >= progress.totalRecipients) {
      updatedCampaign.status = 'completed';
      updatedCampaign.progress = 100;
      updatedCampaign.completedDate = new Date().toISOString();
      
      console.log('[CampaignTracking] ✅ Campanha concluída:', campaign.name);
    }

    onUpdateCampaign(updatedCampaign);
  }, [onUpdateCampaign]);

  // Polling automático para campanhas ativas
  useEffect(() => {
    const activeCampaigns = campaigns.filter(c => 
      c.status === 'active' && c.progress < 100
    );

    if (activeCampaigns.length === 0) {
      return;
    }

    console.log('[CampaignTracking] 🔄 Iniciando tracking para', activeCampaigns.length, 'campanhas');

    // Intervalo de 10 segundos para consultar progresso
    const interval = setInterval(async () => {
      for (const campaign of activeCampaigns) {
        const progress = await checkCampaignProgress(campaign.id);
        
        if (progress) {
          updateCampaignFromProgress(campaign, progress);
        }
      }
    }, 10000); // 10 segundos

    return () => {
      clearInterval(interval);
      console.log('[CampaignTracking] 🛑 Tracking interrompido');
    };
  }, [campaigns, checkCampaignProgress, updateCampaignFromProgress]);

  return {
    checkCampaignProgress,
  };
}
