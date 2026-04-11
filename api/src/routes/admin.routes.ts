import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { query } from '../database/connection';
import { plansService } from '../services/plans.service';
import { planExpirationService } from '../services/plan-expiration.service';
import { activityService } from '../services/activity.service';
import nodemailer from 'nodemailer';

const router = Router();

// ==========================================
// Middleware: verificar se o usuário é admin
// ==========================================
const requireAdmin = async (req: AuthenticatedRequest, res: any, next: any) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await query('SELECT role FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0 || result.rows[0].role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (error) {
    console.error('[Admin] Error checking admin role:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ==========================================
// GET /admin/users - Listar todos os usuários
// ==========================================
router.get('/users', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    console.log('[Admin] Fetching all users...');

    const result = await query(`
      SELECT 
        u.id,
        u.email,
        u.name,
        u.avatar_url,
        u.role,
        u.is_active,
        u.plan,
        u.subscription_plan,
        u.plan_expires_at,
        u.trial_ends_at,
        u.last_active_at,
        u.created_at,
        u.updated_at,
        (SELECT COUNT(*) FROM leads WHERE user_id = u.id) as leads_count,
        (SELECT COUNT(*) FROM messages WHERE user_id = u.id AND direction = 'outgoing') as messages_count,
        (SELECT COUNT(*) FROM campaigns WHERE user_id = u.id) as campaigns_count,
        (SELECT COUNT(*) FROM channels WHERE user_id = u.id) as channels_count
      FROM users u
      ORDER BY u.created_at DESC
    `);

    const users = result.rows.map(row => ({
      id: row.id,
      email: row.email,
      name: row.name || row.email?.split('@')[0] || 'Usuário',
      avatar_url: row.avatar_url,
      role: row.role || 'user',
      plan: row.plan || 'free',
      subscription_plan: row.subscription_plan || row.plan || 'free',
      planExpiresAt: row.plan_expires_at,
      trialEndsAt: row.trial_ends_at,
      lastActiveAt: row.last_active_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      isActive: row.is_active !== false,
      status: row.is_active === false ? 'suspended' : 'active',
      usage: {
        leads: parseInt(row.leads_count) || 0,
        messages: parseInt(row.messages_count) || 0,
        campaigns: parseInt(row.campaigns_count) || 0,
        channels: parseInt(row.channels_count) || 0,
      },
    }));

    console.log(`[Admin] Found ${users.length} users`);
    res.json({ success: true, users });
  } catch (error) {
    console.error('[Admin] Error fetching users:', error);
    next(error);
  }
});

// ==========================================
// GET /admin/active-users - Usuários ativos nos últimos 15 minutos
// ==========================================
router.get('/active-users', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const minutes = parseInt(req.query.minutes as string) || 15;
    const users = await activityService.getActiveUsers(minutes);
    res.json({ success: true, users });
  } catch (error) {
    console.error('[Admin] Error fetching active users:', error);
    next(error);
  }
});

// ==========================================
// GET /admin/user-activities - Log de atividades dos usuários
// ==========================================
router.get('/user-activities', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const activities = await activityService.getRecentActivities(limit, offset);
    res.json({ success: true, activities });
  } catch (error) {
    console.error('[Admin] Error fetching user activities:', error);
    next(error);
  }
});

// ==========================================
// POST /admin/activate-plan - Ativar plano para usuário
// ==========================================
router.post('/activate-plan', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId, planId, expiresAt } = req.body;

    if (!userId || !planId) {
      return res.status(400).json({ error: 'userId and planId are required' });
    }

    // Buscar limites do plano a partir do banco de dados
    let limits: any;
    try {
      const plan = await plansService.getPlanById(planId);
      if (plan) {
        limits = plan.limits;
      }
    } catch (e) {
      console.warn('[Admin] Could not fetch plan from DB, using fallback');
    }

    // Fallback se não encontrou no banco
    if (!limits) {
      const fallbackLimits: Record<string, any> = {
        free: { leads: 100, messages: 100, massMessages: 200 },
        business: { leads: 500, messages: 500, massMessages: 1000 },
        enterprise: { leads: -1, messages: -1, massMessages: -1 },
      };
      limits = fallbackLimits[planId] || fallbackLimits.free;
    }

    const result = await query(
      `UPDATE users 
       SET plan = $1, 
           subscription_plan = $1, 
           plan_limits = $2,
           plan_expires_at = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, email, name, plan, plan_expires_at`,
      [planId, JSON.stringify(limits), expiresAt || null, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    console.log(`[Admin] Plan ${planId} activated for user ${user.email} (expires: ${expiresAt || 'never'})`);

    res.json({ 
      success: true, 
      message: `Plano ${planId} ativado com sucesso para ${user.email}`,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        plan: user.plan,
        planExpiresAt: user.plan_expires_at,
      }
    });
  } catch (error) {
    console.error('[Admin] Error activating plan:', error);
    next(error);
  }
});

