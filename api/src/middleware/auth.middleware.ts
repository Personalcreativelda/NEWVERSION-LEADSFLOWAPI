import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { activityService } from '../services/activity.service';

const authService = new AuthService();

// Throttle active updates (once per 5 minutes per user)
const lastUpdateMap = new Map<string, number>();
const UPDATE_INTERVAL = 5 * 60 * 1000;

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

    // Track user activity (asynchronous, don't wait)
    const now = Date.now();
    const lastUpdate = lastUpdateMap.get(user.id) || 0;
    if (now - lastUpdate > UPDATE_INTERVAL) {
      lastUpdateMap.set(user.id, now);
      
      // Determine descriptive action based on path
      let actionDescription = 'Ativo na plataforma';
      const path = req.path.toLowerCase();
      
      if (path.includes('/admin')) actionDescription = 'No painel administrativo';
      else if (path.includes('/leads')) actionDescription = 'Gerenciando leads';
      else if (path.includes('/inbox') || path.includes('/messages')) actionDescription = 'No Inbox de mensagens';
      else if (path.includes('/campaigns')) actionDescription = 'Gerenciando campanhas';
      else if (path.includes('/analytics')) actionDescription = 'Analisando relatórios';
      else if (path.includes('/settings')) actionDescription = 'Nas configurações';
      else if (path.includes('/auth')) actionDescription = 'Na autenticação';

      // We don't await this to keep the auth response fast
      void activityService.updateLastActive(user.id);
      
      // Also log a general presence activity if this is a main entry point or first interaction in a while
      void activityService.logActivity({
        userId: user.id,
        type: 'presence',
        description: actionDescription,
        metadata: {
          path: req.path,
          method: req.method,
          ip: req.ip,
          userAgent: req.headers['user-agent']
        }
      });
    }

    next();
  } catch (error) {
    console.error('[Auth] Authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

export const authMiddleware = requireAuth;
