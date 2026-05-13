import type { NextFunction, Request, Response } from 'express';
import { isPostgresError } from '../utils/postgres-error';

const mapPostgrestCodeToStatus = (code?: string): number => {
  switch (code) {
    case '23503': // foreign key violation
      return 409;
    case '23505': // unique violation
      return 409;
    case '23502': // not null violation
      return 400;
    case 'PGRST204':
      return 404;
    default:
      return 400;
  }
};

export const errorMiddleware = (
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) => {
  console.error('[API] Unhandled error:', error);

  // Ensure CORS headers are present on all error responses so browsers
  // can read the error body instead of seeing a generic CORS failure.
  const origin = req.headers.origin;
  if (origin && !res.headersSent) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (isPostgresError(error)) {
    return res.status(mapPostgrestCodeToStatus(error.code)).json({
      error: error.message,
      details: error.detail,
      hint: error.hint,
    });
  }

  if (error instanceof Error) {
    return res.status(500).json({
      error: error.message,
    });
  }

  return res.status(500).json({
    error: 'Internal server error',
  });
};
