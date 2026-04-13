const parseOrigins = () => {
  const raw = process.env.CORS_ORIGINS || '';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

/**
 * Tunnel/preview wildcard patterns — e.g. "*.loca.lt,*.ngrok.io"
 * Set CORS_TUNNEL_PATTERNS in .env to allow dynamic tunnel URLs without
 * touching CORS_ORIGINS every time the tunnel restarts.
 * Only active when NODE_ENV !== 'production' OR CORS_TUNNEL_PATTERNS is set explicitly.
 */
const parseTunnelPatterns = (): RegExp[] => {
  const raw = process.env.CORS_TUNNEL_PATTERNS || '';
  if (!raw.trim()) return [];
  return raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((pattern) => {
      // Convert glob-style *.loca.lt → regex
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^.]+');
      return new RegExp(`^https?:\/\/${escaped}$`, 'i');
    });
};

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret || secret === 'change-me' || secret === 'change_me_in_production') {
    throw new Error(
      'JWT_SECRET is not configured or using default value. ' +
      'Set a strong JWT_SECRET environment variable before starting the server.'
    );
  }

  if (secret.length < 32) {
    console.warn(
      '[WARNING] JWT_SECRET is too short (< 32 characters). ' +
      'Use a longer secret for better security.'
    );
  }

  return secret;
};

export const config = {
  corsOrigins: parseOrigins(),
  corsTunnelPatterns: parseTunnelPatterns(),
  jwtSecret: getJwtSecret(),
};
