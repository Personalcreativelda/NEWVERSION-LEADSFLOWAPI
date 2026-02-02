// Hook para monitorar status de campanha em tempo real (com polling)
import { useState, useEffect, useCallback } from 'react';
import { projectId, publicAnonKey } from '../utils/supabase/info';

interface Recipient {
  phone: string;
  name: string;
  status: 'pending' | 'sending' | 'sent' | 'error';
  errorMessage?: string;
  sentAt?: string;
}

interface CampaignStatus {
  status: 'draft' | 'sending' | 'completed' | 'failed' | 'cancelled';
  totalRecipients: number;
  sentCount: number;
  errorCount: number;
  percentage: number;
  recipients: Recipient[];
  updatedAt: string;
  completedAt?: string;
}

export function useCampaignStatus(campaignId: string | null, userId: string | null) {
  const [status, setStatus] = useState<CampaignStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-4be966ab/api`;

  // ✅ Função para buscar status
  const fetchStatus = useCallback(async () => {
    if (!campaignId || !userId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${baseUrl}/campaigns/${campaignId}/status?userId=${userId}`, {
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
      
      if (data.success) {
        setStatus(data);
      } else {
        throw new Error(data.error || 'Erro ao buscar status');
      }
    } catch (err: any) {
      console.error('[useCampaignStatus] ❌ Erro ao buscar status:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [campaignId, userId, baseUrl]);

  // ✅ Polling automático (atualizar a cada 2 segundos enquanto estiver enviando)
  useEffect(() => {
    if (!campaignId || !userId) return;

    // Buscar imediatamente
    fetchStatus();

    // Configurar polling apenas se a campanha estiver enviando
    if (status?.status === 'sending') {
      const interval = setInterval(() => {
        fetchStatus();
      }, 2000); // Atualizar a cada 2 segundos

      return () => clearInterval(interval);
    }
  }, [campaignId, userId, status?.status, fetchStatus]);

  return {
    status,
    loading,
    error,
    refetch: fetchStatus,
  };
}
