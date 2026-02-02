/**
 * Mock Authentication System
 * Allows the app to work completely offline without Supabase connection
 */

interface MockUser {
  id: string;
  email: string;
  name: string;
  password: string; // Stored hashed in real implementation
  created_at: string;
  avatar_url?: string; // ✅ Padronizado
  isVerified: boolean;
  verificationCode?: string;
  verificationRequestedAt?: string;
}

interface MockSession {
  user: {
    id: string;
    email: string;
    name: string;
    avatar_url?: string; // ✅ Padronizado
  };
  access_token: string;
  refresh_token: string;
  expires_at: string;
}

const STORAGE_KEY = 'leadflow_mock_users';
const SESSION_KEY = 'leadflow_mock_session';
const SESSION_EXPIRY_KEY = 'leadflow_session_expires_at';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const VERIFICATION_EXPIRATION_MIN = 15;

// Simple hash function (in production, use bcrypt or similar)
function simpleHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

// Generate mock token
function generateToken(): string {
  return 'mock_token_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function isCodeExpired(requestedAt?: string): boolean {
  if (!requestedAt) {
    return true;
  }
  const requested = new Date(requestedAt).getTime();
  return Date.now() - requested > VERIFICATION_EXPIRATION_MIN * 60 * 1000;
}

function setSessionExpiry(): void {
  try {
    localStorage.setItem(SESSION_EXPIRY_KEY, String(Date.now() + SESSION_TTL_MS));
  } catch (error) {
    console.error('[MockAuth] Failed to persist session expiry:', error);
  }
}

function clearSessionExpiry(): void {
  try {
    localStorage.removeItem(SESSION_EXPIRY_KEY);
  } catch (error) {
    console.error('[MockAuth] Failed to clear session expiry:', error);
  }
}

function isSessionExpired(): boolean {
  try {
    const raw = localStorage.getItem(SESSION_EXPIRY_KEY);
    if (!raw) {
      return !!localStorage.getItem('leadflow_access_token');
    }
    const value = Number(raw);
    if (Number.isNaN(value)) {
      return true;
    }
    return Date.now() > value;
  } catch (error) {
    console.error('[MockAuth] Failed to read session expiry:', error);
    return true;
  }
}

// Get all users from localStorage
function getUsers(): MockUser[] {
  const usersJson = localStorage.getItem(STORAGE_KEY);
  return usersJson ? JSON.parse(usersJson) : [];
}

// Save users to localStorage
function saveUsers(users: MockUser[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(users));
}

// Get current session
function getSession(): MockSession | null {
  const sessionJson = localStorage.getItem(SESSION_KEY);
  return sessionJson ? JSON.parse(sessionJson) : null;
}

