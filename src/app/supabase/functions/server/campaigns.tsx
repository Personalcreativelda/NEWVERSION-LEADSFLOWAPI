// Campaigns Management - Gerenciamento de Campanhas no Banco
import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';

const app = new Hono();

// ✅ Interface da Campanha
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
  message?: string;
  recipientMode?: string;
  attachmentsCount?: number;
}

// ✅ CRIAR OU ATUALIZAR CAMPANHA
app.post('/campaigns', async (c) => {
  try {
    const body = await c.req.json();
    const { userId, campaign } = body;

    if (!userId) {
      return c.json({ error: 'userId é obrigatório' }, 400);
    }

    if (!campaign || !campaign.id) {
      return c.json({ error: 'Dados da campanha inválidos' }, 400);
    }

    console.log('[Campaigns] 💾 Salvando campanha:', campaign.id, 'para usuário:', userId);

    // Adicionar timestamps
    const now = new Date().toISOString();
    const campaignData: Campaign = {
      ...campaign,
      userId,
      updatedAt: now,
      createdAt: campaign.createdAt || now,
    };

    // Salvar no KV Store com chave única por usuário
    const key = `campaign:${userId}:${campaign.id}`;
    await kv.set(key, campaignData);

    console.log('[Campaigns] ✅ Campanha salva com sucesso:', key);

    return c.json({ 
      success: true, 
      campaign: campaignData 
    });
  } catch (error) {
    console.error('[Campaigns] ❌ Erro ao salvar campanha:', error);
    return c.json({ 
      error: 'Erro ao salvar campanha',
      details: error.message 
    }, 500);
  }
});

// ✅ LISTAR CAMPANHAS DO USUÁRIO
app.get('/campaigns/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');

    if (!userId) {
      return c.json({ error: 'userId é obrigatório' }, 400);
    }

    console.log('[Campaigns] 📋 Buscando campanhas do usuário:', userId);

    // Buscar todas as campanhas do usuário
    const prefix = `campaign:${userId}:`;
    const campaigns = await kv.getByPrefix(prefix);

    console.log('[Campaigns] ✅ Encontradas', campaigns.length, 'campanhas');

    // Ordenar por data de criação (mais recentes primeiro)
    const sortedCampaigns = campaigns.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    return c.json({ 
      success: true, 
      campaigns: sortedCampaigns,
      total: sortedCampaigns.length
    });
  } catch (error) {
    console.error('[Campaigns] ❌ Erro ao buscar campanhas:', error);
    return c.json({ 
      error: 'Erro ao buscar campanhas',
      details: error.message 
    }, 500);
  }
});

// ✅ ATUALIZAR PROGRESSO DA CAMPANHA
app.patch('/campaigns/:userId/:campaignId', async (c) => {
  try {
    const userId = c.req.param('userId');
    const campaignId = c.req.param('campaignId');
    const updates = await c.req.json();

    if (!userId || !campaignId) {
      return c.json({ error: 'userId e campaignId são obrigatórios' }, 400);
    }

    console.log('[Campaigns] 🔄 Atualizando campanha:', campaignId, 'para usuário:', userId);

    const key = `campaign:${userId}:${campaignId}`;
    const existing = await kv.get(key);

    if (!existing) {
      return c.json({ error: 'Campanha não encontrada' }, 404);
    }

    // Mesclar atualizações
    const updated: Campaign = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    // Se progress >= 100, marcar como concluída
    if (updated.progress >= 100 && updated.status === 'active') {
      updated.status = 'completed';
      updated.completedDate = updated.completedDate || new Date().toISOString();
    }

    await kv.set(key, updated);

    console.log('[Campaigns] ✅ Campanha atualizada com sucesso');

    return c.json({ 
      success: true, 
      campaign: updated 
    });
  } catch (error) {
    console.error('[Campaigns] ❌ Erro ao atualizar campanha:', error);
    return c.json({ 
      error: 'Erro ao atualizar campanha',
      details: error.message 
    }, 500);
  }
});

// ✅ DELETAR CAMPANHA
app.delete('/campaigns/:userId/:campaignId', async (c) => {
  try {
    const userId = c.req.param('userId');
    const campaignId = c.req.param('campaignId');

    if (!userId || !campaignId) {
      return c.json({ error: 'userId e campaignId são obrigatórios' }, 400);
    }

    console.log('[Campaigns] 🗑️ Deletando campanha:', campaignId, 'do usuário:', userId);

    const key = `campaign:${userId}:${campaignId}`;
    await kv.del(key);

    console.log('[Campaigns] ✅ Campanha deletada com sucesso');

    return c.json({ 
      success: true, 
      message: 'Campanha deletada com sucesso' 
    });
  } catch (error) {
    console.error('[Campaigns] ❌ Erro ao deletar campanha:', error);
    return c.json({ 
      error: 'Erro ao deletar campanha',
      details: error.message 
    }, 500);
  }
});

// ✅ OBTER ESTATÍSTICAS DAS CAMPANHAS
app.get('/campaigns/:userId/stats', async (c) => {
  try {
    const userId = c.req.param('userId');

    if (!userId) {
      return c.json({ error: 'userId é obrigatório' }, 400);
    }

    console.log('[Campaigns] 📊 Calculando estatísticas do usuário:', userId);

    const prefix = `campaign:${userId}:`;
    const campaigns = await kv.getByPrefix(prefix);

    const stats = {
      total: campaigns.length,
      active: campaigns.filter(c => c.status === 'active').length,
      completed: campaigns.filter(c => c.status === 'completed').length,
      scheduled: campaigns.filter(c => c.status === 'scheduled').length,
      paused: campaigns.filter(c => c.status === 'paused').length,
      totalSent: campaigns.reduce((sum, c) => sum + (c.sent || 0), 0),
      totalDelivered: campaigns.reduce((sum, c) => sum + (c.delivered || 0), 0),
      totalRead: campaigns.reduce((sum, c) => sum + (c.read || 0), 0),
      avgDeliveryRate: campaigns.length > 0 
        ? Math.floor(campaigns.reduce((sum, c) => sum + (c.deliveryRate || 0), 0) / campaigns.length)
        : 0,
    };

    console.log('[Campaigns] ✅ Estatísticas calculadas:', stats);

    return c.json({ 
      success: true, 
      stats 
    });
  } catch (error) {
    console.error('[Campaigns] ❌ Erro ao calcular estatísticas:', error);
    return c.json({ 
      error: 'Erro ao calcular estatísticas',
      details: error.message 
    }, 500);
  }
});

export default app;
