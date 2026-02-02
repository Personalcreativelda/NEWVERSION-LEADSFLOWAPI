import { useState, useEffect } from 'react';
import type { PlanoLimites } from '../types';

// Helper function to get user-specific localStorage key for leads
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
  return 'crm_leads_default';
}

const PLANOS_CONFIG = {
  gratuito: {
    envios_limite: 100,
    importacoes_limite: 200,
    leads_limite: 50,
  },
  basico: {
    envios_limite: 500,
    importacoes_limite: 1000,
    leads_limite: 200,
  },
  profissional: {
    envios_limite: 2000,
    importacoes_limite: 5000,
    leads_limite: 1000,
  },
  enterprise: {
    envios_limite: 999999,
    importacoes_limite: 999999,
    leads_limite: 999999,
  },
  teste: {
    envios_limite: 100,
    importacoes_limite: 200,
    leads_limite: 100,
  },
};

export function usePlanoLimites(email: string) {
  const [limites, setLimites] = useState<PlanoLimites>({
    plano: 'teste',
    envios_usados: 0,
    envios_limite: 100,
    importacoes_usadas: 0,
    importacoes_limite: 200,
    leads_usados: 0,
    leads_limite: 100,
  });

  const [diasRestantes, setDiasRestantes] = useState(7);

  // Carregar limites do localStorage ou webhook N8N
  useEffect(() => {
    const carregarLimites = async () => {
      try {
        // Tentar carregar do webhook N8N (se configurado)
        const webhookUrl = import.meta.env.VITE_N8N_PLAN_LIMITS_WEBHOOK_URL;

        if (webhookUrl) {
          try {
            const response = await fetch(webhookUrl, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
            });

            if (response.ok) {
              const data = await response.json();

              if (data.limites) {
                const planoConfig = PLANOS_CONFIG[data.plano?.nome?.toLowerCase() as keyof typeof PLANOS_CONFIG] || PLANOS_CONFIG.teste;

                setLimites({
                  plano: data.plano?.nome?.toLowerCase() || 'teste',
                  envios_usados: data.limites.mensagens?.usado || 0,
                  envios_limite: data.limites.mensagens?.maximo || planoConfig.envios_limite,
                  importacoes_usadas: data.limites.importacoes?.usado || 0,
                  importacoes_limite: data.limites.importacoes?.maximo || planoConfig.importacoes_limite,
                  leads_usados: data.limites.leads?.usado || 0,
                  leads_limite: data.limites.leads?.maximo || planoConfig.leads_limite,
                });

                if (data.plano?.dias_restantes !== undefined) {
                  setDiasRestantes(data.plano.dias_restantes);
                }

                console.log('✅ Limites carregados do webhook N8N');
                return;
              }
            }
          } catch (webhookError) {
            console.log('⚠️ Webhook N8N não disponível, usando localStorage');
          }
        }

        // Fallback: usar localStorage
        const periodoKey = `crm_periodo_teste_${email}`;
        const periodoData = localStorage.getItem(periodoKey);

        if (periodoData) {
          const periodo = JSON.parse(periodoData);
          const planoConfig = PLANOS_CONFIG[periodo.plano as keyof typeof PLANOS_CONFIG] || PLANOS_CONFIG.teste;

          // Calcular dias restantes
          const agora = new Date();
          const dataExpiracao = new Date(periodo.dataExpiracao);
          const diffTime = dataExpiracao.getTime() - agora.getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          
          setDiasRestantes(Math.max(0, diffDays));

          // Carregar uso do localStorage
          const usoData = localStorage.getItem('crm_uso_plano');
          const uso = usoData ? JSON.parse(usoData) : {
            envios_usados: 0,
            importacoes_usadas: 0,
          };

          // Contar leads do localStorage
          const leadsData = localStorage.getItem(getLeadsStorageKey());
          const leads = leadsData ? JSON.parse(leadsData) : [];

          setLimites({
            plano: periodo.plano,
            envios_usados: uso.envios_usados || 0,
            envios_limite: planoConfig.envios_limite,
            importacoes_usadas: uso.importacoes_usadas || 0,
            importacoes_limite: planoConfig.importacoes_limite,
            leads_usados: leads.length,
            leads_limite: planoConfig.leads_limite,
          });

          console.log('✅ Limites carregados do localStorage');
        } else {
          // Inicializar período de teste
          const dataCriacao = new Date();
          const dataExpiracao = new Date();
          dataExpiracao.setDate(dataExpiracao.getDate() + 7);

          const novoPeriodo = {
            email: email,
            dataCriacao: dataCriacao.toISOString(),
            dataExpiracao: dataExpiracao.toISOString(),
            plano: 'teste',
            status: 'ativo',
            diasTeste: 7,
          };

          localStorage.setItem(periodoKey, JSON.stringify(novoPeriodo));
          setDiasRestantes(7);

          console.log('✅ Novo período de teste iniciado');
        }
      } catch (error) {
        console.error('Erro ao carregar limites:', error);
      }
    };

    if (email) {
      carregarLimites();
    }
  }, [email]);

  // Incrementar uso
  const incrementarUso = (tipo: 'envios' | 'importacoes' | 'leads', quantidade = 1) => {
    const usoData = localStorage.getItem('crm_uso_plano');
    const uso = usoData ? JSON.parse(usoData) : {};

    if (tipo === 'envios') {
      uso.envios_usados = (uso.envios_usados || 0) + quantidade;
      setLimites(prev => ({
        ...prev,
        envios_usados: uso.envios_usados,
      }));
    } else if (tipo === 'importacoes') {
      uso.importacoes_usadas = (uso.importacoes_usadas || 0) + quantidade;
      setLimites(prev => ({
        ...prev,
        importacoes_usadas: uso.importacoes_usadas,
      }));
    } else if (tipo === 'leads') {
      // Leads são contados diretamente do array
      setLimites(prev => ({
        ...prev,
        leads_usados: prev.leads_usados + quantidade,
      }));
    }

    localStorage.setItem('crm_uso_plano', JSON.stringify(uso));
  };

  // Verificar se pode executar ação
  const podeExecutar = (tipo: 'envios' | 'importacoes' | 'leads'): boolean => {
    if (tipo === 'envios') {
      return limites.envios_usados < limites.envios_limite;
    } else if (tipo === 'importacoes') {
      return limites.importacoes_usadas < limites.importacoes_limite;
    } else if (tipo === 'leads') {
      return limites.leads_usados < limites.leads_limite;
    }
    return false;
  };

  return {
    limites,
    diasRestantes,
    incrementarUso,
    podeExecutar,
  };
}