// Save session
function saveSession(session: MockSession | null): void {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

interface MockAuthResponse {
  success: boolean;
  user?: any;
  error?: string;
  code?: string;
  requiresEmailConfirmation?: boolean;
}

export const mockAuth = {
  /**
   * Sign up a new user
   */
  signup: async (email: string, password: string, name: string): Promise<MockAuthResponse> => {
    console.log('[MockAuth] 📝 Signup attempt:', email);
    
    // Validate input
    if (!email || !password || !name) {
      return { success: false, error: 'Todos os campos são obrigatórios' };
    }
    
    if (password.length < 6) {
      return { success: false, error: 'Senha deve ter no mínimo 6 caracteres' };
    }
    
    // Check if user already exists
    const users = getUsers();
    const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (existingUser) {
      return { 
        success: false, 
        error: 'Este email já está cadastrado. Se você esqueceu sua senha, use a opção "Esqueceu a senha?" na tela de login.' 
      };
    }
    
    // Create new user
    const newUser: MockUser = {
      id: 'mock_user_' + Date.now(),
      email: email.toLowerCase(),
      name,
      password: simpleHash(password),
      created_at: new Date().toISOString(),
      isVerified: false,
      verificationCode: generateVerificationCode(),
      verificationRequestedAt: new Date().toISOString(),
    };
    
    users.push(newUser);
    saveUsers(users);
    
    console.log('[MockAuth] ✅ User created successfully:', email);
    console.log('[MockAuth] ℹ️  Verification required before login');
    
    return {
      success: true,
      requiresEmailConfirmation: true,
    };
  },

  /**
   * Sign in an existing user
   */
  signin: async (email: string, password: string): Promise<MockAuthResponse> => {
    console.log('[MockAuth] 🔐 Signin attempt:', email);
    
    // Validate input
    if (!email || !password) {
      return { success: false, error: 'Email e senha são obrigatórios' };
    }
    
    // Find user
    const users = getUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      return { 
        success: false, 
        error: 'Email ou senha incorretos. Verifique suas credenciais.\n\n💡 Dica: Se você ainda não tem conta, clique em "Criar conta grátis".' 
      };
    }
    
    if (typeof user.isVerified === 'undefined') {
      user.isVerified = true;
      saveUsers(users);
    }

    if (!user.isVerified) {
      return {
        success: false,
        error: 'Email não confirmado. Digite o código enviado ao seu email.',
        code: 'EMAIL_NOT_CONFIRMED',
      };
    }

    // Check password
    if (user.password !== simpleHash(password)) {
      return { 
        success: false, 
        error: 'Email ou senha incorretos. Verifique suas credenciais.' 
      };
    }
    
    // Create session
    const session: MockSession = {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar_url: user.avatar_url, // ✅ Padronizado
      },
      access_token: generateToken(),
      refresh_token: generateToken(),
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    };
    
    saveSession(session);
    
    // Also save tokens in the expected format
    localStorage.setItem('leadflow_access_token', session.access_token);
    localStorage.setItem('leadflow_refresh_token', session.refresh_token);
    setSessionExpiry();
    
    console.log('[MockAuth] ✅ Signin successful:', email);
    
    return {
      success: true,
      user: session.user,
    };
  },

  /**
   * Sign out current user
   */
  signout: async (): Promise<{ success: boolean }> => {
    console.log('[MockAuth] 👋 Signout');
    
    saveSession(null);
    localStorage.removeItem('leadflow_access_token');
    localStorage.removeItem('leadflow_refresh_token');
    clearSessionExpiry();
    
    return { success: true };
  },

  resendConfirmation: async (email: string): Promise<{ success: boolean; error?: string }> => {
    const users = getUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return { success: false, error: 'Conta não encontrada.' };
    }

    if (user.isVerified) {
      return { success: false, error: 'Conta já confirmada.' };
    }

    user.verificationCode = generateVerificationCode();
    user.verificationRequestedAt = new Date().toISOString();
    saveUsers(users);

    return { success: true };
  },

  verifyEmail: async (email: string, code: string): Promise<MockAuthResponse> => {
    const users = getUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return { success: false, error: 'Conta não encontrada.' };
    }

    if (user.isVerified) {
      return { success: true };
    }

    if (isCodeExpired(user.verificationRequestedAt)) {
      return {
        success: false,
        error: 'Código expirado. Solicite um novo email de confirmação.',
        code: 'VERIFICATION_EXPIRED',
      };
    }

    if (!code || user.verificationCode !== code.trim()) {
      return {
        success: false,
        error: 'Código inválido. Verifique o email e tente novamente.',
        code: 'INVALID_VERIFICATION_CODE',
      };
    }

    user.isVerified = true;
    user.verificationCode = undefined;
    user.verificationRequestedAt = undefined;
    saveUsers(users);

    return { success: true };
  },

  /**
   * Get current session
   */
  getSession: async (): Promise<{ data: { session: MockSession | null } }> => {
    const session = getSession();
    
    if (session) {
      if (isSessionExpired()) {
        console.log('[MockAuth] ⚠️  Session expired by TTL');
        saveSession(null);
        clearSessionExpiry();
        return { data: { session: null } };
      }
    }
    
    // Check if session is expired
    if (session && new Date(session.expires_at) < new Date()) {
      console.log('[MockAuth] ⚠️  Session expired');
      saveSession(null);
      return { data: { session: null } };
    }
    
    return { data: { session } };
  },

  /**
   * Get current user
   */
  getUser: async (): Promise<{ data: { user: MockSession['user'] | null } }> => {
    const session = getSession();
    return { data: { user: session?.user || null } };
  },

  /**
   * Update user profile
   */
  updateProfile: async (updates: { name?: string; avatar?: string; avatar_url?: string }): Promise<{ success: boolean; user?: any; error?: string }> => {
    const session = getSession();
    
    if (!session) {
      return { success: false, error: 'Você precisa estar logado' };
    }
    
    // Update in users list
    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === session.user.id);
    
    if (userIndex === -1) {
      return { success: false, error: 'Usuário não encontrado' };
    }
    
    // Update user
    if (updates.name) {
      users[userIndex].name = updates.name;
      session.user.name = updates.name;
    }
    
    if (updates.avatar) {
      users[userIndex].avatar_url = updates.avatar; // ✅ Padronizado
      session.user.avatar_url = updates.avatar; // ✅ Padronizado
    }
    
    if (updates.avatar_url) {
      users[userIndex].avatar_url = updates.avatar_url; // ✅ Padronizado
      session.user.avatar_url = updates.avatar_url; // ✅ Padronizado
    }
    
    saveUsers(users);
    saveSession(session);
    
    console.log('[MockAuth] ✅ Profile updated');
    
    return {
      success: true,
      user: session.user,
    };
  },

  /**
   * Reset password (mock - just shows success)
   */
  resetPassword: async (email: string): Promise<{ success: boolean; error?: string }> => {
    console.log('[MockAuth] 📧 Password reset requested for:', email);
    
    // In mock mode, always succeed
    return {
      success: true,
    };
  },

  /**
   * Check if mock auth is available
   */
  isAvailable: (): boolean => {
    return true;
  },
};

export default mockAuth;