// ==========================================
// POST /admin/suspend-user - Suspender/Reativar usuário
// ==========================================
router.post('/suspend-user', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId, suspend } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Não permitir suspender a si mesmo
    if (userId === req.user?.id) {
      return res.status(400).json({ error: 'Você não pode suspender a si mesmo' });
    }

    const isActive = !suspend;
    const result = await query(
      `UPDATE users 
       SET is_active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, name, is_active`,
      [isActive, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const status = user.is_active ? 'reativado' : 'suspenso';
    console.log(`[Admin] User ${user.email} ${status}`);

    res.json({ 
      success: true, 
      message: `Usuário ${user.email} ${status} com sucesso`,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isActive: user.is_active,
        status: user.is_active ? 'active' : 'suspended',
      }
    });
  } catch (error) {
    console.error('[Admin] Error suspending user:', error);
    next(error);
  }
});

// ==========================================
// DELETE /admin/delete-user/:id - Remover usuário
// ==========================================
router.delete('/delete-user/:id', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { id } = req.params;

    // Não permitir deletar a si mesmo
    if (id === req.user?.id) {
      return res.status(400).json({ error: 'Você não pode remover a si mesmo' });
    }

    // Verificar se o usuário existe
    const checkResult = await query('SELECT id, email, role FROM users WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = checkResult.rows[0];

    // Não permitir deletar outro admin
    if (targetUser.role === 'admin') {
      return res.status(400).json({ error: 'Não é possível remover outro administrador' });
    }

    // Deletar dados relacionados (CASCADE deve cuidar da maioria, mas vamos ser explícitos)
    console.log(`[Admin] Deleting all data for user ${targetUser.email}...`);

    // Deletar em ordem para respeitar foreign keys
    await query('DELETE FROM messages WHERE user_id = $1', [id]);
    await query('DELETE FROM campaigns WHERE user_id = $1', [id]);
    await query('DELETE FROM leads WHERE user_id = $1', [id]);
    await query('DELETE FROM contacts WHERE user_id = $1', [id]);
    await query('DELETE FROM channels WHERE user_id = $1', [id]);
    
    // Tentar deletar tabelas opcionais (podem não existir)
    try { await query('DELETE FROM conversations WHERE user_id = $1', [id]); } catch (e) { /* ignore */ }
    try { await query('DELETE FROM user_assistants WHERE user_id = $1', [id]); } catch (e) { /* ignore */ }
    try { await query('DELETE FROM lead_interactions WHERE user_id = $1', [id]); } catch (e) { /* ignore */ }
    try { await query('DELETE FROM notifications WHERE user_id = $1', [id]); } catch (e) { /* ignore */ }
    try { await query('DELETE FROM user_webhooks WHERE user_id = $1', [id]); } catch (e) { /* ignore */ }
    try { await query('DELETE FROM scheduled_conversations WHERE user_id = $1', [id]); } catch (e) { /* ignore */ }

    // Finalmente deletar o usuário
    await query('DELETE FROM users WHERE id = $1', [id]);

    console.log(`[Admin] User ${targetUser.email} and all related data deleted successfully`);

    res.json({ 
      success: true, 
      message: `Usuário ${targetUser.email} removido com sucesso` 
    });
  } catch (error) {
    console.error('[Admin] Error deleting user:', error);
    next(error);
  }
});

