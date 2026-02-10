import cors, { CorsOptions } from 'cors';
import { config } from '../config/env';
import { RequestHandler } from 'express';

const allowedOrigins = config.corsOrigins;

// Validate CORS configuration on startup
if (allowedOrigins.length === 0) {
  console.warn(
    '[WARNING] CORS_ORIGINS is not configured. ' +
    'Set CORS_ORIGINS environment variable with allowed origins (comma-separated).'
  );
}

// Rotas que não precisam de Origin header (webhooks, APIs externas, OAuth callbacks, admin)
const noOriginRequiredPaths = [
  '/api/webhooks/',
  '/api/whatsapp/config',
  '/api/whatsapp/validate-numbers',  // N8N validation
  '/api/whatsapp/validate-leads',    // N8N validation
  '/api/auth/google',      // Google OAuth - navegação direta do browser
  '/api/auth/google/callback', // Google OAuth callback
  '/health'
];

const options: CorsOptions = {
  origin: (origin, callback) => {
    // If no origins configured, block all requests
    if (allowedOrigins.length === 0) {
      return callback(new Error('CORS is not configured. Set CORS_ORIGINS environment variable.'));
    }

    // Allow requests with no origin for webhooks and admin routes
    // These are checked in the middleware below
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

const corsHandler = cors(options);

// Middleware that checks origin requirements based on path
export const corsMiddleware: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;
  const path = req.path;

  // Check if this path doesn't require origin
  const isNoOriginRequired = noOriginRequiredPaths.some(p => path.startsWith(p));

  // If no origin and path requires it, block
  if (!origin && !isNoOriginRequired) {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    if (!isDevelopment) {
      return res.status(403).json({ error: 'Origin header is required' });
    }
  }

  // Apply cors handler
  corsHandler(req, res, next);
};
