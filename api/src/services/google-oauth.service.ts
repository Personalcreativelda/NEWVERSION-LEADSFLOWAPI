import crypto from 'crypto';

// Google OAuth 2.0 Configuration
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
}

// Store for state tokens (in production, use Redis or database)
const stateTokens = new Map<string, { createdAt: number; redirectUrl?: string }>();

// Clean up old state tokens every 10 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 minutes
  for (const [state, data] of stateTokens.entries()) {
    if (now - data.createdAt > maxAge) {
      stateTokens.delete(state);
    }
  }
}, 10 * 60 * 1000);

export class GoogleOAuthService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';

    // Use API_URL for the callback (where Google sends the code)
    // This should be the API domain, not the frontend
    const apiUrl = process.env.API_URL || process.env.VITE_API_URL || 'http://localhost:4000';
    this.redirectUri = `${apiUrl.replace(/\/$/, '')}/api/auth/google/callback`;

    if (!this.clientId || !this.clientSecret) {
      console.warn('[GoogleOAuth] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured');
    } else {
      console.log('[GoogleOAuth] Configured with redirect URI:', this.redirectUri);
    }
  }

  isConfigured(): boolean {
    return !!(this.clientId && this.clientSecret);
  }

  /**
   * Generate the Google OAuth authorization URL
   */
  getAuthorizationUrl(frontendRedirectUrl?: string): { url: string; state: string } {
    if (!this.isConfigured()) {
      throw new Error('Google OAuth não está configurado. Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.');
    }

    // Generate a random state token for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    stateTokens.set(state, {
      createdAt: Date.now(),
      redirectUrl: frontendRedirectUrl
    });

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
      state: state,
    });

    const url = `${GOOGLE_AUTH_URL}?${params.toString()}`;
    console.log('[GoogleOAuth] Generated auth URL with state:', state.substring(0, 10) + '...');

    return { url, state };
  }

  /**
   * Validate the state token from OAuth callback
   */
  validateState(state: string): { valid: boolean; redirectUrl?: string } {
    const data = stateTokens.get(state);
    if (!data) {
      return { valid: false };
    }

    // Check if token is expired (10 minutes max)
    const maxAge = 10 * 60 * 1000;
    if (Date.now() - data.createdAt > maxAge) {
      stateTokens.delete(state);
      return { valid: false };
    }

    // Delete the state token after use (one-time use)
    stateTokens.delete(state);

    return { valid: true, redirectUrl: data.redirectUrl };
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
    if (!this.isConfigured()) {
      throw new Error('Google OAuth não está configurado');
    }

    console.log('[GoogleOAuth] Exchanging code for tokens...');

    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
    });

    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[GoogleOAuth] Token exchange failed:', error);
      throw new Error('Falha ao autenticar com Google. Por favor, tente novamente.');
    }

    const tokens = await response.json() as GoogleTokenResponse;
    console.log('[GoogleOAuth] Token exchange successful');

    return tokens;
  }

  /**
   * Get user info from Google using access token
   */
  async getUserInfo(accessToken: string): Promise<GoogleUserInfo> {
    console.log('[GoogleOAuth] Fetching user info...');

    const response = await fetch(GOOGLE_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[GoogleOAuth] Failed to get user info:', error);
      throw new Error('Falha ao obter informações do usuário Google.');
    }

    const userInfo = await response.json() as GoogleUserInfo;
    console.log('[GoogleOAuth] User info retrieved:', { email: userInfo.email, name: userInfo.name });

    return userInfo;
  }

  /**
   * Complete OAuth flow: exchange code and get user info
   */
  async completeOAuthFlow(code: string): Promise<{
    email: string;
    name?: string;
    avatar_url?: string;
    provider: string;
  }> {
    // Exchange code for tokens
    const tokens = await this.exchangeCodeForTokens(code);

    // Get user info
    const userInfo = await this.getUserInfo(tokens.access_token);

    if (!userInfo.email) {
      throw new Error('Email não disponível na conta Google.');
    }

    return {
      email: userInfo.email,
      name: userInfo.name || userInfo.given_name,
      avatar_url: userInfo.picture,
      provider: 'google',
    };
  }

  getRedirectUri(): string {
    return this.redirectUri;
  }
}

export const googleOAuthService = new GoogleOAuthService();