// ==========================================
// GET /admin/notification-settings - Buscar configurações de notificação
// ==========================================
router.get('/notification-settings', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    // Tentar buscar da tabela admin_settings
    try {
      const result = await query(
        `SELECT settings FROM admin_settings WHERE admin_id = $1 AND setting_key = 'notifications'`,
        [req.user!.id]
      );

      if (result.rows.length > 0) {
        return res.json({ success: true, settings: result.rows[0].settings });
      }
    } catch (e) {
      // Tabela pode não existir - criar e retornar defaults
      try {
        await query(`
          CREATE TABLE IF NOT EXISTS admin_settings (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            admin_id UUID REFERENCES users(id) ON DELETE CASCADE,
            setting_key VARCHAR(100) NOT NULL,
            settings JSONB DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            UNIQUE(admin_id, setting_key)
          )
        `);
      } catch (createErr) {
        console.warn('[Admin] Could not create admin_settings table:', createErr);
      }
    }

    // Retornar defaults
    res.json({ 
      success: true, 
      settings: {
        upgradeNotifications: true,
        newUserNotifications: false,
        paymentNotifications: true,
      }
    });
  } catch (error) {
    console.error('[Admin] Error fetching notification settings:', error);
    next(error);
  }
});

// ==========================================
// POST /admin/notification-settings - Salvar configurações de notificação
// ==========================================
router.post('/notification-settings', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const settings = req.body;

    // Garantir que a tabela existe
    await query(`
      CREATE TABLE IF NOT EXISTS admin_settings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        admin_id UUID REFERENCES users(id) ON DELETE CASCADE,
        setting_key VARCHAR(100) NOT NULL,
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(admin_id, setting_key)
      )
    `);

    // Upsert
    await query(
      `INSERT INTO admin_settings (admin_id, setting_key, settings)
       VALUES ($1, 'notifications', $2)
       ON CONFLICT (admin_id, setting_key)
       DO UPDATE SET settings = $2, updated_at = NOW()`,
      [req.user!.id, JSON.stringify(settings)]
    );

    console.log(`[Admin] Notification settings saved for admin ${req.user!.email}`);

    res.json({ success: true, message: 'Configurações salvas com sucesso' });
  } catch (error) {
    console.error('[Admin] Error saving notification settings:', error);
    next(error);
  }
});

// ==========================================
// POST /admin/reset-usage - Resetar contadores de uso de um usuário
// ==========================================
router.post('/reset-usage', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId, resetType } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    switch (resetType) {
      case 'messages':
        // Deletar mensagens individuais (não de campanha)
        await query("DELETE FROM messages WHERE user_id = $1 AND campaign_id IS NULL AND direction = 'outgoing'", [userId]);
        console.log(`[Admin] Reset individual messages for user ${userId}`);
        break;
      case 'massMessages':
        // Resetar stats das campanhas
        await query("UPDATE campaigns SET stats = '{\"sent\": 0, \"delivered\": 0, \"read\": 0, \"replied\": 0, \"failed\": 0}' WHERE user_id = $1", [userId]);
        console.log(`[Admin] Reset mass messages stats for user ${userId}`);
        break;
      case 'all':
        await query("DELETE FROM messages WHERE user_id = $1 AND campaign_id IS NULL AND direction = 'outgoing'", [userId]);
        await query("UPDATE campaigns SET stats = '{\"sent\": 0, \"delivered\": 0, \"read\": 0, \"replied\": 0, \"failed\": 0}' WHERE user_id = $1", [userId]);
        console.log(`[Admin] Reset all usage counters for user ${userId}`);
        break;
      default:
        return res.status(400).json({ error: 'Invalid resetType. Use: messages, massMessages, or all' });
    }

    res.json({ success: true, message: 'Contadores resetados com sucesso' });
  } catch (error) {
    console.error('[Admin] Error resetting usage:', error);
    next(error);
  }
});

// ==========================================
// GET /admin/stats - Estatísticas gerais da plataforma
// ==========================================
router.get('/stats', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const [totalUsers, planCounts, recentSignups, totalLeads, totalMessages] = await Promise.all([
      query('SELECT COUNT(*) FROM users'),
      query(`SELECT plan, COUNT(*) as count FROM users GROUP BY plan`),
      query(`SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL '30 days'`),
      query('SELECT COUNT(*) FROM leads'),
      query("SELECT COUNT(*) FROM messages WHERE direction = 'outgoing'"),
    ]);

    const planStats: Record<string, number> = {};
    planCounts.rows.forEach((row: any) => {
      planStats[row.plan || 'free'] = parseInt(row.count);
    });

    res.json({
      success: true,
      stats: {
        totalUsers: parseInt(totalUsers.rows[0].count),
        planDistribution: planStats,
        recentSignups: parseInt(recentSignups.rows[0].count),
        totalLeads: parseInt(totalLeads.rows[0].count),
        totalMessages: parseInt(totalMessages.rows[0].count),
      }
    });
  } catch (error) {
    console.error('[Admin] Error fetching stats:', error);
    next(error);
  }
});

