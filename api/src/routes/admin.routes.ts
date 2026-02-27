import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { query } from '../database/connection';

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
// POST /admin/activate-plan - Ativar plano para usuário
// ==========================================
router.post('/activate-plan', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { userId, planId, expiresAt } = req.body;

    if (!userId || !planId) {
      return res.status(400).json({ error: 'userId and planId are required' });
    }

    // Definir limites de acordo com o plano
    const planLimits: Record<string, any> = {
      free: { leads: 100, messages: 100, massMessages: 200 },
      business: { leads: 500, messages: 500, massMessages: 1000 },
      enterprise: { leads: -1, messages: -1, massMessages: -1 },
    };

    const limits = planLimits[planId] || planLimits.free;

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

export default router;
