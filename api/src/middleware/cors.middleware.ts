import cors, { CorsOptions } from 'cors';
import { config } from '../config/env';

const allowedOrigins = config.corsOrigins;

// Validate CORS configuration on startup
if (allowedOrigins.length === 0) {
  console.warn(
    '[WARNING] CORS_ORIGINS is not configured. ' +
    'Set CORS_ORIGINS environment variable with allowed origins (comma-separated).'
  );
}

const options: CorsOptions = {
  origin: (origin, callback) => {
    // If no origins configured, block all requests
    if (allowedOrigins.length === 0) {
      return callback(new Error('CORS is not configured. Set CORS_ORIGINS environment variable.'));
    }

    // Allow requests with no origin (e.g., mobile apps, Postman) only in development
    if (!origin) {
      const isDevelopment = process.env.NODE_ENV !== 'production';
      if (isDevelopment) {
        return callback(null, true);
      }
      return callback(new Error('Origin header is required'));
    }

    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

export const corsMiddleware = cors(options);