// ==========================================
// GET /admin/plans-pricing - Buscar planos com preços do banco
// ==========================================
router.get('/plans-pricing', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const plans = await plansService.getAllPlans();
    res.json({ success: true, plans });
  } catch (error) {
    console.error('[Admin] Error fetching plans pricing:', error);
    // Retornar fallback se a tabela plans não existir
    res.json({ 
      success: true, 
      plans: [
        { id: 'free', name: 'Free', price: { monthly: 0, annual: 0 }, limits: { leads: 100, messages: 100, massMessages: 200 } },
        { id: 'business', name: 'Business', price: { monthly: 20, annual: 100 }, limits: { leads: 500, messages: 500, massMessages: 1000 } },
        { id: 'enterprise', name: 'Enterprise', price: { monthly: 59, annual: 200 }, limits: { leads: -1, messages: -1, massMessages: -1 } },
      ]
    });
  }
});

// ==========================================
// POST /admin/check-expirations - Verificar planos expirados manualmente
// ==========================================
router.post('/check-expirations', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    await planExpirationService.checkNow();
    res.json({ success: true, message: 'Verificação de expiração executada com sucesso' });
  } catch (error) {
    console.error('[Admin] Error checking expirations:', error);
    next(error);
  }
});


// ==========================================
// GET /admin/active-users - Listar usuários ativos agora
// ==========================================
router.get('/active-users', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const minutes = parseInt(req.query.minutes as string) || 15;
    const activeUsers = await activityService.getActiveUsers(minutes);
    res.json({ success: true, users: activeUsers });
  } catch (error) {
    console.error('[Admin] Error fetching active users:', error);
    next(error);
  }
});

// ==========================================
// GET /admin/user-activities - Logs de atividades recentes
// ==========================================
router.get('/user-activities', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const activities = await activityService.getRecentActivities(limit, offset);
    res.json({ success: true, activities });
  } catch (error) {
    console.error('[Admin] Error fetching user activities:', error);
    next(error);
  }
});

