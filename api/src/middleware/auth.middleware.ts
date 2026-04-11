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
      
      // Determine descriptive action based on method + path
      const method = req.method.toUpperCase();
      const path = req.path.toLowerCase();
      let actionDescription = 'Ativo na plataforma';
      let feature = 'general';

      if (path.includes('/leads')) {
        feature = 'leads';
        if (method === 'POST') actionDescription = 'Criou um novo lead';
        else if (method === 'PUT' || method === 'PATCH') actionDescription = 'Atualizou um lead';
        else if (method === 'DELETE') actionDescription = 'Excluiu um lead';
        else actionDescription = 'Visualizou leads';
      } else if (path.includes('/contacts')) {
        feature = 'contacts';
        if (method === 'POST') actionDescription = 'Criou um contato';
        else if (method === 'PUT' || method === 'PATCH') actionDescription = 'Atualizou um contato';
        else if (method === 'DELETE') actionDescription = 'Excluiu um contato';
        else actionDescription = 'Visualizou contatos';
      } else if (path.includes('/inbox') || path.includes('/messages')) {
        feature = 'inbox';
        if (method === 'POST') actionDescription = 'Enviou uma mensagem';
        else actionDescription = 'Abriu o Inbox';
      } else if (path.includes('/conversations')) {
        feature = 'inbox';
        actionDescription = 'Visualizou conversas';
      } else if (path.includes('/campaigns')) {
        feature = 'campaigns';
        if (method === 'POST') actionDescription = 'Criou uma campanha';
        else if (method === 'PUT' || method === 'PATCH') actionDescription = 'Editou uma campanha';
        else if (method === 'DELETE') actionDescription = 'Excluiu uma campanha';
        else actionDescription = 'Visualizou campanhas';
      } else if (path.includes('/analytics')) {
        feature = 'analytics';
        actionDescription = 'Visualizou relatórios de analytics';
      } else if (path.includes('/channels')) {
        feature = 'channels';
        if (method === 'POST') actionDescription = 'Adicionou um canal';
        else if (method === 'PUT' || method === 'PATCH') actionDescription = 'Configurou um canal';
        else actionDescription = 'Visualizou canais';
      } else if (path.includes('/assistants') || path.includes('/ai-assistants')) {
        feature = 'assistants';
        if (method === 'POST') actionDescription = 'Criou um assistente de IA';
        else if (method === 'PUT' || method === 'PATCH') actionDescription = 'Editou assistente de IA';
        else actionDescription = 'Visualizou assistentes de IA';
      } else if (path.includes('/plans')) {
        feature = 'billing';
        if (path.includes('/checkout')) actionDescription = 'Iniciou checkout de plano';
        else actionDescription = 'Visualizou planos';
      } else if (path.includes('/integrations')) {
        feature = 'integrations';
        if (method === 'POST') actionDescription = 'Adicionou uma integração';
        else if (method === 'PUT' || method === 'PATCH') actionDescription = 'Editou uma integração';
        else actionDescription = 'Configurou integrações';
      } else if (path.includes('/admin')) {
        feature = 'admin';
        actionDescription = 'No painel administrativo';
      } else if (path.includes('/settings')) {
        feature = 'settings';
        if (method === 'PUT' || method === 'PATCH') actionDescription = 'Atualizou configurações';
        else actionDescription = 'Nas configurações';
      } else if (path.includes('/auth')) {
        feature = 'auth';
        if (path.includes('/login')) actionDescription = 'Realizou login';
        else if (path.includes('/register')) actionDescription = 'Realizou cadastro';
        else actionDescription = 'Na autenticação';
      }

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
          feature,
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
