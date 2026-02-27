import type { Express } from 'express';
import type { QueryResult } from 'pg';
import { query } from '../database/connection';
import { getStorageService } from './storage.service';

const DEFAULT_LIMITS = {
  leads: 100,
  messages: 50,
  massMessages: 5,
};

const DEFAULT_USAGE = {
  leads: 0,
  messages: 0,
  massMessages: 0,
};

const getPlanLimits = (plan: string) => {
  const limitsMap: Record<string, { leads: number; messages: number; massMessages: number }> = {
    free: {
      leads: 100,
      messages: 100,
      massMessages: 200,
    },
    business: {
      leads: 500,
      messages: 500,
      massMessages: 1000,
    },
    enterprise: {
      leads: -1, // unlimited
      messages: -1, // unlimited
      massMessages: -1, // unlimited
    },
  };

  return limitsMap[plan] || limitsMap.free;
};

interface DbUserRow {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  plan?: string | null;
  subscription_plan?: string | null;
}

interface UsageCounts {
  leads: number;
  messages: number;
  massMessages: number;
}

const parseCount = (result: QueryResult): number => {
  const value = result.rows?.[0]?.count;
  if (value === undefined || value === null) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const fetchUsageCounts = async (userId: string): Promise<UsageCounts> => {
  try {
    const [leadsResult, messagesResult, campaignsResult] = await Promise.all([
      query('SELECT COUNT(*) FROM leads WHERE user_id = $1', [userId]),
      query("SELECT COUNT(*) FROM messages WHERE user_id = $1 AND direction = 'outgoing'", [userId]),
      query('SELECT COUNT(*) FROM campaigns WHERE user_id = $1', [userId]),
    ]);

    return {
      leads: parseCount(leadsResult),
      messages: parseCount(messagesResult),
      massMessages: parseCount(campaignsResult),
    };
  } catch (error) {
    console.error('[UsersService] Failed to compute usage counts:', error);
    return { ...DEFAULT_USAGE };
  }
};

const buildProfileResponse = (user: DbUserRow, usage?: UsageCounts) => {
  const safeUsage = usage || { ...DEFAULT_USAGE };
  const fallbackName = user.email?.split('@')[0] || 'Usuário';
  const plan = user.plan || 'free';

  return {
    id: user.id,
    email: user.email,
    name: user.name || fallbackName,
    avatar_url: user.avatar_url,
    plan,
    subscription_plan: user.subscription_plan || plan,
    isTrial: false,
    limits: getPlanLimits(plan),
    usage: { ...safeUsage },
  };
};

export const getUserProfile = async (userId: string) => {
  const result = await query(
    'SELECT id, email, name, avatar_url, plan, subscription_plan FROM users WHERE id = $1',
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
