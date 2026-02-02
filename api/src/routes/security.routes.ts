import { Router } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { query } from '../database/connection';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

const router = Router();

// ===== 2FA Routes =====

// Generate 2FA secret and QR code
router.post('/2fa/setup', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if 2FA is already enabled
    const userResult = await query(
      'SELECT two_factor_enabled FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows[0]?.two_factor_enabled) {
      return res.status(400).json({ error: '2FA já está ativado. Desative primeiro para reconfigurar.' });
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `LeadsFlow (${req.user.email})`,
      issuer: 'LeadsFlow',
    });

    // Generate QR code
    const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url!);

    // Generate backup codes
    const backupCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    // Store secret temporarily (will be confirmed on verification)
    await query(
      `UPDATE users
       SET two_factor_secret = $1, two_factor_backup_codes = $2
       WHERE id = $3`,
      [secret.base32, backupCodes, req.user.id]
    );

    return res.json({
      success: true,
      secret: secret.base32,
      qrCode: qrCodeDataUrl,
      backupCodes,
    });
  } catch (error) {
    console.error('[Security] Error setting up 2FA:', error);
    return next(error);
  }
});

// Verify and enable 2FA
router.post('/2fa/verify', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Código de verificação é obrigatório' });
    }

    // Get user's secret
    const userResult = await query(
      'SELECT two_factor_secret FROM users WHERE id = $1',
      [req.user.id]
    );

    const secret = userResult.rows[0]?.two_factor_secret;

    if (!secret) {
      return res.status(400).json({ error: '2FA não foi configurado. Execute /2fa/setup primeiro.' });
    }

    // Verify code
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token: code,
      window: 2, // Allow 2 time steps before/after for clock skew
    });

    if (!verified) {
      return res.status(400).json({ error: 'Código inválido' });
    }

    // Enable 2FA
    await query(
      'UPDATE users SET two_factor_enabled = true WHERE id = $1',
      [req.user.id]
    );

    return res.json({
      success: true,
      message: '2FA ativado com sucesso',
    });
  } catch (error) {
    console.error('[Security] Error verifying 2FA:', error);
    return next(error);
  }
});

// Disable 2FA
router.post('/2fa/disable', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Senha é obrigatória para desativar 2FA' });
    }

    // Verify password
    const userResult = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [req.user.id]
    );

    const isValidPassword = await bcrypt.compare(password, userResult.rows[0].password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    // Disable 2FA
    await query(
      `UPDATE users
       SET two_factor_enabled = false,
           two_factor_secret = NULL,
           two_factor_backup_codes = NULL
       WHERE id = $1`,
      [req.user.id]
    );

    return res.json({
      success: true,
      message: '2FA desativado com sucesso',
    });
  } catch (error) {
    console.error('[Security] Error disabling 2FA:', error);
    return next(error);
  }
});

// Get 2FA status
router.get('/2fa/status', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userResult = await query(
      'SELECT two_factor_enabled FROM users WHERE id = $1',
      [req.user.id]
    );

    return res.json({
      success: true,
      enabled: userResult.rows[0]?.two_factor_enabled || false,
    });
  } catch (error) {
    console.error('[Security] Error getting 2FA status:', error);
    return next(error);
  }
});

// ===== API Tokens Routes =====

// List user's API tokens
router.get('/tokens', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const result = await query(
      `SELECT id, name, token_prefix, scopes, last_used_at, expires_at, created_at
       FROM api_tokens
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    return res.json({
      success: true,
      tokens: result.rows,
    });
  } catch (error) {
    console.error('[Security] Error listing tokens:', error);
    return next(error);
  }
});

// Create new API token
router.post('/tokens', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, scopes, expiresInDays } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nome do token é obrigatório' });
    }

    // Generate token (format: lf_random32chars_random32chars)
    const tokenPart1 = crypto.randomBytes(16).toString('hex');
    const tokenPart2 = crypto.randomBytes(16).toString('hex');
    const token = `lf_${tokenPart1}_${tokenPart2}`;
    const tokenPrefix = `lf_${tokenPart1.substring(0, 8)}...`;

    // Hash token for storage
    const tokenHash = await bcrypt.hash(token, 10);

    // Calculate expiration
    let expiresAt = null;
    if (expiresInDays && expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresInDays);
    }

    // Insert token
    const result = await query(
      `INSERT INTO api_tokens (user_id, name, token_hash, token_prefix, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, token_prefix, scopes, expires_at, created_at`,
      [
        req.user.id,
        name.trim(),
        tokenHash,
        tokenPrefix,
        scopes || ['read', 'write'],
        expiresAt,
      ]
    );

    return res.json({
      success: true,
      token: result.rows[0],
      // IMPORTANT: Return the actual token only once!
      apiToken: token,
      warning: 'Guarde este token em um local seguro. Você não poderá vê-lo novamente.',
    });
  } catch (error) {
    console.error('[Security] Error creating token:', error);
    return next(error);
  }
});

// Delete API token
router.delete('/tokens/:tokenId', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { tokenId } = req.params;

    // Delete token (only if it belongs to the user)
    const result = await query(
      'DELETE FROM api_tokens WHERE id = $1 AND user_id = $2 RETURNING id',
      [tokenId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Token não encontrado' });
    }

    return res.json({
      success: true,
      message: 'Token deletado com sucesso',
    });
  } catch (error) {
    console.error('[Security] Error deleting token:', error);
    return next(error);
  }
});

// ===== Password Change =====

// Change password
router.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword) {
      return res.status(400).json({ error: 'Senha atual é obrigatória' });
    }

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'A nova senha deve ter pelo menos 8 caracteres' });
    }

    // Get user's current password
    const userResult = await query(
      'SELECT password_hash, email, name FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const user = userResult.rows[0];

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Senha atual incorreta' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(newPassword, salt);

    // Update password
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, req.user.id]
    );

    // Send confirmation email
    try {
      const { sendEmail } = require('../services/email.service');
      await sendEmail({
        to: user.email,
        subject: 'Senha alterada com sucesso - LeadsFlow',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 30px; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">LeadsFlow</h1>
            </div>
            <div style="padding: 40px 30px; background: #ffffff;">
              <h2 style="color: #111827; margin-bottom: 20px;">Senha Alterada</h2>
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                Olá ${user.name || 'Usuário'},
              </p>
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                Sua senha foi alterada com sucesso em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.
              </p>
              <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
                Se você não fez essa alteração, entre em contato conosco imediatamente ou redefina sua senha.
              </p>
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
                <p style="color: #92400e; margin: 0; font-size: 14px;">
                  <strong>Dica de segurança:</strong> Nunca compartilhe sua senha com ninguém.
                </p>
              </div>
            </div>
            <div style="background: #f9fafb; padding: 20px 30px; text-align: center;">
              <p style="color: #6b7280; font-size: 12px; margin: 0;">
                Este é um email automático. Por favor, não responda.
              </p>
              <p style="color: #9ca3af; font-size: 11px; margin-top: 10px;">
                © ${new Date().getFullYear()} LeadsFlow. Todos os direitos reservados.
              </p>
            </div>
          </div>
        `,
      });
      console.log('[Security] Password change confirmation email sent to:', user.email);
    } catch (emailError) {
      console.error('[Security] Error sending password change email:', emailError);
      // Don't fail the request if email fails
    }

    return res.json({
      success: true,
      message: 'Senha alterada com sucesso',
    });
  } catch (error) {
    console.error('[Security] Error changing password:', error);
    return next(error);
  }
});

export default router;
