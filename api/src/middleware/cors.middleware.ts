import cors, { CorsOptions } from 'cors';
import { config } from '../config/env';
import { RequestHandler } from 'express';

const isDev = process.env.NODE_ENV !== 'production';

// ── Build the definitive allowed-origins list ─────────────────────────────────
// Priority: CORS_ORIGINS env  >  APP_URL env  >  localhost (dev only)
function buildAllowedOrigins(): string[] {
  const fromEnv = config.corsOrigins; // parsed from CORS_ORIGINS

  // Automatically trust the configured front-end URL (APP_URL) so the app
  // works even when CORS_ORIGINS is not explicitly set in production.
  const appUrl = (process.env.APP_URL || '').trim().replace(/\/$/, '');

  const origins: string[] = [
    ...fromEnv,
    ...(appUrl && appUrl.startsWith('http') ? [appUrl] : []),
    // Always allow standard localhost dev ports in non-production
    ...(isDev
      ? [
          'http://localhost:3000',
          'http://localhost:5173',
          'http://localhost:4173',
          'http://localhost:8080',
        ]
      : []),
  ];

  // Deduplicate
  return [...new Set(origins.filter(Boolean))];
}

const allowedOrigins = buildAllowedOrigins();

if (allowedOrigins.length === 0) {
  console.warn(
    '[CORS] No allowed origins configured. ' +
    'Set CORS_ORIGINS and/or APP_URL environment variables.',
  );
} else {
  console.log('[CORS] Allowed origins:', allowedOrigins);
}

// ── Paths that don't require an Origin header ─────────────────────────────────
// (server-to-server callbacks, browser navigation, media proxies, etc.)
const noOriginRequiredPaths = [
  '/api/webhooks/',
  '/api/plans/stripe/webhook',
  '/api/whatsapp/config',
  '/api/whatsapp/validate-numbers',
  '/api/whatsapp/validate-leads',
  '/api/auth/google',
  '/api/auth/google/callback',
  '/api/inbox/media-proxy',
  '/health',
];

// ── Public widget API paths — allow ANY origin (embedded on external sites) ───
// These endpoints are hit by the /w chat widget which can be on any customer domain.
const publicWidgetPaths = [
  '/api/webhooks/website/',
  '/api/feedback/summary',
];

const options: CorsOptions = {
  origin: (origin, callback) => {
    // No Origin → server-to-server / curl / same-origin — allow
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) return callback(null, true);

    // In development be permissive to avoid friction
    if (isDev) {
      console.warn('[CORS] Unlisted origin allowed in dev mode:', origin);
      return callback(null, true);
    }

    return callback(new Error(`CORS: origin '${origin}' is not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24 h — browsers cache the preflight result
};

const corsHandler = cors(options);

// ── Main CORS middleware ───────────────────────────────────────────────────────
export const corsMiddleware: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;
  const path = req.path;

  const isNoOriginRequired = noOriginRequiredPaths.some(p => path.startsWith(p));
  const isPublicWidget = publicWidgetPaths.some(p => path.startsWith(p));

  // Widget public endpoints: allow any origin unconditionally
  if (isPublicWidget) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  }

  // Block origin-less requests to protected routes in production
  if (!origin && !isNoOriginRequired && !isDev) {
    return res.status(403).json({ error: 'Origin header is required' });
  }

  // Respond to OPTIONS preflight immediately — some proxies strip headers
  // unless we return 204 here before the real cors() handler does it.
  if (req.method === 'OPTIONS') {
    const isAllowed = !origin || allowedOrigins.includes(origin) || isDev;

    if (isAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
      res.setHeader('Access-Control-Max-Age', '86400');
      res.setHeader('Vary', 'Origin');
      return res.status(204).end();
    }
  }

  corsHandler(req, res, next);
};
