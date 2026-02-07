import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../database/connection';
import { config } from '../config/env';
import { emailService } from './email.service';

const REFRESH_TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const PASSWORD_RESET_TTL = 60 * 60 * 1000; // 1 hour
const EMAIL_CONFIRMATION_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Demo/Admin accounts - Only use env vars for security
// These endpoints should be DISABLED in production
const getDemoAccount = () => ({
  email: process.env.DEMO_EMAIL || '',
  password: process.env.DEMO_PASSWORD || '',
  name: process.env.DEMO_NAME || 'Demo User',
  role: 'user',
});

const getAdminAccount = () => ({
  email: process.env.ADMIN_EMAIL || '',
  password: process.env.ADMIN_PASSWORD || '',
  name: process.env.ADMIN_NAME || 'Leadflow Admin',
  role: 'admin',
});

// Check if demo/admin setup is allowed (should be disabled in production)
const isSetupAllowed = () => {
  return process.env.ALLOW_SETUP === 'true';
};

interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  name?: string;
  avatar_url?: string;
  role?: string;
  is_active: boolean;
  email_verified: boolean;
  subscription_plan?: string;
  subscription_status?: string;
  subscription_expires_at?: string;
}

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const parseSettingValue = <T>(value: unknown): T | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  return value as T;
};

const sanitizeUser = (user: DbUser) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  avatar_url: user.avatar_url,
  role: user.role,
  email_verified: user.email_verified,
  subscription_plan: user.subscription_plan || 'free',
  subscription_status: user.subscription_status || 'active',
  subscription_expires_at: user.subscription_expires_at || null,
  plan: user.subscription_plan || 'free', // Alias for frontend compatibility
});

const buildSessionResponse = (user: DbUser, session: { accessToken: string; refreshToken: string; expiresAt: Date }) => ({
  user: sanitizeUser(user),
  session: {
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    expires_at: session.expiresAt.toISOString(),
    token_type: 'bearer',
  },
});

