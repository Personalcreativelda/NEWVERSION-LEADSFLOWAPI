// Campaigns V2 - Sistema Completo com Envio Assíncrono e Status em Tempo Real
import { Hono } from 'npm:hono';
import * as kv from './kv_store.tsx';

const app = new Hono();

// ✅ Interfaces
interface Recipient {
  phone: string;
  name: string;
  status: 'pending' | 'sending' | 'sent' | 'error';
  errorMessage?: string;
  sentAt?: string;
}

interface Attachment {
  name: string;
  type: string;
  size: number;
  base64?: string;
  url?: string;
  caption?: string;
}

interface Campaign {
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

// ============================================
// 1. CRIAR/SALVAR CAMPANHA (DRAFT)
// ============================================
app.post('/campaigns', async (c) => {
  try {
    const body = await c.req.json();
    const { userId, campaign } = body;

    if (!userId || !campaign) {
      return c.json({ error: 'userId e campaign são obrigatórios' }, 400);
    }

    console.log('[Campaigns V2] 💾 Criando campanha:', campaign.name);

    const now = new Date().toISOString();
    const campaignData: Campaign = {
      ...campaign,
      userId,
      status: campaign.status || 'draft',
      sentCount: 0,
      errorCount: 0,
      createdAt: campaign.createdAt || now,
      updatedAt: now,
      recipients: campaign.recipients || [],
    };

    // Salvar campanha principal
    const campaignKey = `campaign_v2:${userId}:${campaign.id}`;
    await kv.set(campaignKey, campaignData);

    // Salvar índice por status para queries rápidas
    const statusKey = `campaign_status:${userId}:${campaignData.status}:${campaign.id}`;
    await kv.set(statusKey, { campaignId: campaign.id, updatedAt: now });

    console.log('[Campaigns V2] ✅ Campanha criada:', campaign.id);

    return c.json({
      success: true,
      campaign: campaignData,
    });
  } catch (error: any) {
    console.error('[Campaigns V2] ❌ Erro ao criar campanha:', error);
    return c.json({
      error: 'Erro ao criar campanha',
      details: error.message,
    }, 500);
  }
});

// ============================================
// 2. INICIAR ENVIO DA CAMPANHA
// ============================================
app.post('/campaigns/:id/send', async (c) => {
  try {
    const campaignId = c.req.param('id');
    const { userId } = await c.req.json();

    if (!userId) {
      return c.json({ error: 'userId é obrigatório' }, 400);
    }

    console.log('[Campaigns V2] 🚀 Iniciando envio da campanha:', campaignId);

    const campaignKey = `campaign_v2:${userId}:${campaignId}`;
    const campaign: Campaign = await kv.get(campaignKey);

    if (!campaign) {
      return c.json({ error: 'Campanha não encontrada' }, 404);
    }

    // Atualizar status para 'sending'
    campaign.status = 'sending';
    campaign.updatedAt = new Date().toISOString();
    campaign.sentCount = 0;
    campaign.errorCount = 0;

    // Resetar status de todos os recipients
    campaign.recipients = campaign.recipients.map(r => ({
      ...r,
      status: 'pending',
      errorMessage: undefined,
      sentAt: undefined,
    }));

    await kv.set(campaignKey, campaign);

    // Atualizar índice de status
    await kv.del(`campaign_status:${userId}:draft:${campaignId}`);
    const statusKey = `campaign_status:${userId}:sending:${campaignId}`;
    await kv.set(statusKey, { campaignId, updatedAt: campaign.updatedAt });

    console.log('[Campaigns V2] ✅ Campanha iniciada:', campaignId);

    // ✅ INICIAR ENVIO ASSÍNCRONO (não esperar)
    processWhatsAppSending(userId, campaignId, campaign).catch(err => {
      console.error('[Campaigns V2] ❌ Erro no processamento assíncrono:', err);
    });

    return c.json({
      success: true,
      status: 'sending',
      campaignId,
      totalRecipients: campaign.totalRecipients,
    });
  } catch (error: any) {
    console.error('[Campaigns V2] ❌ Erro ao iniciar envio:', error);
    return c.json({
      error: 'Erro ao iniciar envio',
      details: error.message,
    }, 500);
  }
});

// ============================================
// 3. PROCESSAR ENVIO WHATSAPP (ASSÍNCRONO)
// ============================================
async function processWhatsAppSending(userId: string, campaignId: string, campaign: Campaign) {
  console.log('[Campaigns V2] 📤 Processando envio assíncrono:', campaignId);

  const campaignKey = `campaign_v2:${userId}:${campaignId}`;
  const n8nWebhookUrl = Deno.env.get('N8N_WEBHOOK_URL');

  if (!n8nWebhookUrl) {
    console.error('[Campaigns V2] ❌ N8N_WEBHOOK_URL não configurado');
    campaign.status = 'failed';
    campaign.errorCount = campaign.recipients.length;
    await kv.set(campaignKey, campaign);
    return;
  }

  let sentCount = 0;
  let errorCount = 0;

  // Enviar para cada recipient
  for (let i = 0; i < campaign.recipients.length; i++) {
    const recipient = campaign.recipients[i];

    try {
      // Atualizar status para 'sending'
      campaign.recipients[i].status = 'sending';
      campaign.updatedAt = new Date().toISOString();
      await kv.set(campaignKey, campaign);

      console.log(`[Campaigns V2] 📱 Enviando para ${recipient.phone} (${i + 1}/${campaign.recipients.length})`);

      // ✅ ENVIAR VIA N8N/Evolution API
      const response = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: campaign.instanceName,
          phone: recipient.phone,
          message: campaign.message,
          attachments: campaign.attachments || [],
          campaignId: campaign.id,
          recipientName: recipient.name,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      // Sucesso
      campaign.recipients[i].status = 'sent';
      campaign.recipients[i].sentAt = new Date().toISOString();
      sentCount++;
      console.log(`[Campaigns V2] ✅ Enviado para ${recipient.phone}`);
    } catch (error: any) {
      // Erro
      campaign.recipients[i].status = 'error';
      campaign.recipients[i].errorMessage = error.message;
      errorCount++;
      console.error(`[Campaigns V2] ❌ Erro ao enviar para ${recipient.phone}:`, error.message);
    }

    // Atualizar contadores
    campaign.sentCount = sentCount;
    campaign.errorCount = errorCount;
    campaign.updatedAt = new Date().toISOString();
    await kv.set(campaignKey, campaign);

    // Delay entre envios (1 segundo)
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Finalizar campanha
  const now = new Date().toISOString();
  campaign.status = errorCount === campaign.recipients.length ? 'failed' : 'completed';
  campaign.completedAt = now;
  campaign.updatedAt = now;
  await kv.set(campaignKey, campaign);

  // Atualizar índice de status
  await kv.del(`campaign_status:${userId}:sending:${campaignId}`);
  const statusKey = `campaign_status:${userId}:${campaign.status}:${campaignId}`;
  await kv.set(statusKey, { campaignId, updatedAt: now });

  console.log('[Campaigns V2] 🏁 Envio finalizado:', campaignId, {
    sent: sentCount,
    errors: errorCount,
    status: campaign.status,
  });
}

// ============================================
// 4. OBTER STATUS DA CAMPANHA (TEMPO REAL)
// ============================================
app.get('/campaigns/:id/status', async (c) => {
  try {
    const campaignId = c.req.param('id');
    const userId = c.req.query('userId');

    if (!userId) {
      return c.json({ error: 'userId é obrigatório' }, 400);
    }

    const campaignKey = `campaign_v2:${userId}:${campaignId}`;
    const campaign: Campaign = await kv.get(campaignKey);

    if (!campaign) {
      return c.json({ error: 'Campanha não encontrada' }, 404);
    }

    const percentage = campaign.totalRecipients > 0
      ? Math.floor(((campaign.sentCount + campaign.errorCount) / campaign.totalRecipients) * 100)
      : 0;

    return c.json({
      success: true,
      status: campaign.status,
      totalRecipients: campaign.totalRecipients,
      sentCount: campaign.sentCount,
      errorCount: campaign.errorCount,
      percentage,
      recipients: campaign.recipients,
      updatedAt: campaign.updatedAt,
      completedAt: campaign.completedAt,
    });
  } catch (error: any) {
    console.error('[Campaigns V2] ❌ Erro ao obter status:', error);
    return c.json({
      error: 'Erro ao obter status',
      details: error.message,
    }, 500);
  }
});

// ============================================
// 5. LISTAR CAMPANHAS DO USUÁRIO
// ============================================
app.get('/campaigns', async (c) => {
  try {
    const userId = c.req.query('userId');
    const status = c.req.query('status') || 'all';

    if (!userId) {
      return c.json({ error: 'userId é obrigatório' }, 400);
    }

    console.log('[Campaigns V2] 📋 Listando campanhas do usuário:', userId, 'status:', status);

    const prefix = `campaign_v2:${userId}:`;
    const allCampaigns: Campaign[] = await kv.getByPrefix(prefix);

    // Filtrar por status se necessário
    const filteredCampaigns = status === 'all'
      ? allCampaigns
      : allCampaigns.filter(c => c.status === status);

    // Ordenar por data (mais recentes primeiro)
    const sortedCampaigns = filteredCampaigns.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    return c.json({
      success: true,
      campaigns: sortedCampaigns,
      total: sortedCampaigns.length,
    });
  } catch (error: any) {
    console.error('[Campaigns V2] ❌ Erro ao listar campanhas:', error);
    return c.json({
      error: 'Erro ao listar campanhas',
      details: error.message,
    }, 500);
  }
});

// ============================================
// 6. CANCELAR ENVIO
// ============================================
app.post('/campaigns/:id/cancel', async (c) => {
  try {
    const campaignId = c.req.param('id');
    const { userId } = await c.req.json();

    if (!userId) {
      return c.json({ error: 'userId é obrigatório' }, 400);
    }

    console.log('[Campaigns V2] 🛑 Cancelando campanha:', campaignId);

    const campaignKey = `campaign_v2:${userId}:${campaignId}`;
    const campaign: Campaign = await kv.get(campaignKey);

    if (!campaign) {
      return c.json({ error: 'Campanha não encontrada' }, 404);
    }

    if (campaign.status !== 'sending') {
      return c.json({ error: 'Apenas campanhas em envio podem ser canceladas' }, 400);
    }

    const now = new Date().toISOString();
    campaign.status = 'cancelled';
    campaign.updatedAt = now;
    campaign.completedAt = now;

    // Marcar recipients pendentes como cancelados
    campaign.recipients = campaign.recipients.map(r => 
      r.status === 'pending' || r.status === 'sending'
        ? { ...r, status: 'error' as const, errorMessage: 'Cancelado pelo usuário' }
        : r
    );

    await kv.set(campaignKey, campaign);

    // Atualizar índice de status
    await kv.del(`campaign_status:${userId}:sending:${campaignId}`);
    const statusKey = `campaign_status:${userId}:cancelled:${campaignId}`;
    await kv.set(statusKey, { campaignId, updatedAt: now });

    console.log('[Campaigns V2] ✅ Campanha cancelada:', campaignId);

    return c.json({
      success: true,
      message: 'Campanha cancelada com sucesso',
    });
  } catch (error: any) {
    console.error('[Campaigns V2] ❌ Erro ao cancelar campanha:', error);
    return c.json({
      error: 'Erro ao cancelar campanha',
      details: error.message,
    }, 500);
  }
});

// ============================================
// 7. DELETAR CAMPANHA
// ============================================
app.delete('/campaigns/:id', async (c) => {
  try {
    const campaignId = c.req.param('id');
    const userId = c.req.query('userId');

    if (!userId) {
      return c.json({ error: 'userId é obrigatório' }, 400);
    }

    console.log('[Campaigns V2] 🗑️ Deletando campanha:', campaignId);

    const campaignKey = `campaign_v2:${userId}:${campaignId}`;
    const campaign: Campaign = await kv.get(campaignKey);

    if (!campaign) {
      return c.json({ error: 'Campanha não encontrada' }, 404);
    }

    // Deletar campanha
    await kv.del(campaignKey);

    // Deletar índice de status
    const statusKey = `campaign_status:${userId}:${campaign.status}:${campaignId}`;
    await kv.del(statusKey);

    console.log('[Campaigns V2] ✅ Campanha deletada:', campaignId);

    return c.json({
      success: true,
      message: 'Campanha deletada com sucesso',
    });
  } catch (error: any) {
    console.error('[Campaigns V2] ❌ Erro ao deletar campanha:', error);
    return c.json({
      error: 'Erro ao deletar campanha',
      details: error.message,
    }, 500);
  }
});

export default app;
