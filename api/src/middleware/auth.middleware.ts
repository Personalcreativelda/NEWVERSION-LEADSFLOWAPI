import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';

const authService = new AuthService();

interface AuthUser {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  role?: string;
  email_verified: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export type AuthenticatedRequest = Request & { user?: AuthUser };

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    console.log('[Auth] Request to:', req.path);
    console.log('[Auth] Authorization header present:', !!authHeader);
    
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('[Auth] No Bearer token provided');
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    console.log('[Auth] Token received (first 20 chars):', token.substring(0, 20) + '...');
    
    const user = await authService.validateToken(token);

    if (!user) {
      console.log('[Auth] Token validation failed - user is null');
      return res.status(401).json({ error: 'Invalid token' });
    }

    console.log('[Auth] User authenticated:', user.id, user.email);
    req.user = user;
    next();
  } catch (error) {
    console.error('[Auth] Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

export const authMiddleware = requireAuth;
