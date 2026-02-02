import { Router } from 'express';
import multer from 'multer';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { getUserProfile, updateUserAvatar, updateUserProfile } from '../services/users.service';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Debug endpoint to check MinIO environment variables (NO AUTH REQUIRED)
router.get('/debug/minio-config', (_req, res) => {
  const accessKey = process.env.MINIO_ACCESS_KEY || process.env.SERVICE_USER_MINIO;
  const secretKey = process.env.MINIO_SECRET_KEY || process.env.SERVICE_PASSWORD_MINIO;

  res.json({
    minioConfigured: Boolean(
      process.env.MINIO_ENDPOINT &&
      accessKey &&
      secretKey
    ),
    hasMinioEndpoint: !!process.env.MINIO_ENDPOINT,
    hasMinioAccessKey: !!process.env.MINIO_ACCESS_KEY,
    hasMinioSecretKey: !!process.env.MINIO_SECRET_KEY,
    hasServiceUserMinio: !!process.env.SERVICE_USER_MINIO,
    hasServicePasswordMinio: !!process.env.SERVICE_PASSWORD_MINIO,
    minioEndpoint: process.env.MINIO_ENDPOINT || 'NOT SET',
    minioPort: process.env.MINIO_PORT || 'NOT SET',
    minioUseSSL: process.env.MINIO_USE_SSL || 'NOT SET',
    minioBucket: process.env.MINIO_BUCKET || 'NOT SET',
    minioRegion: process.env.MINIO_REGION || 'NOT SET',
    minioPublicUrl: process.env.MINIO_PUBLIC_URL || 'NOT SET',
    accessKeyPreview: accessKey ? `${accessKey.substring(0, 10)}...` : 'NOT SET',
    secretKeyPreview: secretKey ? `${secretKey.substring(0, 10)}...` : 'NOT SET',
    willUseMinIO: Boolean(process.env.MINIO_ENDPOINT && accessKey && secretKey),
    storageType: process.env.MINIO_ENDPOINT && accessKey && secretKey ? 'MinIO S3' : 'Base64 Database',
  });
});

router.get('/profile', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const profile = await getUserProfile(req.user.id);
    return res.json(profile);
  } catch (error) {
    return next(error);
  }
});

router.put('/profile', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, avatar_url } = req.body || {};
    const profile = await updateUserProfile(req.user.id, { name, avatar_url });
    return res.json(profile);
  } catch (error) {
    return next(error);
  }
});

router.post('/avatar', requireAuth, upload.single('avatar'), async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Avatar file is required' });
    }

    const profile = await updateUserAvatar(req.user.id, req.file);
    return res.json({ success: true, avatar_url: profile.avatar_url, user: profile });
  } catch (error) {
    return next(error);
  }
});

router.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Import bcrypt and query
    const bcrypt = require('bcryptjs');
    const { query } = require('../database/connection');

    // Get user's current password hash
    const result = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    // Update password
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, req.user.id]
    );

    // Log password change in settings table (optional - don't fail if settings table doesn't exist)
    try {
      await query(
        `INSERT INTO settings (user_id, key, value, updated_at)
         VALUES ($1, 'password_changed', 'true', NOW())
         ON CONFLICT (user_id, key)
         DO UPDATE SET value = 'true', updated_at = NOW()`,
        [req.user.id]
      );
    } catch (settingsError) {
      // Ignore settings table errors - password was already updated successfully
      console.log('[Users] Settings table update skipped:', settingsError);
    }

    return res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('[Users] Error changing password:', error);
    return next(error);
  }
});

// Get user settings (webhooks, integrations, etc)
router.get('/settings', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { query } = require('../database/connection');

    // Get all settings for this user
    const result = await query(
      'SELECT key, value FROM settings WHERE user_id = $1',
      [req.user.id]
    );

    // Convert array of {key, value} to object
    const settings: Record<string, any> = {};
    for (const row of result.rows) {
      settings[row.key] = row.value;
    }

    return res.json({
      success: true,
      settings: settings
    });
  } catch (error) {
    console.error('[Users] Error fetching settings:', error);
    return next(error);
  }
});

// Update user settings (webhooks, integrations, etc)
router.put('/settings', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { query } = require('../database/connection');
    const settings = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings object is required' });
    }

    console.log('[Users] Updating settings for user:', req.user.id);
    console.log('[Users] Settings:', settings);

    // Update or insert each setting
    for (const [key, value] of Object.entries(settings)) {
      await query(
        `INSERT INTO settings (user_id, key, value, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, key)
         DO UPDATE SET value = $3, updated_at = NOW()`,
        [req.user.id, key, JSON.stringify(value)]
      );
    }

    return res.json({
      success: true,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    console.error('[Users] Error updating settings:', error);
    return next(error);
  }
});

export default router;
