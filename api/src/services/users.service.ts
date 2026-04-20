import type { Express } from 'express';
import type { QueryResult } from 'pg';
import { query } from '../database/connection';
import { getStorageService } from './storage.service';

const DEFAULT_LIMITS = {
  leads: 100,
  messages: 100,
  massMessages: 50,
  channels: 1,
  customAssistants: 0,
  voiceAgents: 0,
  activeCampaigns: 1,
};

const DEFAULT_USAGE = {
  leads: 0,
  messages: 0,
  massMessages: 0,
  channels: 0,
  customAssistants: 0,
  voiceAgents: 0,
  activeCampaigns: 0,
};

const getPlanLimits = (plan: string) => {
  const limitsMap: Record<string, {
    leads: number; messages: number; massMessages: number;
    channels: number; customAssistants: number; voiceAgents: number; activeCampaigns: number;
  }> = {
    free: {
      leads: 100,
      messages: 100,
      massMessages: 50,
      channels: 1,
      customAssistants: 0,
      voiceAgents: 0,
      activeCampaigns: 1,
    },
    business: {
      leads: 2000,
      messages: 1000,
      massMessages: 5000,
      channels: 5,
      customAssistants: 3,
      voiceAgents: 1,
      activeCampaigns: 10,
    },
    enterprise: {
      leads: -1,
      messages: -1,
      massMessages: -1,
      channels: -1,
      customAssistants: -1,
      voiceAgents: -1,
      activeCampaigns: -1,
    },
  };

  return limitsMap[plan?.toLowerCase()] || limitsMap.free;
};

interface DbUserRow {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  plan?: string | null;
  subscription_plan?: string | null;
  subscription_status?: string | null;
  plan_expires_at?: string | null;
  plan_activated_at?: string | null;
  plan_limits?: Record<string, number> | null;
  db_plan_limits?: Record<string, number> | null;
}

interface UsageCounts {
  leads: number;
  messages: number;
  massMessages: number;
  channels: number;
  customAssistants: number;
  voiceAgents: number;
  activeCampaigns: number;
}

const parseCount = (result: QueryResult): number => {
  const value = result.rows?.[0]?.count;
  if (value === undefined || value === null) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

// Run a single count query, returning 0 on any error (missing table, bad cast, etc.)
const safeCount = async (sql: string, params: any[]): Promise<number> => {
  try {
    const result = await query(sql, params);
    return parseCount(result);
  } catch (err) {
    console.warn('[UsersService] safeCount query failed (returning 0):', (err as Error)?.message?.substring(0, 120));
    return 0;
  }
};

const fetchUsageCounts = async (userId: string): Promise<UsageCounts> => {
  try {
    // Fetch plan info to determine billing period start
    const userRow = await query(
      'SELECT plan, plan_activated_at FROM users WHERE id = $1',
      [userId]
    );
    const userData = userRow.rows[0];
    const plan = (userData?.plan || 'free').toLowerCase();

    // Billing period start:
    //  - Paid plans: from plan_activated_at (when they subscribed)
    //  - Free plan: beginning of current calendar month (resets monthly)
    let periodStart: Date;
    if (plan !== 'free' && userData?.plan_activated_at) {
      periodStart = new Date(userData.plan_activated_at);
    } else {
      const now = new Date();
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1); // 1st of current month
    }

    // Each query is isolated — a failure in one does NOT zero out other counts.
    const [leads, messages, massMessages, channels, customAssistants, voiceAgents, activeCampaigns] = await Promise.all([
      safeCount('SELECT COUNT(*) FROM leads WHERE user_id = $1', [userId]),
      // Mensagens individuais: enviadas (out), não são de campanha, dentro do período (inclui IA)
      safeCount(
        "SELECT COUNT(*) FROM messages WHERE user_id = $1 AND direction = 'out' AND campaign_id IS NULL AND created_at >= $2",
        [userId, periodStart]
      ),
      // Mensagens em massa: soma de envios das campanhas criadas dentro do período
      // Use CASE guard to avoid cast errors when stats->>'sent' is not a valid integer
      safeCount(
        `SELECT COALESCE(SUM(
           CASE WHEN (stats->>'sent') ~ '^[0-9]+$' THEN (stats->>'sent')::bigint ELSE 0 END
         ), 0) as count FROM campaigns WHERE user_id = $1 AND created_at >= $2`,
        [userId, periodStart]
      ),
      safeCount('SELECT COUNT(*) FROM channels WHERE user_id = $1', [userId]),
      safeCount('SELECT COUNT(*) FROM user_assistants ua JOIN assistants a ON ua.assistant_id = a.id WHERE ua.user_id = $1 AND a.is_custom = true', [userId]),
      safeCount('SELECT COUNT(*) FROM voice_agents WHERE user_id = $1', [userId]),
      safeCount("SELECT COUNT(*) FROM campaigns WHERE user_id = $1 AND status IN ('active','scheduled','paused')", [userId]),
    ]);

    return { leads, messages, massMessages, channels, customAssistants, voiceAgents, activeCampaigns };
  } catch (error) {
    console.error('[UsersService] Failed to compute usage counts:', error);
    return { ...DEFAULT_USAGE };
  }
};