// ==========================================
// GET /admin/users/:userId/details - Detalhes completos de um usuário
// ==========================================
router.get('/users/:userId/details', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req.params;

    const userResult = await query(
      `SELECT u.id, u.email, u.name, u.avatar_url, u.role, u.is_active, u.plan, u.plan_expires_at,
              u.plan_activated_at, u.subscription_status, u.stripe_customer_id,
              u.created_at, u.last_active_at,
              (SELECT COUNT(*) FROM leads WHERE user_id = u.id) as leads_count,
              (SELECT COUNT(*) FROM messages WHERE user_id = u.id AND direction = 'outgoing') as messages_count,
              (SELECT COUNT(*) FROM campaigns WHERE user_id = u.id) as campaigns_count
       FROM users u WHERE u.id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const channelsResult = await query(
      `SELECT id, name, type, phone_number, status, created_at
       FROM channels WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );

    const activitiesResult = await query(
      `SELECT type, description, metadata, created_at
       FROM activities WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
      [userId]
    );

    res.json({
      success: true,
      user: userResult.rows[0],
      channels: channelsResult.rows,
      recentActivities: activitiesResult.rows,
    });
  } catch (error) {
    console.error('[Admin] Error fetching user details:', error);
    next(error);
  }
});

// ==========================================
// POST /admin/users/:userId/send-email - Enviar email para usuário
// ==========================================
router.post('/users/:userId/send-email', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req.params;
    const { subject, message, is_html } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ error: 'subject and message are required' });
    }

    const userResult = await query('SELECT email, name FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { email, name } = userResult.rows[0];

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || `LeadsFlow API <${smtpUser}>`;

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      return res.status(503).json({ error: 'SMTP not configured on server. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env' });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort, 10),
      secure: parseInt(smtpPort, 10) === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    await transporter.sendMail({
      from: smtpFrom,
      to: email,
      subject,
      text: is_html ? undefined : message,
      html: is_html ? message : `<p>${message.replace(/\n/g, '<br>')}</p>`,
    });

    console.log(`[Admin] Email sent to ${email} (${name}) — subject: ${subject}`);
    res.json({ success: true, message: `Email enviado para ${email}` });
  } catch (error: any) {
    console.error('[Admin] Error sending email:', error);
    next(error);
  }
});

// ==========================================
// POST /admin/users/:userId/send-whatsapp - Enviar WhatsApp para usuário via canal dele
// ==========================================
router.post('/users/:userId/send-whatsapp', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId } = req.params;
    const { phone, message, channel_id } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: 'phone and message are required' });
    }

    // Find one connected channel — prefer explicitly provided, else first active
    let instanceName: string | null = null;
    if (channel_id) {
      const ch = await query('SELECT name FROM channels WHERE id = $1 AND user_id = $2', [channel_id, userId]);
      if (ch.rows.length > 0) instanceName = ch.rows[0].name;
    }
    if (!instanceName) {
      const ch = await query(
        `SELECT name FROM channels WHERE user_id = $1 AND status = 'connected' ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      if (ch.rows.length > 0) instanceName = ch.rows[0].name;
    }

    if (!instanceName) {
      return res.status(400).json({ error: 'No connected WhatsApp channel found for this user' });
    }

    const evolutionUrl = process.env.EVOLUTION_API_URL?.replace(/\/$/, '');
    const apiKey = process.env.EVOLUTION_API_KEY;
    if (!evolutionUrl || !apiKey) {
      return res.status(503).json({ error: 'Evolution API not configured' });
    }

    const cleanPhone = phone.replace(/\D/g, '');
    const response = await fetch(`${evolutionUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: cleanPhone, text: message }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: `Evolution API error: ${err}` });
    }

    console.log(`[Admin] WhatsApp sent to ${cleanPhone} via instance ${instanceName}`);
    res.json({ success: true, message: `WhatsApp enviado para ${cleanPhone}` });
  } catch (error: any) {
    console.error('[Admin] Error sending WhatsApp:', error);
    next(error);
  }
});

// ==========================================
// POST /admin/broadcast/email - Enviar email para múltiplos usuários
// ==========================================
router.post('/broadcast/email', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { subject, message, is_html, target } = req.body;
    // target: 'all' | 'free' | 'business' | 'enterprise' | string[] (user ids)

    if (!subject || !message) {
      return res.status(400).json({ error: 'subject and message are required' });
    }

    const smtpHost = process.env.SMTP_HOST;
    const smtpPort = process.env.SMTP_PORT;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpFrom = process.env.SMTP_FROM || `LeadsFlow API <${smtpUser}>`;

    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      return res.status(503).json({ error: 'SMTP not configured on server' });
    }

    let usersResult;
    if (Array.isArray(target)) {
      usersResult = await query(
        'SELECT id, email, name FROM users WHERE id = ANY($1) AND is_active = true',
        [target]
      );
    } else if (target === 'all') {
      usersResult = await query('SELECT id, email, name FROM users WHERE is_active = true');
    } else {
      // plan filter
      usersResult = await query(
        'SELECT id, email, name FROM users WHERE plan = $1 AND is_active = true',
        [target || 'all']
      );
    }

    const recipients = usersResult.rows;
    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients found' });
    }

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(smtpPort, 10),
      secure: parseInt(smtpPort, 10) === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    let sent = 0;
    const errors: string[] = [];

    for (const user of recipients) {
      try {
        const personalizedMessage = message
          .replace(/\{\{name\}\}/gi, user.name || user.email.split('@')[0])
          .replace(/\{\{email\}\}/gi, user.email);

        await transporter.sendMail({
          from: smtpFrom,
          to: user.email,
          subject,
          text: is_html ? undefined : personalizedMessage,
          html: is_html ? personalizedMessage : `<p>${personalizedMessage.replace(/\n/g, '<br>')}</p>`,
        });
        sent++;
      } catch (err: any) {
        errors.push(`${user.email}: ${err.message}`);
      }
    }

    console.log(`[Admin] Broadcast email: sent=${sent}, errors=${errors.length}`);
    res.json({ success: true, sent, total: recipients.length, errors: errors.slice(0, 10) });
  } catch (error: any) {
    console.error('[Admin] Error broadcasting email:', error);
    next(error);
  }
});

export default router;
