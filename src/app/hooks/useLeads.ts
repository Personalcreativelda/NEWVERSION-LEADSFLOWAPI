import { useState, useEffect, useCallback } from 'react';
import type { Lead, WebhookConfig } from '../types';

// Helper function to get user-specific localStorage key
function getLeadsStorageKey(): string {
  try {
    const userStr = localStorage.getItem('leadflow_user');
    if (userStr) {
      const user = JSON.parse(userStr);
      const userId = user.id || user.email || 'default';
      return `crm_leads_${userId}`;
    }
  } catch (e) {
    console.warn('Error getting user for storage key:', e);
  }
  // Fallback to default key for backward compatibility
  return 'crm_leads_default';
}

export function useLeads(webhookConfig: WebhookConfig) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carregar leads da planilha via webhook N8N
  const carregarLeads = useCallback(async () => {
    if (!webhookConfig.listar || webhookConfig.listar.trim() === '') {
      console.log('Webhook de listar não configurado. Usando dados locais.');
      const localLeads = localStorage.getItem(getLeadsStorageKey());
      if (localLeads) {
        try {
          setLeads(JSON.parse(localLeads));
        } catch (e) {
          console.error('Erro ao carregar leads do localStorage:', e);
          setLeads([]);
        }
      }
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(webhookConfig.listar);
      
      if (!response.ok) {
        throw new Error('Erro ao carregar leads: ' + response.status);
      }

      const data = await response.json();
      
      let leadsData: Lead[] = [];
      
      if (data.sucesso && data.leads) {
        leadsData = data.leads;
      } else if (Array.isArray(data)) {
        leadsData = data;
      }

      setLeads(leadsData);

      // Salvar no localStorage como backup
      localStorage.setItem(getLeadsStorageKey(), JSON.stringify(leadsData));

      console.log('Leads carregados:', leadsData.length);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(errorMessage);
      console.error('Erro ao carregar leads:', err);

      // Tentar carregar do localStorage em caso de erro
      const localLeads = localStorage.getItem(getLeadsStorageKey());
      if (localLeads) {
        try {
          setLeads(JSON.parse(localLeads));
        } catch (e) {
          setLeads([]);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [webhookConfig.listar]);

  // Adicionar novo lead
  const adicionarLead = async (lead: Lead): Promise<boolean> => {
    if (!webhookConfig.cadastrar) {
      alert('⚠️ Webhook de cadastro não configurado!');
      return false;
    }

    try {
      const response = await fetch(webhookConfig.cadastrar, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead),
      });

      if (!response.ok) {
        throw new Error('Erro ao cadastrar lead');
      }

      await response.json();
      
      // Recarregar leads
      await carregarLeads();
      
      return true;
    } catch (err) {
      console.error('Erro ao adicionar lead:', err);
      alert('Erro ao adicionar lead. Verifique a configuração do webhook.');
      return false;
    }
  };

  // Editar lead
  const editarLead = async (telefoneOriginal: string, leadAtualizado: Lead): Promise<boolean> => {
    if (!webhookConfig.editar) {
      alert('⚠️ Webhook de edição não configurado!');
      return false;
    }

    try {
      const response = await fetch(webhookConfig.editar, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefone: telefoneOriginal,
          ...leadAtualizado,
        }),
      });

      if (!response.ok) {
        throw new Error('Erro ao editar lead');
      }

      await response.json();
      
      // Recarregar leads
      await carregarLeads();
      
      return true;
    } catch (err) {
      console.error('Erro ao editar lead:', err);
      alert('Erro ao editar lead. Verifique a configuração do webhook.');
      return false;
    }
  };

  // Deletar lead
  const deletarLead = async (lead: Lead): Promise<boolean> => {
    if (!webhookConfig.deletar) {
      alert('⚠️ Webhook de exclusão não configurado!');
      return false;
    }

    if (!confirm(`⚠️ Tem certeza que deseja excluir o lead "${lead.nome}"?`)) {
      return false;
    }

    try {
      const response = await fetch(webhookConfig.deletar, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefone: lead.telefone,
          nome: lead.nome,
        }),
      });

      if (!response.ok) {
        throw new Error('Erro ao deletar lead');
      }

      await response.json();
      
      // Recarregar leads
      await carregarLeads();
      
      return true;
    } catch (err) {
      console.error('Erro ao deletar lead:', err);
      alert('Erro ao deletar lead. Verifique a configuração do webhook.');
      return false;
    }
  };

  // Carregar leads ao montar o componente
  useEffect(() => {
    carregarLeads();
  }, [carregarLeads]);

  return {
    leads,
    loading,
    error,
    carregarLeads,
    adicionarLead,
    editarLead,
    deletarLead,
  };
}