const buildProfileResponse = (user: DbUserRow, usage?: UsageCounts) => {
  const safeUsage = usage || { ...DEFAULT_USAGE };
  const fallbackName = user.email?.split('@')[0] || 'Usuário';
  const plan = (user.plan || 'free').toLowerCase();

  return {
    id: user.id,
    email: user.email,
    name: user.name || fallbackName,
    avatar_url: user.avatar_url,
    plan,
    subscription_plan: (user.subscription_plan || plan).toLowerCase(),
    subscription_status: user.subscription_status || 'active',
    plan_expires_at: user.plan_expires_at || null,
    planExpiresAt: user.plan_expires_at || null,
    plan_activated_at: user.plan_activated_at || null,
    planActivatedAt: user.plan_activated_at || null,
    isTrial: false,
    // Priority: user.plan_limits (set at subscription) > plans table limits > hardcoded fallback
    limits: (() => {
      const hardcoded = getPlanLimits(plan);
      const fromPlansTable = (user.db_plan_limits && typeof user.db_plan_limits === 'object' && Object.keys(user.db_plan_limits).length > 0)
        ? user.db_plan_limits : null;
      const fallback = fromPlansTable || hardcoded;
      const db = (user.plan_limits && typeof user.plan_limits === 'object' && Object.keys(user.plan_limits).length > 0)
        ? user.plan_limits : null;
      return {
        leads: db?.leads ?? fallback.leads,
        messages: db?.messages ?? fallback.messages,
        massMessages: db?.massMessages ?? fallback.massMessages,
        channels: db?.channels ?? fallback.channels,
        customAssistants: db?.customAssistants ?? fallback.customAssistants,
        voiceAgents: db?.voiceAgents ?? fallback.voiceAgents,
        activeCampaigns: db?.activeCampaigns ?? fallback.activeCampaigns,
        exportLeads: db?.exportLeads ?? db?.leads ?? fallback.leads,
        importBatch: db?.importBatch ?? db?.leads ?? fallback.leads,
      };
    })(),
    usage: { ...safeUsage },
  };
};

export const getUserProfile = async (userId: string) => {
  const result = await query(
    `SELECT u.id, u.email, u.name, u.avatar_url, u.plan, u.subscription_plan, u.subscription_status,
            u.plan_expires_at, u.plan_activated_at, u.plan_limits,
            p.limits AS db_plan_limits
     FROM users u
     LEFT JOIN plans p ON p.id = LOWER(COALESCE(u.plan, 'free')) AND p.is_active = true
     WHERE u.id = $1`,
    [userId]
  );

  const user = result.rows[0] as DbUserRow | undefined;
  if (!user) {
    throw new Error('User not found');
  }

  const usage = await fetchUsageCounts(userId);
  return buildProfileResponse(user, usage);
};

export const updateUserProfile = async (
  userId: string,
  updates: { name?: string; avatar_url?: string | null }
) => {
  const fields: string[] = [];
  const values: any[] = [];
  let index = 1;

  if (typeof updates.name !== 'undefined') {
    fields.push(`name = $${index++}`);
    values.push(updates.name ?? null);
  }

  if (typeof updates.avatar_url !== 'undefined') {
    fields.push(`avatar_url = $${index++}`);
    values.push(updates.avatar_url ?? null);
  }

  if (!fields.length) {
    return getUserProfile(userId);
  }

  values.push(userId);

  const result = await query(
    `UPDATE users
       SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${index}
     RETURNING id, email, name, avatar_url, plan, subscription_plan`,
    values
  );

  const user = result.rows[0] as DbUserRow | undefined;
  if (!user) {
    throw new Error('User not found');
  }

  const usage = await fetchUsageCounts(userId);
  return buildProfileResponse(user, usage);
};

const ALLOWED_AVATAR_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB

export const updateUserAvatar = async (userId: string, file: Express.Multer.File) => {
  if (!ALLOWED_AVATAR_TYPES.includes(file.mimetype)) {
    throw new Error('Tipo de arquivo inválido. Use JPG, PNG, GIF ou WEBP.');
  }

  if (file.size > MAX_AVATAR_SIZE) {
    throw new Error('Arquivo muito grande. Máximo 5MB.');
  }

  console.log('[Users] Uploading avatar for user:', userId);
  console.log('[Users] File info:', {
    mimetype: file.mimetype,
    size: file.size,
    originalname: file.originalname,
  });

  // Get storage service (MinIO or Base64)
  console.log('[Users] 🔍 Getting storage service...');
  const storage = getStorageService();
  console.log('[Users] 🔍 Storage service type:', storage.constructor.name);
  console.log('[Users] 🔍 Will use:', storage.constructor.name === 'MinIOStorage' ? 'MinIO S3' : 'Base64 Database');

  // Get current avatar to delete old one if using MinIO
  const currentUser = await query('SELECT avatar_url FROM users WHERE id = $1', [userId]);
  const currentAvatarUrl = currentUser.rows[0]?.avatar_url;

  // Upload new avatar with user-specific path
  const avatarUrl = await storage.uploadFile(file, 'avatars', userId);

  // Update user with new avatar URL
  const result = await query(
    `UPDATE users
       SET avatar_url = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, email, name, avatar_url, plan, subscription_plan`,
    [avatarUrl, userId]
  );

  const user = result.rows[0] as DbUserRow | undefined;
  if (!user) {
    throw new Error('User not found');
  }

  // Delete old avatar if it exists and was stored in MinIO
  if (currentAvatarUrl && !currentAvatarUrl.startsWith('data:')) {
    try {
      await storage.deleteFile(currentAvatarUrl);
    } catch (error) {
      console.warn('[Users] Failed to delete old avatar:', error);
    }
  }

  console.log('[Users] Avatar uploaded successfully:', avatarUrl.substring(0, 50) + '...');

  const usage = await fetchUsageCounts(userId);
  return buildProfileResponse(user, usage);
};