export class AuthService {
  private generateAccessToken(user: DbUser) {
    return jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      config.jwtSecret,
      { expiresIn: '24h' }
    );
  }

  private async createSession(user: DbUser, ip?: string, userAgent?: string) {
    const refreshToken = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL);
    const tokenHash = hashToken(refreshToken);

    await query(
      'INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
      [user.id, tokenHash, expiresAt, ip || null, userAgent || null]
    );

    return {
      accessToken: this.generateAccessToken(user),
      refreshToken,
      expiresAt,
    };
  }

  private async getUserByEmail(email: string): Promise<DbUser | null> {
    const result = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    return result.rows[0] || null;
  }

  private async getUserById(id: string): Promise<DbUser | null> {
    const result = await query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  private async upsertSystemUser(options: { email: string; password: string; name?: string; role?: string }) {
    const passwordHash = await bcrypt.hash(options.password, 12);
    const result = await query(
      `INSERT INTO users (email, password_hash, name, role, email_verified, is_active)
       VALUES ($1, $2, $3, $4, true, true)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         name = COALESCE(EXCLUDED.name, users.name),
         role = EXCLUDED.role,
         email_verified = true,
         is_active = true,
         updated_at = NOW()
       RETURNING *`,
      [options.email.toLowerCase().trim(), passwordHash, options.name || null, options.role || 'user']
    );

    return result.rows[0] as DbUser;
  }

  async register(data: { email: string; password: string; metadata?: Record<string, any> }) {
    const email = data.email.toLowerCase().trim();
    const existing = await this.getUserByEmail(email);
    if (existing) {
      throw new Error('Email already registered');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const name = data.metadata?.name || data.metadata?.fullName || data.metadata?.nome || null;

    // Check if email confirmation is enabled
    const requiresConfirmation = process.env.REQUIRE_EMAIL_CONFIRMATION === 'true';

    const result = await query(
      `INSERT INTO users (email, password_hash, name, email_verified, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [email, passwordHash, name, !requiresConfirmation, true]
    );

    const user = result.rows[0] as DbUser;

    // Send confirmation email if required
    if (requiresConfirmation) {
      // Generate 6-digit confirmation token
      const token = crypto.randomInt(100000, 999999).toString();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + EMAIL_CONFIRMATION_TTL).toISOString();

      const value = JSON.stringify({ token_hash: tokenHash, expires_at: expiresAt });
      await query(
        `INSERT INTO settings (user_id, key, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [user.id, 'email_confirmation', value]
      );

      // Send confirmation email
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      try {
        await emailService.sendEmailConfirmation(email, token, appUrl);
        console.log(`[AuthService] Confirmation email sent to ${email}`);
      } catch (error) {
        console.error(`[AuthService] Failed to send confirmation email to ${email}:`, error);
      }

      // Return without session - user needs to confirm email
      return {
        success: true,
        requiresEmailConfirmation: true,
        user: sanitizeUser(user),
      };
    }

    // If confirmation not required, create session and send welcome email
    const session = await this.createSession(user);

    // Send welcome email
    try {
      await emailService.sendWelcomeEmail(email, name || 'User');
    } catch (error) {
      console.error(`[AuthService] Failed to send welcome email to ${email}:`, error);
    }

    return buildSessionResponse(user, session);
  }

  async login(email: string, password: string) {
    const user = await this.getUserByEmail(email);
    if (!user || !user.is_active) {
      throw new Error('Invalid credentials');
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      throw new Error('Invalid credentials');
    }

    // Check if email confirmation is required and not yet verified
    const requiresConfirmation = process.env.REQUIRE_EMAIL_CONFIRMATION === 'true';
    if (requiresConfirmation && !user.email_verified) {
      const error = new Error('Email não confirmado. Por favor, confirme seu email para continuar.') as Error & { code?: string };
      error.code = 'EMAIL_NOT_CONFIRMED';
      throw error;
    }

    const session = await this.createSession(user);
    return buildSessionResponse(user, session);
  }

  async loginWithOAuth(data: { email: string; name?: string; avatar_url?: string; provider: string }) {
    const email = data.email.toLowerCase().trim();

    // Try to find existing user
    let user = await this.getUserByEmail(email);

    if (!user) {
      // Create new user with OAuth provider
      // Since there's no password for OAuth users, we generate a random one that can't be used
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 12);

      const result = await query(
        `INSERT INTO users (email, password_hash, name, avatar_url, email_verified, is_active)
         VALUES ($1, $2, $3, $4, true, true)
         RETURNING *`,
        [email, passwordHash, data.name || null, data.avatar_url || null]
      );

      user = result.rows[0] as DbUser;
      console.log(`[Auth] Created new user via ${data.provider} OAuth:`, email);
    } else {
      // Update avatar and name if provided
      if (data.name || data.avatar_url) {
        await query(
          `UPDATE users SET
            name = COALESCE($1, name),
            avatar_url = COALESCE($2, avatar_url),
            email_verified = true,
            updated_at = NOW()
           WHERE id = $3`,
          [data.name || null, data.avatar_url || null, user.id]
        );

        // Refresh user data
        user = await this.getUserById(user.id) as DbUser;
      }
      console.log(`[Auth] Existing user logged in via ${data.provider} OAuth:`, email);
    }

    const session = await this.createSession(user);
    return buildSessionResponse(user, session);
  }

  async refreshSession(refreshToken: string) {
    if (!refreshToken) {
      throw new Error('refresh_token is required');
    }

    const tokenHash = hashToken(refreshToken);
    const sessionResult = await query('SELECT * FROM sessions WHERE token_hash = $1', [tokenHash]);
    const sessionRow = sessionResult.rows[0];

    if (!sessionRow) {
      throw new Error('Invalid refresh token');
    }

    if (new Date(sessionRow.expires_at).getTime() < Date.now()) {
      await query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
      throw new Error('Session expired');
    }

    await query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);

    const user = await this.getUserById(sessionRow.user_id);
    if (!user || !user.is_active) {
      throw new Error('User not found');
    }

    const session = await this.createSession(user, sessionRow.ip_address, sessionRow.user_agent);
    return buildSessionResponse(user, session);
  }

  async updatePassword(userId: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, userId]);
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) {
      return true;
    }

    const tokenHash = hashToken(refreshToken);
    await query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    return true;
  }

  async validateToken(token: string) {
    try {
      const payload = jwt.verify(token, config.jwtSecret) as { userId: string };
      const user = await this.getUserById(payload.userId);
      if (!user || !user.is_active) {
        return null;
      }
      return sanitizeUser(user);
    } catch {
      return null;
    }
  }

  async requestPasswordReset(email: string) {
    const user = await this.getUserByEmail(email);
    if (!user) {
      // Don't reveal if user exists
      console.log(`[AuthService] Password reset requested for non-existent email: ${email}`);
      return;
    }

    // Generate 6-digit token for easier user input
    const token = crypto.randomInt(100000, 999999).toString();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL).toISOString();

    const value = JSON.stringify({ token_hash: tokenHash, expires_at: expiresAt });
    await query(
      `INSERT INTO settings (user_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [user.id, 'password_reset', value]
    );

    // Send password reset email
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    try {
      await emailService.sendPasswordReset(email, token, appUrl);
      console.log(`[AuthService] Password reset email sent to ${email}`);
    } catch (error) {
      console.error(`[AuthService] Failed to send password reset email to ${email}:`, error);
      // Don't throw error - we don't want to reveal if email sending failed
    }
  }

  async completePasswordReset(email: string, token: string, newPassword: string) {
    const user = await this.getUserByEmail(email);
    if (!user) {
      throw new Error('User not found');
    }

    const settingsResult = await query(
      'SELECT value FROM settings WHERE user_id = $1 AND key = $2',
      [user.id, 'password_reset']
    );
    const settingsRow = settingsResult.rows[0];

    if (!settingsRow?.value) {
      throw new Error('Reset token not found');
    }

    const parsed = parseSettingValue<{ token_hash: string; expires_at: string }>(settingsRow.value);
    if (!parsed) {
      throw new Error('Reset token not found');
    }

    const { token_hash: storedHash, expires_at: expiresAt } = parsed;
    if (!storedHash || !expiresAt || new Date(expiresAt).getTime() < Date.now()) {
      throw new Error('Reset token expired');
    }

    if (storedHash !== hashToken(token)) {
      throw new Error('Invalid reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, user.id]);
    await query('DELETE FROM settings WHERE user_id = $1 AND key = $2', [user.id, 'password_reset']);
  }

  async verifyEmail(email: string) {
    const user = await this.getUserByEmail(email);
    if (!user) {
      throw new Error('User not found');
    }
    await query('UPDATE users SET email_verified = true WHERE id = $1', [user.id]);
  }

  async verifySignupOtp(email: string, token: string) {
    const user = await this.getUserByEmail(email);
    if (!user) {
      throw new Error('User not found');
    }

    // Get confirmation token from settings
    const settingsResult = await query(
      'SELECT value FROM settings WHERE user_id = $1 AND key = $2',
      [user.id, 'email_confirmation']
    );
    const settingsRow = settingsResult.rows[0];

    if (!settingsRow?.value) {
      throw new Error('Confirmation token not found');
    }

    const parsed = parseSettingValue<{ token_hash: string; expires_at: string }>(settingsRow.value);
    if (!parsed) {
      throw new Error('Confirmation token not found');
    }

    const { token_hash: storedHash, expires_at: expiresAt } = parsed;
    if (!storedHash || !expiresAt || new Date(expiresAt).getTime() < Date.now()) {
      throw new Error('Confirmation token expired');
    }

    if (storedHash !== hashToken(token)) {
      throw new Error('Invalid confirmation token');
    }

    // Mark email as verified and clean up token
    await query('UPDATE users SET email_verified = true WHERE id = $1', [user.id]);
    await query('DELETE FROM settings WHERE user_id = $1 AND key = $2', [user.id, 'email_confirmation']);

    // Send welcome email
    try {
      await emailService.sendWelcomeEmail(email, user.name || 'User');
    } catch (error) {
      console.error(`[AuthService] Failed to send welcome email to ${email}:`, error);
    }

    console.log(`[AuthService] Email verified for ${email}`);
  }

  async resendConfirmation(email: string) {
    const user = await this.getUserByEmail(email);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.email_verified) {
      throw new Error('Email already verified');
    }

    // Generate new 6-digit confirmation token
    const token = crypto.randomInt(100000, 999999).toString();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + EMAIL_CONFIRMATION_TTL).toISOString();

    const value = JSON.stringify({ token_hash: tokenHash, expires_at: expiresAt });
    await query(
      `INSERT INTO settings (user_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [user.id, 'email_confirmation', value]
    );

    // Send confirmation email
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    try {
      await emailService.sendEmailConfirmation(email, token, appUrl);
      console.log(`[AuthService] Confirmation email resent to ${email}`);
    } catch (error) {
      console.error(`[AuthService] Failed to resend confirmation email to ${email}:`, error);
      throw new Error('Failed to send confirmation email');
    }

    return true;
  }

  async setupDemoAccount() {
    if (!isSetupAllowed()) {
      throw new Error('Setup endpoints are disabled. Set ALLOW_SETUP=true to enable.');
    }

    const demoAccount = getDemoAccount();
    if (!demoAccount.email || !demoAccount.password) {
      throw new Error('Demo account credentials not configured. Set DEMO_EMAIL and DEMO_PASSWORD env vars.');
    }

    const user = await this.upsertSystemUser(demoAccount);
    return {
      success: true,
      needsWait: false,
      user: sanitizeUser(user),
      credentials: {
        email: demoAccount.email,
        password: demoAccount.password,
      },
    };
  }

  async setupAdminAccount() {
    if (!isSetupAllowed()) {
      throw new Error('Setup endpoints are disabled. Set ALLOW_SETUP=true to enable.');
    }

    const adminAccount = getAdminAccount();
    if (!adminAccount.email || !adminAccount.password) {
      throw new Error('Admin account credentials not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD env vars.');
    }

    const user = await this.upsertSystemUser(adminAccount);
    return {
      success: true,
      user: sanitizeUser(user),
      credentials: {
        email: adminAccount.email,
        password: adminAccount.password,
      },
    };
  }
}

const authService = new AuthService();

export const loginWithEmail = (email: string, password: string) => authService.login(email, password);
export const loginWithOAuth = (data: { email: string; name?: string; avatar_url?: string; provider: string }) =>
  authService.loginWithOAuth(data);
export const registerWithEmail = (email: string, password: string, metadata?: Record<string, any>) =>
  authService.register({ email, password, metadata });
export const logoutSession = (refreshToken?: string) => authService.logout(refreshToken);
export const refreshSession = (refreshToken: string) => authService.refreshSession(refreshToken);
export const requestPasswordReset = (email: string, _redirectTo?: string) => authService.requestPasswordReset(email);
export const resetPasswordWithToken = (email: string, token: string, password: string) =>
  authService.completePasswordReset(email, token, password);
export const updatePassword = (userId: string, password: string) => authService.updatePassword(userId, password);
export const verifySignupOtp = (email: string, token: string) => authService.verifySignupOtp(email, token);
export const resendSignupConfirmation = (email: string) => authService.resendConfirmation(email);
export const setupDemoAccount = () => authService.setupDemoAccount();
export const setupAdminAccount = () => authService.setupAdminAccount();

export { authService };
