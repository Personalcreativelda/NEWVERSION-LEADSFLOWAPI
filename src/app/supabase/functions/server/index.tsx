// LeadsFlow API Server - Updated with getByPrefix fix
import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'npm:@supabase/supabase-js';
import Stripe from 'npm:stripe';
import * as kv from './kv_store.tsx';
import { activateSubscription, handleWebhook } from './paypal.tsx';
import * as notifications from './notifications.tsx';
import * as tasks from './tasks.tsx';
import campaignsApp from './campaigns.tsx';
import campaignsV2App from './campaigns-v2.tsx';

const app = new Hono();

// CORS middleware
app.use('*', cors());
app.use('*', logger(console.log));

// Initialize Supabase client
const getSupabaseClient = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    throw new Error('Missing Supabase credentials');
  }

  return createClient(supabaseUrl, supabaseKey);
};

// ============================================
// HELPER FUNCTIONS
// ============================================

// Helper function to check for duplicate leads
async function checkDuplicateLead(userId: string, email: string, telefone: string): Promise<boolean> {
  try {
    // Normalize input for comparison
    const normalizedEmail = email?.trim().toLowerCase() || '';
    const normalizedTelefone = telefone?.trim().replace(/\D/g, '') || ''; // Remove non-digits
    
    console.log(`[Duplicate Check] 🔍 Checking for duplicates:`, {
      userId,
      originalEmail: email,
      normalizedEmail,
      originalTelefone: telefone,
      normalizedTelefone
    });
    
    // Get all leads for this user
    const existingLeadsRaw = await kv.getByPrefix(`lead:${userId}:`);
    
    if (!existingLeadsRaw || existingLeadsRaw.length === 0) {
      console.log('[Duplicate Check] ✅ No existing leads found, no duplicates');
      return false; // No duplicates if no leads exist
    }
    
    console.log(`[Duplicate Check] 📊 Found ${existingLeadsRaw.length} existing leads to check`);
    
    // Check each existing lead
    for (let i = 0; i < existingLeadsRaw.length; i++) {
      const existingLead = existingLeadsRaw[i];
      
      // Skip if lead data is invalid
      if (!existingLead || typeof existingLead !== 'object') {
        console.log(`[Duplicate Check] ⚠️ Lead ${i} is invalid, skipping`);
        continue;
      }
      
      // Normalize existing lead data
      const existingEmail = (existingLead.email || '')?.trim().toLowerCase();
      const existingTelefone = (existingLead.telefone || existingLead.phone || '')?.trim().replace(/\D/g, '');
      
      // Check for email match (only if both emails exist and are not empty)
      if (normalizedEmail && existingEmail && normalizedEmail.length > 0 && normalizedEmail === existingEmail) {
        console.log(`[Duplicate Check] ❌ DUPLICATE FOUND - Email match:`, {
          leadId: existingLead.id,
          leadName: existingLead.nome,
          matchedEmail: normalizedEmail,
          existingEmail
        });
        return true;
      }
      
      // Check for phone match (only if both phones exist and are not empty)
      // Require at least 8 digits to avoid false positives
      if (normalizedTelefone && existingTelefone && 
          normalizedTelefone.length >= 8 && existingTelefone.length >= 8 &&
          normalizedTelefone === existingTelefone) {
        console.log(`[Duplicate Check] ❌ DUPLICATE FOUND - Phone match:`, {
          leadId: existingLead.id,
          leadName: existingLead.nome,
          matchedPhone: normalizedTelefone,
          existingPhone: existingTelefone
        });
        return true;
      }
    }
    
    console.log('[Duplicate Check] ✅ No duplicates found');
    return false; // No duplicates found
  } catch (error) {
    console.error('[Duplicate Check] ❌ ERROR checking for duplicates:', error);
    // On error, PREVENT creation to be safe
    return true; // Return true to prevent potential duplicate
  }
}

// ============================================================================
// NOVA FUNÇÃO: Encontrar lead duplicado e retornar o lead existente
// ============================================================================
async function findDuplicateLead(userId: string, email: string, telefone: string, nome: string): Promise<any | null> {
  try {
    // Normalize input for comparison
    const normalizedEmail = email?.trim().toLowerCase() || '';
    const normalizedTelefone = telefone?.trim().replace(/\D/g, '') || '';
    const normalizedNome = nome?.trim().toLowerCase() || '';
    
    console.log(`[Find Duplicate] 🔍 Searching for duplicate:`, {
      userId,
      normalizedEmail,
      normalizedTelefone,
      normalizedNome
    });
    
    // Get all leads for this user
    const existingLeadsRaw = await kv.getByPrefix(`lead:${userId}:`);
    
    if (!existingLeadsRaw || existingLeadsRaw.length === 0) {
      console.log('[Find Duplicate] ✅ No existing leads found');
      return null;
    }
    
    // Priority 1: Check by phone (most reliable)
    if (normalizedTelefone && normalizedTelefone.length >= 8) {
      for (const lead of existingLeadsRaw) {
        if (!lead || typeof lead !== 'object') continue;
        
        const existingTelefone = (lead.telefone || lead.phone || '')?.trim().replace(/\D/g, '');
        
        if (existingTelefone && existingTelefone.length >= 8 && normalizedTelefone === existingTelefone) {
          console.log(`[Find Duplicate] ✅ FOUND by PHONE: ${lead.nome} (${lead.id})`);
          return lead;
        }
      }
    }
    
    // Priority 2: Check by email
    if (normalizedEmail && normalizedEmail.length > 0) {
      for (const lead of existingLeadsRaw) {
        if (!lead || typeof lead !== 'object') continue;
        
        const existingEmail = (lead.email || '')?.trim().toLowerCase();
        
        if (existingEmail && existingEmail.length > 0 && normalizedEmail === existingEmail) {
          console.log(`[Find Duplicate] ✅ FOUND by EMAIL: ${lead.nome} (${lead.id})`);
          return lead;
        }
      }
    }
    
    // Priority 3: Check by name (only if phone and email are both empty)
    if ((!normalizedTelefone || normalizedTelefone.length < 8) && (!normalizedEmail || normalizedEmail.length === 0)) {
      if (normalizedNome && normalizedNome.length > 0) {
        for (const lead of existingLeadsRaw) {
          if (!lead || typeof lead !== 'object') continue;
          
          const existingNome = (lead.nome || '')?.trim().toLowerCase();
          
          if (existingNome && existingNome === normalizedNome) {
            console.log(`[Find Duplicate] ✅ FOUND by NAME: ${lead.nome} (${lead.id})`);
            return lead;
          }
        }
      }
    }
    
    console.log('[Find Duplicate] ❌ No duplicate found');
    return null;
  } catch (error) {
    console.error('[Find Duplicate] ❌ ERROR:', error);
    return null;
  }
}

// ============================================================================
// NOVA FUNÇÃO: Deduplicar array de leads da planilha
// ============================================================================
function uniqueByPhoneOrEmail(leads: any[]): any[] {
  console.log(`[Deduplicate] 🔍 Deduplicating ${leads.length} leads from sheet...`);
  
  const seen = new Map<string, any>();

  leads.forEach((item, index) => {
    // Normalize fields
    const telefone = (item.telefone || item.phone || item.Telefone || item.Phone || '')?.trim().replace(/\D/g, '');
    const email = (item.email || item.Email || '')?.trim().toLowerCase();
    const nome = (item.nome || item.name || item.Nome || item.Name || '')?.trim().toLowerCase();
    
    // Create unique key (priority: phone > email > name)
    let key = '';
    if (telefone && telefone.length >= 8) {
      key = `phone:${telefone}`;
    } else if (email && email.length > 0) {
      key = `email:${email}`;
    } else if (nome && nome.length > 0) {
      key = `name:${nome}`;
    } else {
      // No valid identifier, skip
      console.warn(`[Deduplicate] ⚠️ Lead #${index + 1} has no valid identifier (phone/email/name), skipping`);
      return;
    }
    
    if (!seen.has(key)) {
      console.log(`[Deduplicate] ✅ NEW unique lead: ${key}`);
      seen.set(key, item);
    } else {
      // Update with more recent data (merge)
      console.log(`[Deduplicate] 🔄 DUPLICATE in sheet, updating: ${key}`);
      const existing = seen.get(key);
      seen.set(key, { ...existing, ...item });
    }
  });

  const uniqueLeads = Array.from(seen.values());
  console.log(`[Deduplicate] ✅ Deduplicated: ${leads.length} → ${uniqueLeads.length} unique leads`);
  
  return uniqueLeads;
}

// ============================================================================
// NOVA FUNÇÃO: Notificar webhook N8N quando eventos ocorrem
// ============================================================================
async function notifyN8NWebhook(webhookUrl: string, eventType: string, data: any): Promise<void> {
  if (!webhookUrl || webhookUrl.trim() === '') {
    console.log('[N8N Notify] ⏭️ Skipping notification - no webhook URL configured');
    return;
  }

  try {
    console.log('========================================');
    console.log('[N8N Notify] 🚀 STARTING WEBHOOK NOTIFICATION');
    console.log('[N8N Notify] Event type:', eventType);
    console.log('[N8N Notify] Webhook URL:', webhookUrl);
    console.log('========================================');
    
    const payload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data: data
    };
    
    console.log('[N8N Notify] 📦 Full payload:', JSON.stringify(payload, null, 2));
    console.log('[N8N Notify] 🌐 Initiating HTTP POST request...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout

    console.log('[N8N Notify] ⏳ Sending fetch request NOW...');
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'LeadsFlow-API/1.0',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    console.log('[N8N Notify] 📨 Response received!');

    const responseText = await response.text();
    console.log(`[N8N Notify] Response status: ${response.status}`);
    console.log(`[N8N Notify] Response headers:`, JSON.stringify([...response.headers.entries()]));
    console.log(`[N8N Notify] Response body: ${responseText}`);

    if (response.ok) {
      console.log(`[N8N Notify] ✅✅✅ Webhook notified SUCCESSFULLY (${response.status})`);
    } else {
      console.warn(`[N8N Notify] ⚠️ Webhook returned non-OK status: ${response.status} - ${responseText}`);
    }
    console.log('========================================');
  } catch (error: any) {
    console.log('========================================');
    console.error('[N8N Notify] ❌ ERROR OCCURRED');
    // Não lançar erro - webhook é opcional e não deve bloquear operação principal
    if (error.name === 'AbortError') {
      console.error('[N8N Notify] ⚠️ Webhook notification timeout (10s)');
    } else {
      console.error('[N8N Notify] ⚠️ Failed to notify webhook:', error.message);
      console.error('[N8N Notify] ⚠️ Error stack:', error.stack);
      console.error('[N8N Notify] ⚠️ Error details:', JSON.stringify(error, null, 2));
    }
    console.log('========================================');
    throw error; // Re-lançar para ser capturado pelo try/catch em cada rota
  }
}

// ============================================
// AUTHENTICATION ROUTES
// ============================================

// Health Check
app.get('/make-server-4be966ab/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Test KV Store
app.get('/make-server-4be966ab/test-kv', async (c) => {
  try {
    await kv.set('test-key', { message: 'Hello KV Store!' });
    const value = await kv.get('test-key');
    return c.json({ success: true, value });
  } catch (error) {
    console.error('KV test error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Setup Demo Account (for development/testing)
app.post('/make-server-4be966ab/auth/setup-demo', async (c) => {
  try {
    const demoEmail = 'demo@leadflow.com';
    const demoPassword = 'demo123456';
    const demoName = 'Demo User';

    const supabase = getSupabaseClient();

    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u) => u.email === demoEmail);

    let userId: string;

    if (existingUser) {
      console.log('Demo user already exists, updating password...');
      userId = existingUser.id;

      // Update user password and confirm email
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        userId,
        {
          password: demoPassword,
          email_confirm: true,
          user_metadata: { name: demoName },
        }
      );

      if (updateError) {
        console.error('Error updating demo user:', updateError);
        return c.json({ error: updateError.message }, 400);
      }

      console.log('Demo user updated successfully');
      
      // Longer delay to ensure update is committed
      await new Promise(resolve => setTimeout(resolve, 1500));
    } else {
      console.log('Demo user does not exist, creating...');

      // Create new demo user
      const { data, error: createError } = await supabase.auth.admin.createUser({
        email: demoEmail,
        password: demoPassword,
        email_confirm: true,
        user_metadata: { name: demoName },
      });

      if (createError) {
        console.log('Error creating demo user:', createError);
        return c.json({ error: createError.message }, 400);
      }

      userId = data.user.id;
      console.log('Demo user created successfully:', userId);
      
      // Wait longer after creation to allow Supabase to propagate
      await new Promise(resolve => setTimeout(resolve, 2500));
    }

    // Check if user profile exists
    const existingProfile = await kv.get(`user:${userId}`);

    if (!existingProfile) {
      console.log('Creating demo user profile...');

      const createdAt = new Date();
      const trialEndDate = new Date(createdAt);
      trialEndDate.setDate(trialEndDate.getDate() + 7);

      const userProfile = {
        id: userId,
        email: demoEmail,
        name: demoName,
        plan: 'free',
        createdAt: createdAt.toISOString(),
        trialEndsAt: null,
        isTrial: false,
        limits: {
          leads: 100,
          messages: 50,
          massMessages: 5,
          campaigns: 3,
        },
        usage: {
          leads: 0,
          messages: 0,
          massMessages: 0,
          campaigns: 0,
        },
      };

      await kv.set(`user:${userId}`, userProfile);
      console.log('Demo user profile created');
    } else {
      console.log('Demo user profile already exists, ensuring correct plan...');
      // Update to ensure correct free plan settings
      existingProfile.plan = 'free';
      existingProfile.isTrial = false;
      existingProfile.trialEndsAt = null;
      existingProfile.limits = {
        leads: 100,
        messages: 50,
        massMessages: 5,
        campaigns: 3,
      };
      await kv.set(`user:${userId}`, existingProfile);
    }

    // Additional wait before attempting verification
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Try to verify by signing in
    console.log('Verifying demo user credentials...');
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: demoEmail,
      password: demoPassword,
    });

    if (signInError) {
      console.error('Demo user verification failed:', signInError);
      return c.json({
        success: true,
        message: 'Demo user created/updated. Please wait 10 seconds before trying to login.',
        credentials: {
          email: demoEmail,
          password: demoPassword,
        },
        needsWait: true,
      });
    }

    console.log('Demo user verified successfully!');

    return c.json({
      success: true,
      message: 'Demo user setup complete and verified',
      credentials: {
        email: demoEmail,
        password: demoPassword,
      },
    });
  } catch (error) {
    console.error('Setup demo error:', error);
    return c.json({ error: 'Internal server error during demo setup' }, 500);
  }
});

// Setup Admin Account (for development/testing)
app.post('/make-server-4be966ab/auth/setup-admin', async (c) => {
  try {
    const adminEmail = 'admin@leadflow.com';
    const adminPassword = 'admin123456';
    const adminName = 'Administrador';

    console.log('[ADMIN SETUP] ========== STARTING ==========');
    
    const supabase = getSupabaseClient();
    console.log('[ADMIN SETUP] Supabase client ready');

    // Check if user exists
    console.log('[ADMIN SETUP] Checking for existing admin...');
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('[ADMIN SETUP] List error:', listError);
      throw new Error('List users failed: ' + listError.message);
    }
    
    const existingAdmin = existingUsers?.users?.find((u) => u.email === adminEmail);
    
    let userId: string;

    if (existingAdmin) {
      console.log('[ADMIN SETUP] Admin exists, updating password...');
      userId = existingAdmin.id;

      const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
        password: adminPassword,
        email_confirm: true,
        user_metadata: { name: adminName, role: 'admin', isAdmin: true },
      });

      if (updateError) {
        console.error('[ADMIN SETUP] Update error:', updateError);
        throw new Error('Update failed: ' + updateError.message);
      }
      
      console.log('[ADMIN SETUP] ✅ Password updated');
      
    } else {
      console.log('[ADMIN SETUP] Creating new admin...');
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true,
        user_metadata: { name: adminName, role: 'admin', isAdmin: true },
      });

      if (createError) {
        console.error('[ADMIN SETUP] Create error:', createError);
        throw new Error('Create failed: ' + createError.message);
      }

      userId = createData.user.id;
      console.log('[ADMIN SETUP] ✅ Admin created, ID:', userId);
    }

    // Save profile
    console.log('[ADMIN SETUP] Saving profile...');
    const userProfile = {
      id: userId,
      email: adminEmail,
      name: adminName,
      role: 'admin',
      isAdmin: true,
      plan: 'enterprise',
      createdAt: new Date().toISOString(),
      trialEndsAt: null,
      isTrial: false,
      planExpiresAt: null,
      limits: { leads: -1, messages: -1, massMessages: -1, bulkMessages: -1, campaigns: -1 },
      usage: { leads: 0, messages: 0, massMessages: 0, campaigns: 0 },
    };

    await kv.set(`user:${userId}`, userProfile);
    console.log('[ADMIN SETUP] ✅ Profile saved');

    // Wait for auth propagation
    console.log('[ADMIN SETUP] Waiting 3s for propagation...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('[ADMIN SETUP] ========== COMPLETE ==========');

    return c.json({
      success: true,
      message: 'Admin ready',
      userId: userId,
      credentials: { email: adminEmail, password: adminPassword },
    });
  } catch (error: any) {
    console.error('[ADMIN SETUP] ========== ERROR ==========');
    console.error('[ADMIN SETUP]', error);
    return c.json({ 
      success: false,
      error: error?.message || String(error)
    }, 500);
  }
});

// Sign up - NOW WITH 7-DAY TRIAL FOR ALL USERS
app.post('/make-server-4be966ab/auth/signup', async (c) => {
  try {
    const { email, password, name, selectedPlan } = await c.req.json();

    console.log('Signup attempt for email:', email, 'name:', name, 'selectedPlan:', selectedPlan);

    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    const supabase = getSupabaseClient();

    // Create user
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm since email server not configured
      user_metadata: { name: name || '' },
    });

    if (error) {
      console.log('Signup error:', error.message, error);
      return c.json({ error: error.message }, 400);
    }

    console.log('User created successfully:', data.user.id);

    // Create user profile - ALL NEW USERS START ON FREE PLAN (NO TRIAL)
    const userId = data.user.id;
    const createdAt = new Date();
    
    // FREE plan limits (applied immediately, no trial)
    const freePlanLimits = {
      leads: 100,
      messages: 100, // Mensagens individuais
      massMessages: 200, // Mensagens em massa (campanhas)
      campaigns: 3,
    };
    
    // Calcular data de expiração (30 dias a partir de agora)
    const expirationDate = new Date(createdAt);
    expirationDate.setDate(expirationDate.getDate() + 30);
    
    const userProfile = {
      id: userId,
      email,
      name: name || '',
      plan: 'free', // FREE plan by default
      createdAt: createdAt.toISOString(),
      trialEndsAt: null, // No trial
      isTrial: false, // Not in trial
      planExpiresAt: expirationDate.toISOString(), // Todos os planos expiram em 30 dias
      limits: freePlanLimits, // FREE plan limits applied immediately
      usage: {
        leads: 0,
        messages: 0,
        massMessages: 0,
        campaigns: 0,
      },
    };

    await kv.set(`user:${userId}`, userProfile);

    console.log('User profile created with FREE plan for user:', userId);

    // 🔔 CRIAR NOTIFICAÇÃO DE BOAS-VINDAS
    try {
      await notifications.notifyWelcome(userId, name || 'usuário');
      console.log('[Signup] ✅ Welcome notification created');
    } catch (notifError) {
      console.error('[Signup] ⚠️ Failed to create welcome notification (non-critical):', notifError);
    }

    // 🔔 Notificar admin sobre novo usuário
    try {
      await createAdminNotification(
        'new_user',
        `👤 Novo usuário: ${(name || '').trim() || email}`,
        {
          userId,
          email,
          name: name || '',
          plan: 'free',
          createdAt: createdAt.toISOString(),
        },
      );
      console.log('[Signup] ✅ Admin notified about new user');
    } catch (adminNotifError) {
      console.error('[Signup] ⚠️ Failed to notify admin about new user (non-critical):', adminNotifError);
    }

    return c.json({
      success: true,
      user: {
        id: userId,
        email,
        name: name || '',
        plan: 'free',
        isTrial: false,
        trialEndsAt: null,
      },
    });
  } catch (error) {
    console.error('Signup error:', error);
    return c.json({ error: 'Internal server error during signup' }, 500);
  }
});

// Sign in
app.post('/make-server-4be966ab/auth/signin', async (c) => {
  try {
    const { email, password } = await c.req.json();

    console.log('Sign in attempt for email:', email);

    if (!email || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    const supabase = getSupabaseClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.log('Sign in error:', error.message);
      
      // Check if user exists in our KV store
      const users = await kv.getByPrefix('user:');
      const userExists = users.some(u => u.email === email);
      
      if (!userExists) {
        console.log('User not found in KV store for email:', email);
        return c.json({ 
          error: 'Email não encontrado. Por favor, crie uma conta primeiro.',
          suggestion: 'signup'
        }, 401);
      }
      
      return c.json({ 
        error: error.message,
        suggestion: error.message.includes('credentials') ? 'check_password' : null
      }, 401);
    }

    // Get user profile
    const userProfile = await kv.get(`user:${data.user.id}`);

    console.log('Sign in successful for user:', data.user.id);

    return c.json({
      success: true,
      session: data.session,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name || '',
      },
      profile: userProfile || null,
    });
  } catch (error) {
    console.error('Sign in error:', error);
    return c.json({ error: 'Internal server error during sign in' }, 500);
  }
});

// Sign out
app.post('/make-server-4be966ab/auth/signout', async (c) => {
  try {
    console.log('Sign out request received');
    return c.json({ success: true, message: 'Signed out successfully' });
  } catch (error) {
    console.error('Sign out error:', error);
    return c.json({ error: 'Internal server error during sign out' }, 500);
  }
});

// ============================================
// USER PROFILE ROUTES
// ============================================

// Authentication middleware
const authMiddleware = async (c, next) => {
  try {
    const authHeader = c.req.header('Authorization');
    console.log('[Auth Middleware] Authorization header present:', !!authHeader);
    
    if (!authHeader) {
      console.error('[Auth Middleware] Missing Authorization header');
      return c.json({ error: 'Authorization header required' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    console.log('[Auth Middleware] Token extracted, length:', token.length);
    
    const supabase = getSupabaseClient();

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('[Auth Middleware] Auth error:', JSON.stringify(error, null, 2));
      console.error('[Auth Middleware] User data:', JSON.stringify(user, null, 2));
      return c.json({ 
        error: 'Invalid or expired token',
        details: error?.message || 'User not found'
      }, 401);
    }

    console.log('[Auth Middleware] User authenticated:', user.id);
    c.set('user', user);
    await next();
  } catch (error) {
    console.error('[Auth Middleware] Unexpected error:', error);
    console.error('[Auth Middleware] Error details:', JSON.stringify(error, null, 2));
    return c.json({ 
      error: 'Authentication failed',
      details: error?.message || 'Unknown error'
    }, 401);
  }
};

// Get current user profile
app.get('/make-server-4be966ab/user/profile', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    let userProfile = await kv.get(`user:${user.id}`);

    // Auto-create profile for social login users (Google, etc.)
    if (!userProfile) {
      console.log('Profile not found for user:', user.id, '- creating new profile (likely from social login)');
      
      const now = new Date();
      
      userProfile = {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
        plan: 'free',
        isTrial: false,
        trialEndsAt: null,
        createdAt: now.toISOString(),
        limits: {
          leads: 100,
          messages: 50,
          massMessages: 5,
          campaigns: 3,
        },
        usage: {
          leads: 0,
          messages: 0,
          massMessages: 0,
          campaigns: 0,
        },
      };
      
      await kv.set(`user:${user.id}`, userProfile);
      console.log('Created profile for social login user with FREE plan');
    }

    return c.json(userProfile);
  } catch (error) {
    console.error('Get profile error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Alias for /users/profile (for API helper consistency)
app.get('/make-server-4be966ab/users/profile', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    let userProfile = await kv.get(`user:${user.id}`);

    // Auto-create profile for social login users (Google, etc.)
    if (!userProfile) {
      console.log('Profile not found for user:', user.id, '- creating new profile (likely from social login)');
      
      const now = new Date();
      
      userProfile = {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
        plan: 'free',
        isTrial: false,
        trialEndsAt: null,
        createdAt: now.toISOString(),
        limits: {
          leads: 100,
          messages: 50,
          massMessages: 5,
          campaigns: 3,
        },
        usage: {
          leads: 0,
          messages: 0,
          massMessages: 0,
          campaigns: 0,
        },
      };
      
      await kv.set(`user:${user.id}`, userProfile);
      console.log('Created profile for social login user with FREE plan');
    }

    return c.json(userProfile);
  } catch (error) {
    console.error('Get profile error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update user profile
app.put('/make-server-4be966ab/user/profile', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const updates = await c.req.json();

    const userProfile = await kv.get(`user:${user.id}`);

    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    // Only allow certain fields to be updated
    const allowedFields = ['name', 'phone', 'company', 'avatar', 'avatar_url'];
    const filteredUpdates = Object.keys(updates)
      .filter((key) => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key];
        return obj;
      }, {});

    const updatedProfile = { ...userProfile, ...filteredUpdates };
    await kv.set(`user:${user.id}`, updatedProfile);

    return c.json(updatedProfile);
  } catch (error) {
    console.error('Update profile error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Alias for /users/profile PUT (for API helper consistency)
app.put('/make-server-4be966ab/users/profile', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const updates = await c.req.json();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('[PUT /users/profile] 🔄 UPDATE REQUEST');
    console.log('[PUT /users/profile] User ID:', user.id);
    console.log('[PUT /users/profile] Updates received:', Object.keys(updates));
    console.log('[PUT /users/profile] Has avatar in updates:', !!updates.avatar);
    if (updates.avatar) {
      console.log('[PUT /users/profile] Avatar length:', updates.avatar.length);
      console.log('[PUT /users/profile] Avatar preview:', updates.avatar.substring(0, 100) + '...');
    }

    const userProfile = await kv.get(`user:${user.id}`);

    if (!userProfile) {
      console.error('[PUT /users/profile] ❌ User profile not found for user:', user.id);
      return c.json({ error: 'User profile not found' }, 404);
    }

    console.log('[PUT /users/profile] Current profile has avatar:', !!userProfile.avatar_url);

    // Only allow certain fields to be updated
    const allowedFields = ['name', 'phone', 'company', 'avatar', 'avatar_url'];
    const filteredUpdates = Object.keys(updates)
      .filter((key) => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = updates[key];
        return obj;
      }, {});

    console.log('[PUT /users/profile] Filtered updates:', Object.keys(filteredUpdates));

    const updatedProfile = { ...userProfile, ...filteredUpdates };
    await kv.set(`user:${user.id}`, updatedProfile);

    console.log('[PUT /users/profile] ✅ Profile updated in KV store');
    console.log('[PUT /users/profile] Updated profile has avatar:', !!updatedProfile.avatar_url);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return c.json(updatedProfile);
  } catch (error) {
    console.error('[PUT /users/profile] ❌ Error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Change user password
app.post('/make-server-4be966ab/user/change-password', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { currentPassword, newPassword } = await c.req.json();

    if (!currentPassword || !newPassword) {
      return c.json({ error: 'Senha atual e nova senha são obrigatórias' }, 400);
    }

    if (newPassword.length < 6) {
      return c.json({ error: 'A nova senha deve ter pelo menos 6 caracteres' }, 400);
    }

    const supabase = getSupabaseClient();

    // Verify current password by attempting to sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (signInError) {
      return c.json({ error: 'Senha atual incorreta' }, 400);
    }

    // Update password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (updateError) {
      console.error('Password update error:', updateError);
      return c.json({ error: 'Erro ao alterar senha: ' + updateError.message }, 500);
    }

    console.log('Password changed successfully for user:', user.id);

    return c.json({ success: true, message: 'Senha alterada com sucesso' });
  } catch (error) {
    console.error('Change password error:', error);
    return c.json({ error: 'Erro interno ao alterar senha' }, 500);
  }
});

// Upload avatar
app.post('/make-server-4be966ab/users/avatar', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    console.log('[Avatar Upload] Starting upload for user:', user.id);

    // Parse form data
    const formData = await c.req.formData();
    const file = formData.get('avatar');

    if (!file || !(file instanceof File)) {
      console.error('[Avatar Upload] No file provided or invalid file');
      return c.json({ error: 'No avatar file provided' }, 400);
    }

    console.log('[Avatar Upload] File received:', {
      name: file.name,
      type: file.type,
      size: file.size,
    });

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      console.error('[Avatar Upload] Invalid file type:', file.type);
      return c.json({ error: 'Tipo de arquivo inválido. Use JPG, PNG, GIF ou WEBP.' }, 400);
    }

    // Validate file size (max 5MB - increased limit)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      console.error('[Avatar Upload] File too large:', file.size);
      return c.json({ error: 'Arquivo muito grande. Máximo 5MB.' }, 400);
    }

    // Convert file to base64 for storage in KV
    console.log('[Avatar Upload] Converting to base64...');
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    
    // Use better base64 conversion method to avoid stack overflow
    let base64 = '';
    const chunkSize = 8192;
    for (let i = 0; i < buffer.length; i += chunkSize) {
      const chunk = buffer.slice(i, i + chunkSize);
      base64 += String.fromCharCode(...chunk);
    }
    base64 = btoa(base64);
    
    const dataUrl = `data:${file.type};base64,${base64}`;

    console.log('[Avatar Upload] File converted to base64, original size:', file.size, 'base64 size:', base64.length);

    // Update user profile with avatar URL
    const userProfile = await kv.get(`user:${user.id}`);

    if (!userProfile) {
      console.error('[Avatar Upload] User profile not found:', user.id);
      return c.json({ error: 'Perfil de usuário não encontrado' }, 404);
    }

    console.log('[Avatar Upload] Updating profile in KV store...');

    // Update avatar in profile
    const updatedProfile = { 
      ...userProfile, 
      avatar_url: dataUrl, // ✅ Padronizado para avatar_url
      avatarUpdatedAt: new Date().toISOString(),
    };
    
    await kv.set(`user:${user.id}`, updatedProfile);

    console.log('[Avatar Upload] Avatar updated successfully for user:', user.id);

    return c.json({ 
      success: true, 
      avatar_url: dataUrl, // ✅ Retornar como avatar_url (consistente)
      message: 'Avatar atualizado com sucesso'
    });
  } catch (error) {
    console.error('[Avatar Upload] Error:', error);
    console.error('[Avatar Upload] Error stack:', error.stack);
    return c.json({ 
      error: 'Erro ao fazer upload do avatar',
      details: error.message 
    }, 500);
  }
});

// ============================================
// USER SETTINGS ROUTES (PERSISTENT CONFIGURATION)
// ============================================

// Get user settings
app.get('/make-server-4be966ab/users/settings', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    console.log('[User Settings] Fetching settings for user:', user.id);

    // Get settings from KV store
    const settings = await kv.get(`user_settings:${user.id}`);

    const envEvolutionUrl = cleanApiUrl(Deno.env.get('EVOLUTION_API_URL') || '');
    const envEvolutionInstance = (Deno.env.get('EVOLUTION_DEFAULT_INSTANCE') || Deno.env.get('EVOLUTION_INSTANCE_NAME') || '').trim();
    const envDashboardPixelId = (Deno.env.get('DASHBOARD_META_PIXEL_ID') || Deno.env.get('META_PIXEL_ID') || '').trim();

    const defaultSettings = {
      webhook_url: '',
      webhook_events: [],
      n8n_webhook_url: '',
      n8n_bulk_send_url: '',
      chat_webhook_url: '',
      chat_type: 'n8n',
      meta_pixel_id: '',
      google_analytics_id: '',
      evolution_api_key: '',
      evolution_instance_name: envEvolutionInstance,
      evolution_api_url: envEvolutionUrl,
      theme: 'dark',
      other_settings: {}
    };

    const envOverrides = {
      evolution_api_url: envEvolutionUrl,
      evolution_instance_name: envEvolutionInstance,
      dashboard_meta_pixel_id: envDashboardPixelId,
    };

    if (!settings) {
      console.log('[User Settings] No settings found, returning defaults');
      return c.json({
        ...defaultSettings,
        env_overrides: envOverrides,
      });
    }

    console.log('[User Settings] Settings found');

    const mergedSettings = {
      ...defaultSettings,
      ...settings,
    };

    if (envEvolutionUrl) {
      mergedSettings.evolution_api_url = envEvolutionUrl;
    }

    if (envEvolutionInstance && !mergedSettings.evolution_instance_name) {
      mergedSettings.evolution_instance_name = envEvolutionInstance;
    }

    return c.json({
      ...mergedSettings,
      env_overrides: envOverrides,
    });
  } catch (error) {
    console.error('[User Settings] Error fetching settings:', error);
    return c.json({ error: 'Erro ao buscar configurações' }, 500);
  }
});

// Save user settings (UPSERT)
app.put('/make-server-4be966ab/users/settings', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    
    console.log('[User Settings] Saving settings for user:', user.id);
    console.log('[User Settings] Settings to save:', Object.keys(body));

    // Get existing settings
    const existingSettings = await kv.get(`user_settings:${user.id}`) || {};

    // Merge with new settings
    const updatedSettings = {
      ...existingSettings,
      ...body,
      updated_at: new Date().toISOString(),
      user_id: user.id
    };

    // Save to KV store
    await kv.set(`user_settings:${user.id}`, updatedSettings);

    console.log('[User Settings] Settings saved successfully');
    return c.json({
      success: true,
      settings: updatedSettings
    });
  } catch (error) {
    console.error('[User Settings] Error saving settings:', error);
    console.error('[User Settings] Error stack:', error.stack);
    return c.json({ 
      error: 'Erro ao salvar configurações',
      details: error.message 
    }, 500);
  }
});

// Save individual setting (convenience endpoint)
app.patch('/make-server-4be966ab/users/settings/:key', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const key = c.req.param('key');
    const body = await c.req.json();
    
    console.log('[User Settings] Updating single setting:', key, 'for user:', user.id);

    // Get existing settings
    const existingSettings = await kv.get(`user_settings:${user.id}`) || {};

    // Update specific key
    const updatedSettings = {
      ...existingSettings,
      [key]: body.value,
      updated_at: new Date().toISOString(),
      user_id: user.id
    };

    // Save to KV store
    await kv.set(`user_settings:${user.id}`, updatedSettings);

    console.log('[User Settings] Setting updated successfully');
    return c.json({
      success: true,
      settings: updatedSettings
    });
  } catch (error) {
    console.error('[User Settings] Error updating setting:', error);
    return c.json({ 
      error: 'Erro ao atualizar configuração',
      details: error.message 
    }, 500);
  }
});

// ============================================
// PLANS AND PRICING ROUTES
// ============================================

// Get all available plans
app.get('/make-server-4be966ab/plans', async (c) => {
  const plans = [
    {
      id: 'free',
      name: 'Gratuito',
      price: 0,
      currency: 'BRL',
      interval: 'month',
      stripePriceId: null,
      limits: {
        leads: 100,
        messages: 100,
        massMessages: 200,
        campaigns: 3,
      },
      features: [
        'Até 100 leads',
        '100 mensagens individuais/mês',
        '200 mensagens em massa/mês',
        '3 campanhas ativas',
        '1 usuário',
        'Painel básico',
        'Suporte por email',
      ],
    },
    {
      id: 'business',
      name: 'Business',
      price: 20,
      currency: 'USD',
      interval: 'month',
      annualPrice: 100,
      stripePriceId: Deno.env.get('STRIPE_PROFESSIONAL_PRICE_ID') || 'price_business',
      limits: {
        leads: 500,
        messages: 500,
        massMessages: 1000,
        campaigns: 50,
      },
      features: [
        'Até 500 leads',
        '500 mensagens individuais/mês',
        '1.000 mensagens em massa/mês',
        '50 campanhas ativas',
        'Até 5 usuários',
        'Painel completo',
        'Relatórios em tempo real',
        'Todas as integrações',
        'API + HTTP endpoint',
        'Suporte prioritário',
      ],
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 59,
      currency: 'USD',
      interval: 'month',
      annualPrice: 200,
      stripePriceId: Deno.env.get('STRIPE_UNLIMITED_PRICE_ID') || 'price_enterprise',
      limits: {
        leads: -1, // Unlimited
        messages: -1,
        massMessages: -1,
        campaigns: -1,
      },
      features: [
        'Leads ilimitados',
        'Mensagens individuais ilimitadas',
        'Mensagens em massa ilimitadas',
        'Campanhas ilimitadas',
        'Usuários ilimitados',
        'Tudo do Business',
        'Gerente dedicado',
        'SLA 99.9%',
        'Suporte 24/7',
        'Onboarding personalizado',
        'Customizações sob medida',
        'Segurança avançada',
      ],
    },
  ];

  return c.json({ success: true, plans });
});

// Upgrade/Downgrade Plan (called from UpgradeModal when user selects free plan)
app.post('/make-server-4be966ab/plans/upgrade', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { planId } = await c.req.json();

    console.log(`[Plan Upgrade] User ${user.id} requesting upgrade/downgrade to ${planId}`);

    if (!planId || !['free', 'business', 'enterprise'].includes(planId)) {
      return c.json({ error: 'Invalid plan ID' }, 400);
    }

    const userProfile = await kv.get(`user:${user.id}`);

    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    // Update plan limits based on the new FREE plan structure
    const planLimits = {
      free: { 
        leads: 100, 
        messages: 100, // Mensagens individuais
        massMessages: 200, // Mensagens em massa (campanhas)
        campaigns: 3,
      },
      business: { 
        leads: 500, 
        messages: 500, // Mensagens individuais
        massMessages: 1000, // Mensagens em massa (campanhas)
        campaigns: 50,
      },
      enterprise: { 
        leads: -1, // unlimited
        messages: -1, // unlimited
        massMessages: -1, // unlimited
        campaigns: -1,
      },
    };

    // Calcular nova data de expiração (30 dias a partir de agora)
    const newExpirationDate = new Date();
    newExpirationDate.setDate(newExpirationDate.getDate() + 30);
    
    // Update user profile
    userProfile.plan = planId;
    userProfile.subscription_plan = planId;
    userProfile.limits = planLimits[planId];
    userProfile.planExpiresAt = newExpirationDate.toISOString(); // Todos os planos expiram em 30 dias
    
    // Reset trial status when changing plans
    if (planId === 'free') {
      userProfile.isTrial = false;
      userProfile.trialEndsAt = null;
    }

    await kv.set(`user:${user.id}`, userProfile);

    console.log(`[Plan Upgrade] Successfully updated user ${user.id} to ${planId} plan`);

    return c.json({ 
      success: true, 
      user: userProfile,
      message: `Plano atualizado para ${planId}` 
    });
  } catch (error) {
    console.error('[Plan Upgrade] Error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create Stripe Checkout Session for Plan Upgrade
app.post('/make-server-4be966ab/checkout/create-session', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { planId } = await c.req.json();

    // IMPORTANT: Replace these with your actual Stripe Price IDs
    // To create them:
    // 1. Go to https://dashboard.stripe.com/products
    // 2. Create a product for each plan (Business and Enterprise)
    // 3. Add a recurring price to each product
    // 4. Copy the price ID (starts with price_) and paste it here
    const plansConfig = {
      business: Deno.env.get('STRIPE_PROFESSIONAL_PRICE_ID') || 'price_REPLACE_WITH_YOUR_BUSINESS_PRICE_ID',
      enterprise: Deno.env.get('STRIPE_UNLIMITED_PRICE_ID') || 'price_REPLACE_WITH_YOUR_ENTERPRISE_PRICE_ID',
    };

    // Check if Stripe is properly configured
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return c.json({ 
        error: 'Stripe not configured',
        message: 'Please configure STRIPE_SECRET_KEY in environment variables'
      }, 500);
    }

    const priceId = plansConfig[planId];
    if (!priceId || priceId.includes('REPLACE')) {
      return c.json({ 
        error: 'Plan not configured',
        message: `Please configure Stripe Price ID for ${planId} plan`
      }, 400);
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    });

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${c.req.header('origin') || 'http://localhost:5173'}/dashboard?success=true&plan=${planId}`,
      cancel_url: `${c.req.header('origin') || 'http://localhost:5173'}/dashboard?canceled=true`,
      metadata: {
        userId: user.id,
        planId: planId,
      },
    });

    return c.json({ success: true, url: session.url });
  } catch (error) {
    console.error('Create checkout session error:', error);
    return c.json({ error: 'Failed to create checkout session: ' + error.message }, 500);
  }
});

// Alias for backward compatibility
app.post('/make-server-4be966ab/stripe/checkout', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { planId } = await c.req.json();

    const plansConfig = {
      business: Deno.env.get('STRIPE_PROFESSIONAL_PRICE_ID') || 'price_REPLACE_WITH_YOUR_BUSINESS_PRICE_ID',
      enterprise: Deno.env.get('STRIPE_UNLIMITED_PRICE_ID') || 'price_REPLACE_WITH_YOUR_ENTERPRISE_PRICE_ID',
    };

    // Check if Stripe is properly configured
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      return c.json({ 
        error: 'Stripe not configured',
        message: 'Please configure STRIPE_SECRET_KEY in environment variables'
      }, 500);
    }

    const priceId = plansConfig[planId];
    if (!priceId || priceId.includes('REPLACE')) {
      return c.json({ 
        error: 'Plan not configured',
        message: `Please configure Stripe Price ID for ${planId} plan`
      }, 400);
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    });

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${c.req.header('origin') || 'http://localhost:5173'}/dashboard?success=true&plan=${planId}`,
      cancel_url: `${c.req.header('origin') || 'http://localhost:5173'}/dashboard?canceled=true`,
      metadata: {
        userId: user.id,
        planId: planId,
      },
    });

    return c.json({ success: true, url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return c.json({ error: 'Failed to create checkout session: ' + error.message }, 500);
  }
});

// Stripe Webhook Handler
app.post('/make-server-4be966ab/webhook/stripe', async (c) => {
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');

  if (!stripeSecretKey || !webhookSecret) {
    console.error('Stripe not configured');
    return c.json({ error: 'Stripe not configured' }, 500);
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2023-10-16',
  });

  const sig = c.req.header('stripe-signature');
  const body = await c.req.text();

  let event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return c.json({ error: 'Webhook signature verification failed' }, 400);
  }

  console.log('Stripe webhook event received:', event.type);

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const planId = session.metadata?.planId;

      if (!userId || !planId) {
        console.error('Missing userId or planId in session metadata');
        break;
      }

      console.log(`Upgrading user ${userId} to ${planId} plan`);

      // Get user profile
      const userProfile = await kv.get(`user:${userId}`);
      if (!userProfile) {
        console.error('User profile not found:', userId);
        break;
      }

      // Update user plan
      const planLimits = {
        business: { leads: 500, messages: 500, massMessages: 1000, campaigns: 50 },
        enterprise: { leads: -1, messages: -1, massMessages: -1, campaigns: -1 },
      };

      userProfile.plan = planId;
      userProfile.limits = planLimits[planId];
      userProfile.isTrial = false;
      userProfile.trialEndsAt = null;

      await kv.set(`user:${userId}`, userProfile);

      console.log('User plan updated successfully:', userId, planId);

      // 🔔 Informar admin sobre upgrade de plano via Stripe
      try {
        await createAdminNotification(
          'upgrade',
          `🚀 ${userProfile.name || userProfile.email || 'Usuário'} fez upgrade para o plano ${planId}`,
          {
            userId,
            email: userProfile.email,
            name: userProfile.name,
            plan: planId,
            stripeSessionId: session.id,
          },
        );

        if (session.amount_total) {
          const amount = (session.amount_total / 100).toFixed(2);
          await createAdminNotification(
            'payment',
            `💰 Pagamento confirmado de ${userProfile.name || userProfile.email || 'usuário'} no valor de ${amount} ${String(session.currency || '').toUpperCase()}`,
            {
              userId,
              email: userProfile.email,
              name: userProfile.name,
              amount: session.amount_total,
              currency: session.currency,
              stripeSessionId: session.id,
            },
          );
        }
      } catch (adminNotifError) {
        console.error('[Stripe webhook] ⚠️ Failed to notify admin about upgrade/payment (non-critical):', adminNotifError);
      }
      break;
    }
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object as any;
      const userId = invoice?.metadata?.userId;

      if (!userId) {
        console.warn('[Stripe webhook] Missing userId on invoice payment:', invoice?.id);
        break;
      }

      const userProfile = await kv.get(`user:${userId}`);

      if (!userProfile) {
        console.warn('[Stripe webhook] User profile not found for invoice payment:', userId);
        break;
      }

      try {
        const amount = typeof invoice?.amount_paid === 'number' ? (invoice.amount_paid / 100).toFixed(2) : null;
        await createAdminNotification(
          'payment',
          amount
            ? `💰 Pagamento recorrente confirmado: ${userProfile.name || userProfile.email || 'Usuário'} pagou ${amount} ${String(invoice?.currency || '').toUpperCase()}`
            : `💰 Pagamento recorrente confirmado para ${userProfile.name || userProfile.email || 'usuário'}`,
          {
            userId,
            email: userProfile.email,
            name: userProfile.name,
            amount: invoice?.amount_paid ?? null,
            currency: invoice?.currency ?? null,
            invoiceId: invoice?.id,
          },
        );
      } catch (adminNotifError) {
        console.error('[Stripe webhook] ⚠️ Failed to notify admin about recurring payment (non-critical):', adminNotifError);
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      console.log('Subscription canceled:', subscription.id);
      // Handle subscription cancellation
      break;
    }
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return c.json({ received: true });
});

// Manual plan change (for testing or admin use)
app.post('/make-server-4be966ab/user/change-plan', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { planId } = await c.req.json();

    if (!planId || !['free', 'business', 'enterprise'].includes(planId)) {
      return c.json({ error: 'Invalid plan ID' }, 400);
    }

    const userProfile = await kv.get(`user:${user.id}`);

    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    // Update plan limits
    const planLimits = {
      free: { leads: 100, messages: 100, massMessages: 200, campaigns: 3 },
      business: { leads: 500, messages: 500, massMessages: 1000, campaigns: 50 },
      enterprise: { leads: -1, messages: -1, massMessages: -1, campaigns: -1 },
    };

    userProfile.plan = planId;
    userProfile.limits = planLimits[planId];

    await kv.set(`user:${user.id}`, userProfile);

    return c.json({ success: true, profile: userProfile });
  } catch (error) {
    console.error('Change plan error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ============================================
// NOTIFICATIONS ROUTES
// ============================================

// Get all notifications for current user
app.get('/make-server-4be966ab/notifications', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    console.log('[Notifications] 📬 Fetching notifications for user:', user.id);
    
    const userNotifications = await notifications.getUserNotifications(user.id);
    
    console.log(`[Notifications] ✅ Found ${userNotifications.length} notifications`);
    
    return c.json({ 
      success: true,
      notifications: userNotifications,
      count: userNotifications.length,
      unreadCount: userNotifications.filter(n => !n.read).length
    });
  } catch (error: any) {
    console.error('[Notifications] ❌ Error fetching notifications:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to fetch notifications' 
    }, 500);
  }
});

// Mark notification as read
app.put('/make-server-4be966ab/notifications/:id/read', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const notificationId = c.req.param('id');
    
    console.log('[Notifications] 📖 Marking notification as read:', notificationId);
    
    const success = await notifications.markNotificationAsRead(user.id, notificationId);
    
    if (success) {
      return c.json({ success: true, message: 'Notification marked as read' });
    } else {
      return c.json({ success: false, error: 'Notification not found' }, 404);
    }
  } catch (error: any) {
    console.error('[Notifications] ❌ Error marking as read:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to mark notification as read' 
    }, 500);
  }
});

// Mark all notifications as read
app.put('/make-server-4be966ab/notifications/mark-all-read', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    console.log('[Notifications] 📚 Marking all notifications as read for user:', user.id);
    
    const count = await notifications.markAllNotificationsAsRead(user.id);
    
    return c.json({ 
      success: true, 
      message: `${count} notifications marked as read`,
      count 
    });
  } catch (error: any) {
    console.error('[Notifications] ❌ Error marking all as read:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to mark all notifications as read' 
    }, 500);
  }
});

// Delete a notification
app.delete('/make-server-4be966ab/notifications/:id', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const notificationId = c.req.param('id');
    
    console.log('[Notifications] 🗑️ Deleting notification:', notificationId);
    
    const success = await notifications.deleteNotification(user.id, notificationId);
    
    if (success) {
      return c.json({ success: true, message: 'Notification deleted' });
    } else {
      return c.json({ success: false, error: 'Notification not found' }, 404);
    }
  } catch (error: any) {
    console.error('[Notifications] ❌ Error deleting notification:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to delete notification' 
    }, 500);
  }
});

// Clear all notifications
app.delete('/make-server-4be966ab/notifications/clear-all', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    console.log('[Notifications] 🧹 Clearing all notifications for user:', user.id);
    
    const count = await notifications.clearAllNotifications(user.id);
    
    return c.json({ 
      success: true, 
      message: `${count} notifications cleared`,
      count 
    });
  } catch (error: any) {
    console.error('[Notifications] ❌ Error clearing all notifications:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to clear all notifications' 
    }, 500);
  }
});

// Check for expiring plans (can be called by cron)
app.post('/make-server-4be966ab/notifications/check-expiring-plans', async (c) => {
  try {
    console.log('[Notifications] 🕐 Running expiring plans check...');
    
    const count = await notifications.checkExpiringPlans();
    
    return c.json({ 
      success: true, 
      message: `Checked expiring plans, created ${count} notifications`,
      count 
    });
  } catch (error: any) {
    console.error('[Notifications] ❌ Error checking expiring plans:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to check expiring plans' 
    }, 500);
  }
});

// Manual trigger to create a test notification
app.post('/make-server-4be966ab/notifications/test', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    console.log('[Notifications] 🧪 Creating test notification for user:', user.id);
    
    await notifications.createNotification(
      user.id,
      'system_update',
      'Sistema de Notificações Ativo! 🎉',
      'O sistema de notificações em tempo real está funcionando perfeitamente. Você receberá alertas sobre novos leads, tarefas, limites e muito mais!',
      {
        actionLabel: 'Ver dashboard',
        actionUrl: '/dashboard'
      }
    );
    
    return c.json({ 
      success: true, 
      message: 'Test notification created successfully' 
    });
  } catch (error: any) {
    console.error('[Notifications] ❌ Error creating test notification:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to create test notification' 
    }, 500);
  }
});

// ============================================
// TASKS & REMINDERS ROUTES
// ============================================

// Get all tasks for current user
app.get('/make-server-4be966ab/tasks', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const status = c.req.query('status'); // pending | completed | cancelled
    const leadId = c.req.query('leadId');
    const includeCompleted = c.req.query('includeCompleted') === 'true';
    
    console.log('[Tasks] 📋 Fetching tasks for user:', user.id, { status, leadId, includeCompleted });
    
    const userTasks = await tasks.getUserTasks(user.id, {
      status: status as any,
      leadId,
      includeCompleted
    });
    
    console.log(`[Tasks] ✅ Found ${userTasks.length} tasks`);
    
    return c.json({ 
      success: true,
      tasks: userTasks,
      count: userTasks.length
    });
  } catch (error: any) {
    console.error('[Tasks] ❌ Error fetching tasks:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to fetch tasks' 
    }, 500);
  }
});

// Get task statistics
app.get('/make-server-4be966ab/tasks/stats', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    console.log('[Tasks] 📊 Fetching task stats for user:', user.id);
    
    const stats = await tasks.getTaskStats(user.id);
    
    return c.json({ 
      success: true,
      stats
    });
  } catch (error: any) {
    console.error('[Tasks] ❌ Error fetching task stats:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to fetch task stats' 
    }, 500);
  }
});

// Get overdue tasks
app.get('/make-server-4be966ab/tasks/overdue', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    console.log('[Tasks] ⚠️ Fetching overdue tasks for user:', user.id);
    
    const overdueTasks = await tasks.getOverdueTasks(user.id);
    
    return c.json({ 
      success: true,
      tasks: overdueTasks,
      count: overdueTasks.length
    });
  } catch (error: any) {
    console.error('[Tasks] ❌ Error fetching overdue tasks:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to fetch overdue tasks' 
    }, 500);
  }
});

// Get today's tasks
app.get('/make-server-4be966ab/tasks/today', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    console.log('[Tasks] 📅 Fetching today tasks for user:', user.id);
    
    const todayTasks = await tasks.getTodayTasks(user.id);
    
    return c.json({ 
      success: true,
      tasks: todayTasks,
      count: todayTasks.length
    });
  } catch (error: any) {
    console.error('[Tasks] ❌ Error fetching today tasks:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to fetch today tasks' 
    }, 500);
  }
});

// Get single task
app.get('/make-server-4be966ab/tasks/:taskId', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const taskId = c.req.param('taskId');
    
    console.log('[Tasks] 🔍 Fetching task:', taskId);
    
    const task = await tasks.getTask(user.id, taskId);
    
    if (!task) {
      return c.json({ success: false, error: 'Task not found' }, 404);
    }
    
    return c.json({ 
      success: true,
      task
    });
  } catch (error: any) {
    console.error('[Tasks] ❌ Error fetching task:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to fetch task' 
    }, 500);
  }
});

// Create new task
app.post('/make-server-4be966ab/tasks', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const taskData = await c.req.json();
    
    console.log('[Tasks] ➕ Creating task for user:', user.id, taskData);
    
    // Validação
    if (!taskData.title || !taskData.dueDate || !taskData.type || !taskData.priority) {
      return c.json({ 
        success: false, 
        error: 'Missing required fields: title, dueDate, type, priority' 
      }, 400);
    }
    
    const task = await tasks.createTask(user.id, {
      leadId: taskData.leadId,
      type: taskData.type,
      title: taskData.title,
      description: taskData.description,
      priority: taskData.priority,
      dueDate: taskData.dueDate,
      metadata: taskData.metadata
    });
    
    console.log('[Tasks] ✅ Task created:', task.id);
    
    return c.json({ 
      success: true,
      task
    }, 201);
  } catch (error: any) {
    console.error('[Tasks] ❌ Error creating task:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to create task' 
    }, 500);
  }
});

// Update task
app.put('/make-server-4be966ab/tasks/:taskId', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const taskId = c.req.param('taskId');
    const updates = await c.req.json();
    
    console.log('[Tasks] 📝 Updating task:', taskId, updates);
    
    const task = await tasks.updateTask(user.id, taskId, updates);
    
    if (!task) {
      return c.json({ success: false, error: 'Task not found' }, 404);
    }
    
    console.log('[Tasks] ✅ Task updated:', taskId);
    
    return c.json({ 
      success: true,
      task
    });
  } catch (error: any) {
    console.error('[Tasks] ❌ Error updating task:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to update task' 
    }, 500);
  }
});

// Complete task
app.put('/make-server-4be966ab/tasks/:taskId/complete', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const taskId = c.req.param('taskId');
    
    console.log('[Tasks] ✅ Completing task:', taskId);
    
    const task = await tasks.completeTask(user.id, taskId);
    
    if (!task) {
      return c.json({ success: false, error: 'Task not found' }, 404);
    }
    
    return c.json({ 
      success: true,
      message: 'Task completed',
      task
    });
  } catch (error: any) {
    console.error('[Tasks] ❌ Error completing task:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to complete task' 
    }, 500);
  }
});

// Delete task
app.delete('/make-server-4be966ab/tasks/:taskId', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const taskId = c.req.param('taskId');
    
    console.log('[Tasks] 🗑️ Deleting task:', taskId);
    
    const success = await tasks.deleteTask(user.id, taskId);
    
    if (!success) {
      return c.json({ success: false, error: 'Task not found' }, 404);
    }
    
    return c.json({ 
      success: true,
      message: 'Task deleted'
    });
  } catch (error: any) {
    console.error('[Tasks] ❌ Error deleting task:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to delete task' 
    }, 500);
  }
});

// Check overdue tasks (CRON)
app.post('/make-server-4be966ab/tasks/check-overdue', async (c) => {
  try {
    console.log('[Tasks] 🕐 Running overdue tasks check...');
    
    const count = await tasks.checkOverdueTasks();
    
    return c.json({ 
      success: true, 
      message: `Checked overdue tasks, created ${count} notifications`,
      count 
    });
  } catch (error: any) {
    console.error('[Tasks] ❌ Error checking overdue tasks:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to check overdue tasks' 
    }, 500);
  }
});

// Check upcoming tasks (CRON)
app.post('/make-server-4be966ab/tasks/check-upcoming', async (c) => {
  try {
    console.log('[Tasks] 🕐 Running upcoming tasks check...');
    
    const count = await tasks.checkUpcomingTasks();
    
    return c.json({ 
      success: true, 
      message: `Checked upcoming tasks, created ${count} reminder notifications`,
      count 
    });
  } catch (error: any) {
    console.error('[Tasks] ❌ Error checking upcoming tasks:', error);
    return c.json({ 
      success: false, 
      error: error.message || 'Failed to check upcoming tasks' 
    }, 500);
  }
});

// ============================================
// LEADS MANAGEMENT ROUTES
// ============================================

// 🔧 MIGRATION: Preencher convertedAt para leads já convertidos
app.post('/make-server-4be966ab/leads/migrate-converted-dates', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    console.log('[Migration] 🔧 Iniciando migração de convertedAt para user:', user.id);
    
    // Buscar todos os leads do usuário
    const allLeadsData = await kv.getByPrefix(`lead:${user.id}:`);
    
    console.log('[Migration] 📦 Dados brutos recebidos:', {
      tipo: typeof allLeadsData,
      length: allLeadsData?.length,
      sample: allLeadsData?.[0]
    });
    
    // ✅ getByPrefix já retorna array de values (não {key, value})
    const allLeads = allLeadsData.filter((lead: any) => lead && typeof lead === 'object');
    
    console.log('[Migration] 📊 Leads filtrados:', allLeads.length);
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const lead of allLeads) {
      try {
        // ✅ Validar que o lead tem estrutura válida
        if (!lead || !lead.id || !lead.status) {
          console.warn('[Migration] ⚠️ Lead inválido ignorado:', lead);
          errors++;
          continue;
        }
        
        const isConverted = (lead.status || '').toLowerCase() === 'convertido';
        const hasConvertedAt = !!lead.convertedAt;
        
        console.log('[Migration] 🔍 Verificando lead:', {
          id: lead.id,
          nome: lead.nome,
          status: lead.status,
          isConverted,
          hasConvertedAt
        });
        
        if (isConverted && !hasConvertedAt) {
          // Usar updatedAt como fallback, ou data de criação + 1 dia
          const convertedDate = lead.updatedAt || 
            new Date(new Date(lead.createdAt || lead.data || Date.now()).getTime() + 24 * 60 * 60 * 1000).toISOString();
          
          lead.convertedAt = convertedDate;
          await kv.set(`lead:${user.id}:${lead.id}`, lead);
          
          console.log('[Migration] ✅ Lead atualizado:', lead.id, '- convertedAt:', convertedDate);
          updated++;
        } else {
          skipped++;
        }
      } catch (leadError) {
        console.error('[Migration] ❌ Erro ao processar lead:', leadError);
        errors++;
      }
    }
    
    console.log('[Migration] 🎉 Migração concluída! Atualizados:', updated, 'Ignorados:', skipped, 'Erros:', errors);
    
    return c.json({
      success: true,
      updated,
      skipped,
      errors,
      total: allLeads.length,
      message: `Migração concluída! ${updated} leads atualizados, ${skipped} ignorados, ${errors} erros.`
    });
  } catch (error) {
    console.error('[Migration] ❌ Erro na migração:', error);
    console.error('[Migration] ❌ Stack:', error.stack);
    return c.json({ error: 'Erro ao migrar dados: ' + error.message }, 500);
  }
});

// Get all leads for current user
app.get('/make-server-4be966ab/leads', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    console.log('[Leads] Fetching leads for user:', user.id);
    
    // ✅ SUPORTE A PAGINAÇÃO via query params
    const offsetParam = c.req.query('offset');
    const limitParam = c.req.query('limit');
    
    const offset = offsetParam ? parseInt(offsetParam, 10) : 0;
    const limit = limitParam ? parseInt(limitParam, 10) : 1000; // default 1000
    
    console.log('[Leads] Pagination params:', { offset, limit });
    
    // ✅ BUSCAR DIRETAMENTE DO SUPABASE COM PAGINAÇÃO
    // Evita o limite de 1000 do kv.getByPrefix()
    const supabase = getSupabaseClient();
    const prefix = `lead:${user.id}:`;
    
    console.log('[Leads] Querying Supabase with prefix:', prefix, 'range:', offset, 'to', offset + limit - 1);
    
    const { data, error } = await supabase
      .from('kv_store_4be966ab')
      .select('value')
      .like('key', `${prefix}%`)
      .range(offset, offset + limit - 1); // Supabase usa range(from, to)
    
    if (error) {
      console.error('[Leads] Supabase query error:', error);
      throw error;
    }
    
    const userLeads = data?.map((d) => d.value) ?? [];
    
    console.log('[Leads] Leads found in this page:', userLeads.length);
    
    // Normalize leads to ensure Portuguese fields are always in the root
    const normalizedLeads = (userLeads || []).map(lead => {
      // Extract from customFields if needed
      const customFields = lead.customFields || {};
      
      return {
        ...lead,
        // Ensure Portuguese fields are at root level
        nome: lead.nome || customFields.nome || lead.name || '',
        telefone: lead.telefone || customFields.telefone || lead.phone || '',
        email: lead.email || customFields.email || '',
        interesse: lead.interesse || customFields.interesse || lead.interest || '',
        origem: lead.origem || customFields.origem || lead.source || 'manual',
        status: lead.status || customFields.status || 'novo',
        data: lead.data || customFields.data || lead.createdAt?.split('T')[0] || '',
        agente_atual: lead.agente_atual || customFields.agente_atual || lead.agent || '',
        observacoes: lead.observacoes || lead.observacao || customFields.observacoes || lead.notes || '',
        marcado_email: lead.marcado_email || customFields.marcado_email || false,
      };
    });
    
    console.log('[Leads] Returning normalized leads:', {
      offset,
      limit,
      returned: normalizedLeads.length
    });
    
    if (normalizedLeads.length > 0) {
      console.log('[Leads] 📊 First normalized lead:', JSON.stringify(normalizedLeads[0], null, 2));
      console.log('[Leads] 📊 Fields: nome=', normalizedLeads[0]?.nome, 'telefone=', normalizedLeads[0]?.telefone);
    }

    return c.json(normalizedLeads);
  } catch (error) {
    console.error('[Leads] Get leads error:', error);
    console.error('[Leads] Error stack:', error.stack);
    return c.json({ error: 'Internal server error while fetching leads' }, 500);
  }
});

// Get single lead by ID
app.get('/make-server-4be966ab/leads/:leadId', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const leadId = c.req.param('leadId');
    
    const lead = await kv.get(`lead:${user.id}:${leadId}`);
    
    if (!lead) {
      return c.json({ error: 'Lead not found' }, 404);
    }

    return c.json(lead);
  } catch (error) {
    console.error('Get lead error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Create new lead
app.post('/make-server-4be966ab/leads', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const leadData = await c.req.json();
    
    console.log('[Create Lead] Received lead data:', JSON.stringify(leadData));

    // Get user profile to check limits
    const userProfile = await kv.get(`user:${user.id}`);
    
    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    // Check lead limits
    const currentCount = userProfile.usage?.leads || 0;
    
    // -1 or 999999 means unlimited
    if (userProfile.limits.leads !== -1 && userProfile.limits.leads !== 999999) {
      if (currentCount >= userProfile.limits.leads) {
        return c.json({ 
          error: 'Lead limit reached', 
          message: `You have reached your plan limit of ${userProfile.limits.leads} leads per month. Please upgrade your plan.`,
          currentPlan: userProfile.plan,
          currentUsage: currentCount,
          limit: userProfile.limits.leads
        }, 403);
      }
    }

    // ✅ CHECK FOR DUPLICATES - normalize data first
    const email = (leadData.email || '').trim();
    const telefone = (leadData.telefone || leadData.phone || '').trim();
    
    console.log('[Create Lead] 🔍 Checking for duplicates before creation:', {
      nome: leadData.nome,
      email,
      telefone
    });
    
    const isDuplicate = await checkDuplicateLead(user.id, email, telefone);
    
    if (isDuplicate) {
      console.log('[Create Lead] ❌ DUPLICATE REJECTED - Lead creation blocked:', { 
        nome: leadData.nome,
        email, 
        telefone 
      });
      return c.json({ 
        error: 'Duplicate lead', 
        message: 'Um lead com este email ou telefone já existe no sistema.',
        isDuplicate: true
      }, 409); // 409 Conflict
    }
    
    console.log('[Create Lead] ✅ No duplicates found, proceeding with creation');

    const leadId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Support both Portuguese and English field names
    const lead = {
      id: leadId,
      userId: user.id,
      // Portuguese fields (from frontend)
      nome: leadData.nome || leadData.name || '',
      email: leadData.email || '',
      telefone: leadData.telefone || leadData.phone || '',
      interesse: leadData.interesse || leadData.interest || '',
      origem: leadData.origem || leadData.source || 'manual',
      status: leadData.status || 'novo',
      agente_atual: leadData.agente_atual || leadData.agent || '',
      observacoes: leadData.observacoes || leadData.observacao || leadData.notes || '',
      // English fields for compatibility
      name: leadData.nome || leadData.name || '',
      phone: leadData.telefone || leadData.phone || '',
      company: leadData.company || '',
      source: leadData.origem || leadData.source || 'manual',
      notes: leadData.observacoes || leadData.observacao || leadData.notes || '',
      tags: leadData.tags || [],
      customFields: leadData.customFields || {},
      // Other fields
      marcado_email: leadData.marcado_email || false,
      data: leadData.data || now.split('T')[0],
      createdAt: now,
      updatedAt: now,
    };

    await kv.set(`lead:${user.id}:${leadId}`, lead);

    // Update usage counter
    userProfile.usage = userProfile.usage || { leads: 0, messages: 0, massMessages: 0 };
    userProfile.usage.leads = (userProfile.usage.leads || 0) + 1;
    await kv.set(`user:${user.id}`, userProfile);

    console.log('[Create Lead] Lead created successfully:', leadId, 'for user:', user.id);

    // 🔔 CRIAR NOTIFICAÇÃO DE NOVO LEAD
    try {
      await notifications.notifyNewLead(
        user.id, 
        leadId, 
        lead.nome || lead.name || 'Lead sem nome',
        lead.origem || lead.source
      );
      console.log('[Create Lead] ✅ Notification created for new lead');
    } catch (notifError) {
      console.error('[Create Lead] ⚠️ Failed to create notification (non-critical):', notifError);
    }

    // 🔔 VERIFICAR LIMITES DO PLANO
    try {
      await notifications.checkLeadLimits(user.id);
    } catch (limitError) {
      console.error('[Create Lead] ⚠️ Failed to check lead limits (non-critical):', limitError);
    }

    // 🔔 NOTIFICAR WEBHOOK N8N (se configurado)
    if (userProfile.n8nWebhookUrl) {
      const instanceName = userProfile.whatsappInstance?.instanceName || null;
      console.log('[Create Lead] 🔔 Notifying N8N webhook...');
      console.log('[Create Lead] 📱 WhatsApp Instance Name:', instanceName);
      // AWAIT para garantir que a requisição seja enviada antes de terminar
      try {
        await notifyN8NWebhook(userProfile.n8nWebhookUrl, 'lead.created', {
          lead: lead,
          userId: user.id,
          userEmail: user.email,
          instanceName: instanceName
        });
        console.log('[Create Lead] ✅ Webhook notification completed');
      } catch (err) {
        console.error('[Create Lead] ⚠️ Webhook notification failed (non-critical):', err.message);
      }
    }

    return c.json(lead, 201);
  } catch (error) {
    console.error('[Create Lead] Error creating lead:', error);
    return c.json({ error: 'Internal server error while creating lead: ' + error.message }, 500);
  }
});

// Update lead
app.put('/make-server-4be966ab/leads/:leadId', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const leadId = c.req.param('leadId');
    const updates = await c.req.json();
    
    console.log('[Update Lead] Updating lead:', leadId, 'with data:', JSON.stringify(updates));

    const existingLead = await kv.get(`lead:${user.id}:${leadId}`);

    if (!existingLead) {
      return c.json({ error: 'Lead not found' }, 404);
    }

    // Preserve the field mapping - keep both Portuguese and English names
    const updatedLead = {
      ...existingLead,
      ...updates,
      id: leadId, // Preserve ID
      userId: user.id, // Preserve user ID
      updatedAt: new Date().toISOString(),
    };
    
    // ✅ AUTOMÁTICO: Registrar data de conversão quando status muda para "convertido"
    if (updates.status && updates.status.toLowerCase() === 'convertido') {
      if (!existingLead.convertedAt || existingLead.status?.toLowerCase() !== 'convertido') {
        updatedLead.convertedAt = new Date().toISOString();
        console.log('[Update Lead] 🎯 Lead convertido! Registrando convertedAt:', updatedLead.convertedAt);
      }
    }
    
    // Ensure synchronization between Portuguese and English fields
    if (updates.nome) updatedLead.name = updates.nome;
    if (updates.name) updatedLead.nome = updates.name;
    if (updates.telefone) updatedLead.phone = updates.telefone;
    if (updates.phone) updatedLead.telefone = updates.phone;
    if (updates.origem) updatedLead.source = updates.origem;
    if (updates.source) updatedLead.origem = updates.source;
    if (updates.observacoes) updatedLead.notes = updates.observacoes;
    if (updates.observacao) updatedLead.observacoes = updates.observacao;
    if (updates.notes) updatedLead.observacoes = updates.notes;

    await kv.set(`lead:${user.id}:${leadId}`, updatedLead);

    console.log('[Update Lead] Lead updated successfully:', leadId);

    // 🔔 CRIAR NOTIFICAÇÕES BASEADAS EM MUDANÇAS
    try {
      // Se o status mudou, notificar
      if (updates.status && updates.status !== existingLead.status) {
        const leadName = updatedLead.nome || updatedLead.name || 'Lead';
        
        // Se converteu para "convertido" ou "ganho"
        if (updates.status.toLowerCase() === 'convertido' || updates.status.toLowerCase() === 'ganho') {
          await notifications.notifyLeadConverted(
            user.id,
            leadId,
            leadName,
            updatedLead.valor || updatedLead.value
          );
        } else {
          // Notificar mudança de status normal
          await notifications.notifyLeadMoved(
            user.id,
            leadId,
            leadName,
            existingLead.status || 'Anterior',
            updates.status
          );
        }
        console.log('[Update Lead] ✅ Status change notification created');
      }
    } catch (notifError) {
      console.error('[Update Lead] ⚠️ Failed to create notification (non-critical):', notifError);
    }

    // 🔔 NOTIFICAR WEBHOOK N8N (se configurado)
    const userProfile = await kv.get(`user:${user.id}`);
    if (userProfile?.n8nWebhookUrl) {
      const instanceName = userProfile.whatsappInstance?.instanceName || null;
      console.log('[Update Lead] 🔔 Notifying N8N webhook...');
      console.log('[Update Lead] 📱 WhatsApp Instance Name:', instanceName);
      try {
        await notifyN8NWebhook(userProfile.n8nWebhookUrl, 'lead.updated', {
          lead: updatedLead,
          changes: updates,
          userId: user.id,
          userEmail: user.email,
          instanceName: instanceName
        });
        console.log('[Update Lead] ✅ Webhook notification completed');
      } catch (err) {
        console.error('[Update Lead] ⚠️ Webhook notification failed (non-critical):', err.message);
      }
    }

    return c.json(updatedLead);
  } catch (error) {
    console.error('[Update Lead] Error updating lead:', error);
    return c.json({ error: 'Internal server error while updating lead' }, 500);
  }
});

// Delete lead
app.delete('/make-server-4be966ab/leads/:leadId', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const leadId = c.req.param('leadId');
    
    console.log('[Delete Lead] 🗑️ Attempting to delete lead:', leadId);
    console.log('[Delete Lead] 🗑️ User ID:', user.id);
    console.log('[Delete Lead] 🗑️ Looking for key:', `lead:${user.id}:${leadId}`);

    const existingLead = await kv.get(`lead:${user.id}:${leadId}`);
    
    console.log('[Delete Lead] 🗑️ Found lead:', existingLead ? 'YES' : 'NO');
    if (existingLead) {
      console.log('[Delete Lead] 🗑️ Lead data:', JSON.stringify(existingLead));
    }

    if (!existingLead) {
      // ✅ Silenciar - comportamento esperado quando lead já foi deletado
      return c.json({ error: 'Lead not found' }, 404);
    }

    await kv.del(`lead:${user.id}:${leadId}`);

    // Update usage counter
    const userProfile = await kv.get(`user:${user.id}`);
    if (userProfile && userProfile.usage) {
      userProfile.usage.leads = Math.max(0, (userProfile.usage.leads || 0) - 1);
      await kv.set(`user:${user.id}`, userProfile);
    }

    console.log('[Delete Lead] ✅ Lead deleted successfully:', leadId);

    // 🔔 NOTIFICAR WEBHOOK N8N (se configurado)
    if (userProfile?.n8nWebhookUrl) {
      const instanceName = userProfile.whatsappInstance?.instanceName || null;
      console.log('[Delete Lead] 🔔 Notifying N8N webhook...');
      console.log('[Delete Lead] 📱 WhatsApp Instance Name:', instanceName);
      try {
        await notifyN8NWebhook(userProfile.n8nWebhookUrl, 'lead.deleted', {
          leadId: leadId,
          lead: existingLead,
          userId: user.id,
          userEmail: user.email,
          instanceName: instanceName
        });
        console.log('[Delete Lead] ✅ Webhook notification completed');
      } catch (err) {
        console.error('[Delete Lead] ⚠️ Webhook notification failed (non-critical):', err.message);
      }
    }

    return c.json({ success: true, message: 'Lead deleted successfully' });
  } catch (error) {
    console.error('[Delete Lead] ❌ Delete lead error:', error);
    return c.json({ error: 'Internal server error while deleting lead' }, 500);
  }
});

// ============================================
// EXTERNAL LEAD CAPTURE (N8N, Facebook, Google, etc.)
// ============================================

// HTTP Endpoint to receive leads from external sources (N8N, Facebook, Google Analytics, etc.)
// Available only for Professional and Business plans
app.post('/make-server-4be966ab/leads/external/:userId', async (c) => {
  try {
    const userId = c.req.param('userId');
    const leadData = await c.req.json();

    console.log('External lead received for user:', userId, leadData);

    // Get user profile
    const userProfile = await kv.get(`user:${userId}`);
    
    if (!userProfile) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Check if user has access to HTTP endpoint (Business+ plans)
    const allowedPlans = ['business', 'enterprise'];
    if (!allowedPlans.includes(userProfile.plan)) {
      return c.json({ 
        error: 'HTTP endpoint not available for your plan',
        message: 'Upgrade to Business or Enterprise plan to use this feature',
        currentPlan: userProfile.plan
      }, 403);
    }

    // Check lead limits
    const currentCount = userProfile.usage?.leads || 0;
    
    if (userProfile.limits.leads !== -1 && userProfile.limits.leads !== 999999) {
      if (currentCount >= userProfile.limits.leads) {
        return c.json({ 
          error: 'Lead limit reached', 
          message: `User has reached plan limit of ${userProfile.limits.leads} leads per month`,
          currentUsage: currentCount,
          limit: userProfile.limits.leads
        }, 403);
      }
    }

    const leadId = crypto.randomUUID();
    const now = new Date().toISOString();

    const lead = {
      id: leadId,
      userId: userId,
      name: leadData.name || leadData.nome || '',
      email: leadData.email || '',
      phone: leadData.phone || leadData.telefone || leadData.whatsapp || '',
      company: leadData.company || leadData.empresa || '',
      status: 'new',
      source: leadData.source || 'external',
      notes: leadData.notes || leadData.observacoes || '',
      tags: leadData.tags || [],
      customFields: leadData.customFields || leadData,
      createdAt: now,
      updatedAt: now,
    };

    await kv.set(`lead:${userId}:${leadId}`, lead);

    // Update usage counter
    userProfile.usage = userProfile.usage || { leads: 0, messages: 0, massMessages: 0 };
    userProfile.usage.leads = (userProfile.usage.leads || 0) + 1;
    await kv.set(`user:${userId}`, userProfile);

    console.log('External lead created:', leadId, 'for user:', userId);

    // 🔔 NOTIFICAR WEBHOOK N8N (se configurado)
    if (userProfile?.n8nWebhookUrl) {
      const instanceName = userProfile.whatsappInstance?.instanceName || null;
      console.log('[External Lead] 🔔 Notifying N8N webhook...');
      console.log('[External Lead] 📱 WhatsApp Instance Name:', instanceName);
      try {
        await notifyN8NWebhook(userProfile.n8nWebhookUrl, 'lead.external', {
          lead: lead,
          userId: userId,
          source: 'external_api',
          instanceName: instanceName
        });
        console.log('[External Lead] ✅ Webhook notification completed');
      } catch (err) {
        console.error('[External Lead] ⚠️ Webhook notification failed (non-critical):', err.message);
      }
    }

    return c.json({ 
      success: true, 
      leadId: leadId,
      message: 'Lead captured successfully'
    }, 201);
  } catch (error) {
    console.error('External lead capture error:', error);
    return c.json({ error: 'Internal server error: ' + error.message }, 500);
  }
});

// ============================================
// WHATSAPP INTEGRATION (Evolution API)
// ============================================

// Helper function to clean API URL
function cleanApiUrl(url: string): string {
  return url.replace(/\/+$/, ''); // Remove trailing slashes
}

// Connect WhatsApp Instance
app.post('/make-server-4be966ab/whatsapp/connect', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const evolutionApiUrl = cleanApiUrl(Deno.env.get('EVOLUTION_API_URL') || '');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiUrl || !evolutionApiKey) {
      return c.json({ 
        error: 'Evolution API not configured',
        message: 'Please configure EVOLUTION_API_URL and EVOLUTION_API_KEY'
      }, 500);
    }

    console.log(`[WhatsApp Connect] User: ${user.id}, Evolution API URL: ${evolutionApiUrl}`);

    const instanceName = `leadflow_${user.id}`;

    // First, check if instance already exists
    console.log(`[WhatsApp Connect] Checking if instance exists: ${instanceName}`);
    const checkResponse = await fetch(`${evolutionApiUrl}/instance/connectionState/${instanceName}`, {
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    let qrCodeData = null;
    let instanceExists = checkResponse.ok;

    if (checkResponse.ok) {
      const checkData = await checkResponse.json();
      console.log(`[WhatsApp Connect] Instance exists with state: ${checkData.state}`);
      
      // If already connected, return success
      if (checkData.state === 'open') {
        console.log(`[WhatsApp Connect] Instance already connected`);
        return c.json({
          success: true,
          connected: true,
          status: 'connected',
          instanceName: instanceName,
        });
      }
    }

    if (!instanceExists) {
      // Instance doesn't exist, create it
      console.log('[WhatsApp Connect] Creating new WhatsApp instance:', instanceName);
      const createResponse = await fetch(`${evolutionApiUrl}/instance/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey,
        },
        body: JSON.stringify({
          instanceName: instanceName,
          qrcode: true,
          integration: 'WHATSAPP-BAILEYS',
        }),
      });

      const createData = await createResponse.json();
      console.log('[WhatsApp Connect] Create response:', JSON.stringify(createData, null, 2));

      if (!createResponse.ok) {
        // Check if error is "already exists" - if so, continue to get QR code
        if (createData.response?.message?.[0]?.includes('already in use')) {
          console.log('[WhatsApp Connect] Instance already exists (race condition), will fetch QR code');
          instanceExists = true;
        } else {
          console.error('[WhatsApp Connect] Evolution API error:', createData);
          return c.json({ error: 'Failed to create WhatsApp instance', details: createData }, 500);
        }
      } else {
        console.log('[WhatsApp Connect] Instance created successfully');
        qrCodeData = createData.qrcode?.base64 || createData.qrcode;
        console.log('[WhatsApp Connect] QR code from create response:', qrCodeData ? 'Found' : 'Not found');
      }
    }

    // If instance exists or was just created, get QR code
    if (instanceExists && !qrCodeData) {
      console.log('[WhatsApp Connect] Fetching QR code for existing instance:', instanceName);
      const qrResponse = await fetch(`${evolutionApiUrl}/instance/connect/${instanceName}`, {
        headers: {
          'apikey': evolutionApiKey,
        },
      });

      if (qrResponse.ok) {
        const qrData = await qrResponse.json();
        console.log('[WhatsApp Connect] QR response:', JSON.stringify(qrData, null, 2));
        qrCodeData = qrData.base64 || qrData.qrcode?.base64 || qrData.qrcode;
        console.log('[WhatsApp Connect] QR code fetched successfully, has data:', !!qrCodeData);
      } else {
        const errorData = await qrResponse.json();
        console.error('[WhatsApp Connect] Failed to fetch QR code:', errorData);
        return c.json({ error: 'Failed to get QR code', details: errorData }, 500);
      }
    }

    // Store instance info
    const userProfile = await kv.get(`user:${user.id}`);
    if (userProfile) {
      userProfile.whatsappInstance = {
        instanceName: instanceName,
        connectedAt: new Date().toISOString(),
        status: 'pending',
      };
      await kv.set(`user:${user.id}`, userProfile);
      console.log('[WhatsApp Connect] User profile updated with instance info');
    }

    console.log('[WhatsApp Connect] Final response - has QR code:', !!qrCodeData);
    
    return c.json({
      success: true,
      qrCode: qrCodeData,
      instanceName: instanceName,
      status: 'pending',
    });
  } catch (error) {
    console.error('[WhatsApp Connect] Error:', error);
    return c.json({ error: 'Internal server error: ' + error.message }, 500);
  }
});

// Check WhatsApp Connection Status
app.get('/make-server-4be966ab/whatsapp/status', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const evolutionApiUrl = cleanApiUrl(Deno.env.get('EVOLUTION_API_URL') || '');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    console.log(`[WhatsApp Status] Checking status for user: ${user.id}`);

    if (!evolutionApiUrl || !evolutionApiKey) {
      console.log('[WhatsApp Status] Evolution API not configured');
      return c.json({ success: false, connected: false, status: 'disconnected', error: 'Evolution API not configured' });
    }

    const instanceName = `leadflow_${user.id}`;
    console.log(`[WhatsApp Status] Checking instance: ${instanceName}`);

    const response = await fetch(`${evolutionApiUrl}/instance/connectionState/${instanceName}`, {
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    console.log(`[WhatsApp Status] Evolution API response status: ${response.status}`);

    if (!response.ok) {
      const statusCode = response.status;
      console.log(`[WhatsApp Status] Evolution API returned status ${statusCode} for instance ${instanceName}`);
      
      // If instance doesn't exist (404) or other errors, return disconnected
      // This is normal when user hasn't connected WhatsApp yet
      return c.json({ success: false, connected: false, status: 'disconnected' });
    }

    const data = await response.json();
    console.log('[WhatsApp Status] Evolution API connection state:', JSON.stringify(data, null, 2));

    // Evolution API returns different states:
    // - "open" = connected and ready
    // - "connecting" = in process of connecting
    // - "close" = disconnected
    // Check various possible state fields from Evolution API response
    const state = data.state || data.instance?.state || data.connectionState;
    const isConnected = state === 'open' || state === 'connected';
    const statusString = isConnected ? 'connected' : (state === 'connecting' ? 'connecting' : 'disconnected');

    console.log(`[WhatsApp Status] Final status - isConnected: ${isConnected}, statusString: ${statusString}, state: ${state}, raw data.state: ${data.state}`);

    // Update user profile
    const userProfile = await kv.get(`user:${user.id}`);
    if (userProfile && userProfile.whatsappInstance) {
      userProfile.whatsappInstance.status = statusString;
      userProfile.whatsappInstance.connected = isConnected;
      await kv.set(`user:${user.id}`, userProfile);
      console.log('[WhatsApp Status] User profile updated');
    }
    
    // ✅ SALVAR INSTANCE NAME NAS CONFIGURAÇÕES DO USUÁRIO (específico por usuário)
    try {
      let userSettings = await kv.get(`settings:${user.id}`) || {};
      
      // Se instância mudou, atualizar
      if (userSettings.evolution_instance_name !== instanceName) {
        userSettings.evolution_instance_name = instanceName;
        await kv.set(`settings:${user.id}`, userSettings);
        console.log(`[WhatsApp Status] ✅ Evolution instance saved to user settings: ${instanceName}`);
      }
    } catch (error) {
      console.error('[WhatsApp Status] ⚠️ Error saving instance to settings:', error);
      // Não falhar a requisição por causa disso
    }

    return c.json({
      success: true,
      connected: isConnected,
      status: statusString,
      instanceState: data.state, // Keep original state for debugging
      instanceName: instanceName,
      apikey: evolutionApiKey, // Retornar apikey para usar no envio
    });
  } catch (error) {
    console.error('[WhatsApp Status] Error:', error);
    return c.json({ success: false, connected: false, status: 'disconnected', error: error.message });
  }
});

// Get WhatsApp QR Code
app.get('/make-server-4be966ab/whatsapp/qrcode', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const evolutionApiUrl = cleanApiUrl(Deno.env.get('EVOLUTION_API_URL') || '');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiUrl || !evolutionApiKey) {
      return c.json({ error: 'Evolution API not configured' }, 500);
    }

    const instanceName = `leadflow_${user.id}`;

    // Fetch QR code from Evolution API
    const response = await fetch(`${evolutionApiUrl}/instance/connect/${instanceName}`, {
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Failed to get QR code from Evolution API:', data);
      return c.json({ error: 'Failed to get QR code', details: data }, 500);
    }

    // Return QR code
    return c.json({
      success: true,
      base64: data.base64 || data.qrcode?.base64 || data.qrcode,
      qrcode: data.base64 || data.qrcode?.base64 || data.qrcode,
    });
  } catch (error) {
    console.error('Get QR code error:', error);
    return c.json({ error: 'Internal server error: ' + error.message }, 500);
  }
});

// Disconnect WhatsApp
app.post('/make-server-4be966ab/whatsapp/disconnect', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const evolutionApiUrl = cleanApiUrl(Deno.env.get('EVOLUTION_API_URL') || '');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    console.log(`[WhatsApp Disconnect] Disconnecting for user: ${user.id}`);

    if (!evolutionApiUrl || !evolutionApiKey) {
      return c.json({ error: 'Evolution API not configured' }, 500);
    }

    const instanceName = `leadflow_${user.id}`;

    // Logout from the instance (doesn't delete it, just disconnects)
    const response = await fetch(`${evolutionApiUrl}/instance/logout/${instanceName}`, {
      method: 'DELETE',
      headers: {
        'apikey': evolutionApiKey,
      },
    });

    console.log(`[WhatsApp Disconnect] Evolution API response status: ${response.status}`);

    if (!response.ok && response.status !== 404) {
      const errorData = await response.json();
      console.error('[WhatsApp Disconnect] Evolution API error:', errorData);
      throw new Error(errorData.message || 'Failed to disconnect');
    }

    // Update user profile
    const userProfile = await kv.get(`user:${user.id}`);
    if (userProfile && userProfile.whatsappInstance) {
      userProfile.whatsappInstance.status = 'disconnected';
      userProfile.whatsappInstance.connected = false;
      await kv.set(`user:${user.id}`, userProfile);
      console.log('[WhatsApp Disconnect] User profile updated');
    }

    return c.json({ success: true, message: 'WhatsApp disconnected successfully' });
  } catch (error) {
    console.error('[WhatsApp Disconnect] Error:', error);
    return c.json({ error: 'Internal server error: ' + error.message }, 500);
  }
});

// Import WhatsApp Contacts DIRETO (Sem webhook N8N)
// ✅ Este endpoint SEMPRE busca contatos NOVOS diretamente da Evolution API
// ✅ NÃO usa cache - cada requisição busca dados frescos
app.post('/make-server-4be966ab/whatsapp/import-contacts-direct', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    console.log(`[WhatsApp Import Direct] ================================================`);
    console.log(`[WhatsApp Import Direct] 🚀 BUSCA DIRETA DA EVOLUTION API (SEM CACHE)`);
    console.log(`[WhatsApp Import Direct] ================================================`);
    console.log(`[WhatsApp Import Direct] User: ${user.id}`);

    // Get Evolution API credentials
    const evolutionApiUrl = cleanApiUrl(Deno.env.get('EVOLUTION_API_URL') || '');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiUrl || !evolutionApiKey) {
      console.error('[WhatsApp Import Direct] ❌ Evolution API não configurada');
      return c.json({ 
        error: 'Evolution API não configurada. Entre em contato com o suporte.',
        needsConfiguration: true
      }, 500);
    }

    const instanceName = `leadflow_${user.id}`;
    console.log(`[WhatsApp Import Direct] Instance: ${instanceName}`);

    // 1. Verificar status
    console.log(`[WhatsApp Import Direct] ⏳ Verificando status...`);
    const statusResponse = await fetch(`${evolutionApiUrl}/instance/connectionState/${instanceName}`, {
      method: 'GET',
      headers: { 'apikey': evolutionApiKey },
    });

    if (!statusResponse.ok) {
      console.error('[WhatsApp Import Direct] ❌ Instância não encontrada');
      return c.json({ 
        error: 'WhatsApp não conectado. Conecte usando o QR Code primeiro.',
        needsConnection: true
      }, 400);
    }

    const statusData = await statusResponse.json();
    const isConnected = statusData.state === 'open' || statusData.instance?.state === 'open';
    
    if (!isConnected) {
      const state = statusData.state || statusData.instance?.state || 'desconhecido';
      console.error(`[WhatsApp Import Direct] ❌ Não conectado. Estado: ${state}`);
      return c.json({ 
        error: `WhatsApp não conectado (estado: ${state}). Reconecte usando o QR Code.`,
        needsConnection: true
      }, 400);
    }

    console.log(`[WhatsApp Import Direct] ✅ WhatsApp conectado!`);

    // 2. Buscar contatos (tentar diferentes endpoints da Evolution API)
    console.log(`[WhatsApp Import Direct] 📱 Buscando contatos...`);
    
    // ✅ ADICIONAR timestamp único para evitar cache
    const requestTimestamp = Date.now();
    console.log(`[WhatsApp Import Direct] 🕐 Request timestamp:`, requestTimestamp);
    
    // ✅ FORÇAR SYNC antes de buscar contatos (para evitar cache da Evolution API)
    console.log(`[WhatsApp Import Direct] 🔄 Forçando SYNC de contatos...`);
    try {
      const syncResponse = await fetch(`${evolutionApiUrl}/chat/syncContacts/${instanceName}`, {
        method: 'POST',
        headers: { 
          'apikey': evolutionApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ force: true })
      });
      
      if (syncResponse.ok) {
        console.log(`[WhatsApp Import Direct] ✅ Sync forçado com sucesso!`);
        // Aguardar 2 segundos para o sync completar
        await new Promise(resolve => setTimeout(resolve, 2000));
      } else {
        console.log(`[WhatsApp Import Direct] ⚠️ Sync não disponível (${syncResponse.status}), continuando...`);
      }
    } catch (syncError) {
      console.log(`[WhatsApp Import Direct] ⚠️ Erro ao tentar sync:`, syncError.message);
      // Continuar mesmo se sync falhar
    }
    
    let contactsResponse;
    let contactsData;
    
    // Tentar endpoint 1: fetchContacts
    console.log(`[WhatsApp Import Direct] Tentando: /chat/fetchContacts/${instanceName}`);
    contactsResponse = await fetch(`${evolutionApiUrl}/chat/fetchContacts/${instanceName}?_t=${requestTimestamp}`, {
      method: 'GET',
      headers: { 
        'apikey': evolutionApiKey,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      },
    });

    if (!contactsResponse.ok) {
      console.log(`[WhatsApp Import Direct] ⚠️ fetchContacts falhou (${contactsResponse.status}), tentando alternativa...`);
      
      // Tentar endpoint 2: findContacts (POST)
      console.log(`[WhatsApp Import Direct] Tentando: POST /chat/findContacts/${instanceName}`);
      contactsResponse = await fetch(`${evolutionApiUrl}/chat/findContacts/${instanceName}?_t=${requestTimestamp}`, {
        method: 'POST',
        headers: { 
          'apikey': evolutionApiKey,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        body: JSON.stringify({})
      });
    }
    
    if (!contactsResponse.ok) {
      console.log(`[WhatsApp Import Direct] ⚠️ findContacts POST falhou (${contactsResponse.status}), tentando alternativa...`);
      
      // Tentar endpoint 3: fetchAllContacts
      console.log(`[WhatsApp Import Direct] Tentando: /chat/fetchAllContacts/${instanceName}`);
      contactsResponse = await fetch(`${evolutionApiUrl}/chat/fetchAllContacts/${instanceName}?_t=${requestTimestamp}`, {
        method: 'GET',
        headers: { 
          'apikey': evolutionApiKey,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
      });
    }
    
    if (!contactsResponse.ok) {
      console.log(`[WhatsApp Import Direct] ⚠️ fetchAllContacts falhou (${contactsResponse.status}), tentando alternativa...`);
      
      // Tentar endpoint 4: contact/findContacts
      console.log(`[WhatsApp Import Direct] Tentando: POST /contact/findContacts/${instanceName}`);
      contactsResponse = await fetch(`${evolutionApiUrl}/contact/findContacts/${instanceName}?_t=${requestTimestamp}`, {
        method: 'POST',
        headers: { 
          'apikey': evolutionApiKey,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
        body: JSON.stringify({ where: {} })
      });
    }
    
    if (!contactsResponse.ok) {
      console.log(`[WhatsApp Import Direct] ⚠️ contact/findContacts falhou (${contactsResponse.status}), tentando alternativa...`);
      
      // Tentar endpoint 5: findChats (buscar através de conversas)
      console.log(`[WhatsApp Import Direct] Tentando: /chat/findChats/${instanceName}`);
      contactsResponse = await fetch(`${evolutionApiUrl}/chat/findChats/${instanceName}?_t=${requestTimestamp}`, {
        method: 'GET',
        headers: { 
          'apikey': evolutionApiKey,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        },
      });
    }

    if (!contactsResponse.ok) {
      const errorData = await contactsResponse.json().catch(() => ({}));
      console.error('[WhatsApp Import Direct] ❌ Todos os 5 endpoints falharam:', errorData);
      return c.json({ 
        error: 'Não foi possível buscar contatos da Evolution API. Configure o webhook N8N como alternativa.',
        details: errorData.message || contactsResponse.statusText,
        suggestion: 'Vá em Configurações → Integrações → N8N e configure o webhook de importação',
        endpoints_tentados: [
          'GET /chat/fetchContacts',
          'POST /chat/findContacts', 
          'GET /chat/fetchAllContacts',
          'POST /contact/findContacts',
          'GET /chat/findChats'
        ]
      }, 500);
    }

    contactsData = await contactsResponse.json();
    console.log(`[WhatsApp Import Direct] Tipo de resposta: ${typeof contactsData}`);
    console.log(`[WhatsApp Import Direct] 📦 RESPOSTA COMPLETA DA API:`, JSON.stringify(contactsData, null, 2).substring(0, 2000));

    // 3. Extrair array de contatos
    let contactsList = [];
    
    if (Array.isArray(contactsData)) {
      console.log(`[WhatsApp Import Direct] ✅ Resposta é array direto com ${contactsData.length} items`);
      contactsList = contactsData;
    } else if (contactsData.data && Array.isArray(contactsData.data)) {
      console.log(`[WhatsApp Import Direct] ✅ Resposta tem campo 'data' com ${contactsData.data.length} items`);
      contactsList = contactsData.data;
    } else if (contactsData.contacts && Array.isArray(contactsData.contacts)) {
      console.log(`[WhatsApp Import Direct] ✅ Resposta tem campo 'contacts' com ${contactsData.contacts.length} items`);
      contactsList = contactsData.contacts;
    } else if (contactsData.response && Array.isArray(contactsData.response)) {
      console.log(`[WhatsApp Import Direct] ✅ Resposta tem campo 'response' com ${contactsData.response.length} items`);
      contactsList = contactsData.response;
    } else {
      // Procurar qualquer array na resposta
      console.log(`[WhatsApp Import Direct] 🔍 Procurando arrays na resposta...`);
      console.log(`[WhatsApp Import Direct] Keys disponíveis:`, Object.keys(contactsData));
      const arrayKey = Object.keys(contactsData).find(k => Array.isArray(contactsData[k]));
      if (arrayKey) {
        console.log(`[WhatsApp Import Direct] ✅ Array encontrado em '${arrayKey}' com ${contactsData[arrayKey].length} items`);
        contactsList = contactsData[arrayKey];
      } else {
        console.error('[WhatsApp Import Direct] ❌ Nenhum array encontrado na resposta');
        console.error('[WhatsApp Import Direct] Estrutura da resposta:', Object.keys(contactsData));
        return c.json({ 
          error: 'Formato inválido da API. Nenhum array de contatos encontrado.',
          debug: {
            type: typeof contactsData,
            keys: Object.keys(contactsData),
            sample: JSON.stringify(contactsData).substring(0, 500)
          }
        }, 500);
      }
    }

    console.log(`[WhatsApp Import Direct] 📊 ${contactsList.length} contatos brutos encontrados`);
    
    // Mostrar sample dos primeiros contatos brutos para debug
    if (contactsList.length > 0) {
      console.log(`[WhatsApp Import Direct] 📋 Sample dos primeiros 3 contatos brutos:`, JSON.stringify(contactsList.slice(0, 3), null, 2).substring(0, 1000));
    }

    // 4. Transformar e filtrar contatos
    const contactsMapped = contactsList.map((contact: any, index: number) => {
      // Extrair ID do contato (pode vir em diferentes formatos)
      const id = contact.id || contact.remoteJid || contact.jid || contact.chatId || '';
      const phoneNumber = id.split('@')[0] || '';
      
      // Extrair nome (prioridade: pushName > name > notify > verifiedName)
      const nome = contact.pushName || 
                   contact.name || 
                   contact.notify || 
                   contact.verifiedName ||
                   contact.displayName ||
                   phoneNumber || 
                   'Sem Nome';
      
      // Extrair avatar
      const avatar = contact.profilePicUrl || 
                     contact.avatar || 
                     contact.imgUrl ||
                     contact.profilePictureUrl ||
                     null;
      
      const mapped = {
        nome: nome,
        numero: phoneNumber,
        avatar: avatar,
      };
      
      // Log dos primeiros 3 contatos mapeados para debug
      if (index < 3) {
        console.log(`[WhatsApp Import Direct] 🗂️ Contato ${index + 1} mapeado:`, mapped);
      }
      
      return mapped;
    });
    
    console.log(`[WhatsApp Import Direct] 📝 ${contactsMapped.length} contatos após mapeamento`);
    
    const contacts = contactsMapped.filter((c: any, index: number) => {
      // Filtrar apenas contatos válidos (sem grupos, broadcasts, status)
      const isValid = c.numero && 
                      c.numero.length > 0 && 
                      !c.numero.includes('g.us') && 
                      !c.numero.includes('broadcast') &&
                      !c.numero.includes('status') &&
                      !c.numero.includes('newsletter');
      
      // Log dos primeiros 3 contatos filtrados para debug
      if (index < 3) {
        console.log(`[WhatsApp Import Direct] 🔍 Contato ${index + 1} válido? ${isValid} - numero: "${c.numero}"`);
      }
      
      return isValid;
    });

    console.log(`[WhatsApp Import Direct] ✅ ${contacts.length} contatos válidos`);
    console.log(`[WhatsApp Import Direct] ================================================`);
    console.log(`[WhatsApp Import Direct] ✅ IMPORTAÇÃO CONCLUÍDA`);
    console.log(`[WhatsApp Import Direct] 📊 Total de contatos: ${contacts.length}`);
    console.log(`[WhatsApp Import Direct] ⏱️ Timestamp: ${requestTimestamp}`);
    console.log(`[WhatsApp Import Direct] 📍 FONTE: Evolution API (DADOS FRESCOS - SEM CACHE)`);
    console.log(`[WhatsApp Import Direct] ================================================`);

    if (contacts.length === 0) {
      return c.json({ 
        success: true, 
        contatos: [],
        total: 0,
        message: 'Nenhum contato encontrado. Certifique-se de ter contatos salvos no WhatsApp.',
        _timestamp: requestTimestamp,
        _source: 'evolution_api_direct'
      });
    }

    return c.json({ 
      success: true, 
      contatos: contacts,
      total: contacts.length,
      _timestamp: requestTimestamp,
      _source: 'evolution_api_direct'
    });
  } catch (error) {
    console.error('[WhatsApp Import Direct] ❌ Erro:', error);
    return c.json({ 
      error: 'Erro ao importar contatos: ' + error.message
    }, 500);
  }
});

// Import WhatsApp Contacts (Via Webhook N8N - LEGADO)
app.post('/make-server-4be966ab/whatsapp/import-contacts', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    // ✅ GERAR timestamp único para evitar cache
    const requestTimestamp = Date.now();
    console.log(`[WhatsApp Import] 🕐 Request timestamp: ${requestTimestamp}`);
    console.log(`[WhatsApp Import] Importing contacts for user: ${user.id}`);

    // Get user settings to retrieve webhook URL
    const userSettings = await kv.get(`user_settings:${user.id}`);
    
    console.log(`[WhatsApp Import] User settings:`, userSettings ? Object.keys(userSettings) : 'null');
    
    if (!userSettings) {
      console.error('[WhatsApp Import] User settings not found');
      return c.json({ 
        error: 'Configurações do usuário não encontradas. Por favor, configure o webhook nas Integrações.',
        needsConfiguration: true
      }, 400);
    }

    // Get webhook URL from settings
    const webhookUrl = userSettings.n8n_whatsapp_import_url;
    
    console.log(`[WhatsApp Import] Webhook URL from settings: ${webhookUrl || 'not found'}`);
    
    if (!webhookUrl) {
      console.error('[WhatsApp Import] N8N Webhook not configured');
      return c.json({ 
        error: 'Webhook N8N não configurado. Por favor, configure o "Webhook - Importação de Contatos WhatsApp" na aba Integrações → N8N.',
        needsConfiguration: true
      }, 400);
    }

    const instanceName = `leadflow_${user.id}`;
    console.log(`[WhatsApp Import] ================================================`);
    console.log(`[WhatsApp Import] 🚀 NOVA REQUISIÇÃO DE IMPORTAÇÃO`);
    console.log(`[WhatsApp Import] 🆔 User ID: ${user.id}`);
    console.log(`[WhatsApp Import] 📱 Instance: ${instanceName}`);
    console.log(`[WhatsApp Import] 🌐 Webhook URL: ${webhookUrl}`);
    console.log(`[WhatsApp Import] 🕐 Timestamp: ${requestTimestamp}`);
    console.log(`[WhatsApp Import] ================================================`);

    // Send request to N8N webhook with instance name
    const cacheBuster = Math.random().toString(36).substring(7);
    const webhookPayload = {
      instancia: instanceName,
      userId: user.id,
      action: 'listar-contatos',
      timestamp: requestTimestamp,
      _cache_bust: cacheBuster
    };

    console.log(`[WhatsApp Import] 📦 Payload:`, JSON.stringify(webhookPayload, null, 2));

    let response;
    try {
      // ✅ Adicionar timestamp na URL também para evitar cache HTTP
      const webhookUrlWithTimestamp = `${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}_t=${requestTimestamp}&_r=${cacheBuster}`;
      console.log(`[WhatsApp Import] 🔗 URL COMPLETA: ${webhookUrlWithTimestamp}`);
      console.log(`[WhatsApp Import] 📤 ENVIANDO PARA N8N...`);
      
      const fetchStartTime = Date.now();
      response = await fetch(webhookUrlWithTimestamp, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
        body: JSON.stringify(webhookPayload),
      });
      const fetchDuration = Date.now() - fetchStartTime;
      
      console.log(`[WhatsApp Import] ⏱️ Tempo de resposta: ${fetchDuration}ms`);
      console.log(`[WhatsApp Import] 📥 Status: ${response.status} ${response.statusText}`);
      console.log(`[WhatsApp Import] ✅ Webhook response status: ${response.status}`);
    } catch (fetchError) {
      console.error('[WhatsApp Import] ❌ ERRO AO CHAMAR WEBHOOK:');
      console.error('[WhatsApp Import] Fetch error:', fetchError);
      console.error('[WhatsApp Import] Webhook URL:', webhookUrl);
      throw new Error(`Falha ao conectar com webhook N8N: ${fetchError.message}. Verifique se a URL está correta e se o workflow está ativo.`);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[WhatsApp Import] Webhook error:', errorText);
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }
      
      // Detectar erro específico de webhook não registrado (N8N em modo teste ou inativo)
      if (response.status === 404 || 
          errorData.message?.includes('not registered') ||
          errorData.message?.includes('webhook') ||
          errorData.hint?.includes('Execute workflow')) {
        console.warn('[WhatsApp Import] ================================================');
        console.warn('[WhatsApp Import] ⚠️ WEBHOOK N8N NÃO ESTÁ ATIVO OU OFFLINE');
        console.warn('[WhatsApp Import] Status:', response.status);
        console.warn('[WhatsApp Import] URL:', webhookUrl);
        console.warn('[WhatsApp Import] Sugerindo fallback para Evolution API direta...');
        console.warn('[WhatsApp Import] ================================================');
        return c.json({ 
          error: 'Webhook N8N não está ativo. Ative o workflow no N8N ou use importação direta.',
          webhookNotActive: true,
          needsFallback: true
        }, 404);
      }
      
      throw new Error(errorData.message || `Failed to fetch contacts from webhook (HTTP ${response.status})`);
    }

    let data;
    let rawResponse;
    try {
      // Clonar a resposta para poder ler o texto se der erro no JSON
      const responseClone = response.clone();
      rawResponse = await responseClone.text();
      console.log(`[WhatsApp Import] 📄 Raw response (primeiros 1000 chars):`, rawResponse.substring(0, 1000));
      
      data = await response.json();
      console.log(`[WhatsApp Import] 📦 Webhook response data:`, JSON.stringify(data, null, 2).substring(0, 1000));
      console.log(`[WhatsApp Import] 🔑 Webhook response keys:`, Object.keys(data));
    } catch (jsonError) {
      console.error('[WhatsApp Import] ❌ ERRO AO PARSEAR JSON DA RESPOSTA:');
      console.error('[WhatsApp Import] JSON parse error:', jsonError);
      console.error('[WhatsApp Import] Response text:', rawResponse?.substring(0, 500));
      throw new Error(`Resposta do webhook N8N não é JSON válido. Resposta recebida: ${rawResponse?.substring(0, 200)}`);
    }

    // Transform webhook response to our format
    let contactsList = [];
    
    console.log(`[WhatsApp Import] 🔍 Analisando estrutura da resposta...`);
    console.log(`[WhatsApp Import] 🔍 Tipo da resposta:`, typeof data);
    console.log(`[WhatsApp Import] 🔍 É array?`, Array.isArray(data));
    console.log(`[WhatsApp Import] 🔍 Keys da resposta:`, Object.keys(data));
    
    // NOVO: Mostrar TODO o conteúdo da resposta se for pequeno
    if (JSON.stringify(data).length < 5000) {
      console.log(`[WhatsApp Import] 🔍 RESPOSTA COMPLETA:`, JSON.stringify(data, null, 2));
    }
    
    // Handle different response formats (incluindo formato N8N brasileiro)
    if (Array.isArray(data)) {
      console.log(`[WhatsApp Import] ✅ Resposta é array direto`);
      contactsList = data;
    } else if (data.dados && Array.isArray(data.dados)) {
      // Formato N8N brasileiro: { dados: [...] }
      console.log(`[WhatsApp Import] ✅ Resposta tem campo 'dados' (N8N formato BR)`);
      console.log(`[WhatsApp Import] 📊 Tamanho do array 'dados':`, data.dados.length);
      contactsList = data.dados;
    } else if (data.contatos && Array.isArray(data.contatos)) {
      console.log(`[WhatsApp Import] ✅ Resposta tem campo 'contatos'`);
      contactsList = data.contatos;
    } else if (data.contacts && Array.isArray(data.contacts)) {
      console.log(`[WhatsApp Import] ✅ Resposta tem campo 'contacts'`);
      contactsList = data.contacts;
    } else if (data.data && Array.isArray(data.data)) {
      console.log(`[WhatsApp Import] ✅ Resposta tem campo 'data'`);
      contactsList = data.data;
    } else if (data.success && data.contatos && Array.isArray(data.contatos)) {
      console.log(`[WhatsApp Import] ✅ Resposta tem campo 'success.contatos'`);
      contactsList = data.contatos;
    } else {
      console.error('[WhatsApp Import] ❌ Formato não reconhecido:', Object.keys(data));
      console.error('[WhatsApp Import] ❌ RESPOSTA COMPLETA:', JSON.stringify(data, null, 2));
      return c.json({ 
        error: 'Formato de resposta inválido do webhook N8N. Esperado: array de contatos ou objeto com campo "contatos" ou "dados"',
        debug: typeof data,
        receivedKeys: Object.keys(data),
        fullResponse: data
      }, 500);
    }

    console.log(`[WhatsApp Import] 📊 ${contactsList.length} contatos encontrados na resposta`);
    
    // Log dos primeiros 3 contatos para debug
    if (contactsList.length > 0) {
      console.log(`[WhatsApp Import] 📋 Sample dos primeiros 3 contatos:`, JSON.stringify(contactsList.slice(0, 3), null, 2));
    }

    // Transform contacts to our format (suportando formato brasileiro do N8N)
    const contacts = contactsList.map((contact: any, index: number) => {
      // Log do contato original para debug (apenas primeiros 3)
      if (index < 3) {
        console.log(`[WhatsApp Import] 🔍 Contato original #${index}:`, JSON.stringify(contact, null, 2));
      }
      
      const transformed = {
        // Suporte para campos em português (Nome, Telefone) e inglês (name, phone, etc)
        nome: contact.Nome || contact.nome || contact.name || contact.pushName || contact.displayName || contact.id?.split('@')[0] || 'Sem Nome',
        numero: contact.Numero_longo || contact.Numero || contact.Telefone || contact.numero || contact.phone || contact.number || contact.phoneNumber || contact.id?.split('@')[0] || '',
        avatar: contact['URL do avatar'] || contact.Avatar || contact.avatar || contact.avatarUrl || contact.profilePicUrl || contact.imgUrl || null,
      };
      
      // Log do contato transformado para debug (apenas primeiros 3)
      if (index < 3) {
        console.log(`[WhatsApp Import] ✅ Contato transformado #${index}:`, JSON.stringify(transformed, null, 2));
      }
      
      return transformed;
    }).filter((c: any, index: number) => {
      // Filtrar apenas contatos válidos (com número e sem grupos)
      const isValid = c.numero && 
                      c.numero.length > 0 && 
                      !c.numero.includes('g.us') && 
                      !c.numero.includes('broadcast') &&
                      !c.numero.includes('status');
      
      if (!isValid) {
        console.log(`[WhatsApp Import] ⚠️ Contato #${index} FILTRADO:`, JSON.stringify(c, null, 2));
        console.log(`[WhatsApp Import] ⚠️ Razão: numero="${c.numero}", length=${c.numero?.length}, hasGus=${c.numero?.includes('g.us')}`);
      } else if (index < 3) {
        console.log(`[WhatsApp Import] ✅ Contato #${index} VÁLIDO:`, JSON.stringify(c, null, 2));
      }
      
      if (!isValid && c.numero) {
        console.log(`[WhatsApp Import] ⚠️ Contato filtrado: ${c.nome} - ${c.numero}`);
      }
      
      return isValid;
    });

    console.log(`[WhatsApp Import] ================================================`);
    console.log(`[WhatsApp Import] ✅ PROCESSAMENTO CONCLUÍDO (VIA WEBHOOK N8N)`);
    console.log(`[WhatsApp Import] 📊 Total de contatos processados: ${contacts.length}`);
    console.log(`[WhatsApp Import] 🕐 Request Timestamp: ${requestTimestamp}`);
    console.log(`[WhatsApp Import] 📤 Response Timestamp: ${Date.now()}`);
    console.log(`[WhatsApp Import] 📍 FONTE: Webhook N8N (DADOS DO WORKFLOW)`);
    console.log(`[WhatsApp Import] 🌐 Webhook URL: ${webhookUrl}`);
    console.log(`[WhatsApp Import] 📋 Sample (primeiros 2):`, JSON.stringify(contacts.slice(0, 2), null, 2));
    console.log(`[WhatsApp Import] ================================================`);

    return c.json({ 
      success: true, 
      contatos: contacts,
      total: contacts.length,
      _request_timestamp: requestTimestamp,
      _response_timestamp: Date.now(),
      _source: 'n8n_webhook',
      _webhook_url: webhookUrl.substring(0, 50) + '...'  // Truncar para não expor URL completa
    });
  } catch (error) {
    console.error('[WhatsApp Import] ❌ ERRO CAPTURADO NO CATCH:');
    console.error('[WhatsApp Import] Tipo do erro:', typeof error);
    console.error('[WhatsApp Import] Erro completo:', error);
    console.error('[WhatsApp Import] Error.message:', error?.message);
    console.error('[WhatsApp Import] Error.stack:', error?.stack);
    console.error('[WhatsApp Import] Error.name:', error?.name);
    
    return c.json({ 
      error: 'Erro ao importar contatos: ' + (error?.message || 'Erro desconhecido'),
      errorType: error?.name || typeof error,
      details: error?.stack || String(error)
    }, 500);
  }
});

// Send WhatsApp Message
app.post('/make-server-4be966ab/whatsapp/send', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { phone, message, leadId } = await c.req.json();

    // Get user profile to check limits
    const userProfile = await kv.get(`user:${user.id}`);
    
    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    // Check message limits
    const currentCount = userProfile.usage?.messages || 0;
    
    if (userProfile.limits.messages !== -1 && userProfile.limits.messages !== 999999) {
      if (currentCount >= userProfile.limits.messages) {
        return c.json({ 
          error: 'Message limit reached', 
          message: `You have reached your plan limit of ${userProfile.limits.messages} messages per month`,
          currentPlan: userProfile.plan
        }, 403);
      }
    }

    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiUrl || !evolutionApiKey) {
      return c.json({ 
        error: 'Evolution API not configured' 
      }, 500);
    }

    const instanceName = `leadflow_${user.id}`;

    // Format phone number (remove special characters, add country code if needed)
    const formattedPhone = phone.replace(/[^\d]/g, '');
    
    // Remove trailing slash from Evolution API URL if present
    const apiUrl = evolutionApiUrl.replace(/\/$/, '');

    const response = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionApiKey,
      },
      body: JSON.stringify({
        number: formattedPhone,
        text: message,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Failed to send WhatsApp message:', data);
      
      // Check for specific error messages from Evolution API
      const errorMsg = data.message || data.error || 'Failed to send message';
      
      if (errorMsg.includes('not connected') || errorMsg.includes('não conectado') || response.status === 404) {
        return c.json({ 
          success: false,
          error: 'WhatsApp não conectado. Configure sua conta WhatsApp nas Integrações.',
          details: data 
        }, 400);
      }
      
      if (errorMsg.includes('not registered') || errorMsg.includes('não está registrado')) {
        return c.json({ 
          success: false,
          error: 'Este número não está registrado no WhatsApp. Verifique o telefone do lead.',
          details: data 
        }, 400);
      }
      
      return c.json({ success: false, error: errorMsg, details: data }, 500);
    }

    // Update usage counter
    userProfile.usage = userProfile.usage || { leads: 0, messages: 0, massMessages: 0 };
    userProfile.usage.messages = (userProfile.usage.messages || 0) + 1;
    await kv.set(`user:${user.id}`, userProfile);

    // Update lead if leadId provided
    if (leadId) {
      const lead = await kv.get(`lead:${user.id}:${leadId}`);
      if (lead) {
        lead.lastContactedAt = new Date().toISOString();
        const noteText = `\n[${new Date().toLocaleString()}] WhatsApp: ${message}`;
        // Update both Portuguese and English fields
        lead.notes = (lead.notes || lead.observacao || '') + noteText;
        lead.observacao = (lead.observacao || lead.notes || '') + noteText;
        await kv.set(`lead:${user.id}:${leadId}`, lead);
      }
    }

    return c.json({
      success: true,
      messageId: data.key?.id,
    });
  } catch (error) {
    console.error('Send WhatsApp error:', error);
    return c.json({ error: 'Internal server error: ' + error.message }, 500);
  }
});

// Send Mass WhatsApp Messages
app.post('/make-server-4be966ab/whatsapp/send-mass', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { leadIds, message } = await c.req.json();

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return c.json({ error: 'leadIds array is required' }, 400);
    }

    // Get user profile to check limits
    const userProfile = await kv.get(`user:${user.id}`);
    
    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    // Check mass message limits
    const currentCount = userProfile.usage?.massMessages || 0;
    
    if (userProfile.limits.massMessages !== -1 && userProfile.limits.massMessages !== 999999) {
      if (currentCount >= userProfile.limits.massMessages) {
        return c.json({ 
          error: 'Mass message limit reached', 
          message: `You have reached your plan limit of ${userProfile.limits.massMessages} mass messages per month`,
          currentPlan: userProfile.plan
        }, 403);
      }
    }

    const evolutionApiUrl = Deno.env.get('EVOLUTION_API_URL');
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionApiUrl || !evolutionApiKey) {
      return c.json({ 
        error: 'Evolution API not configured' 
      }, 500);
    }

    const instanceName = `leadflow_${user.id}`;
    const results = [];
    
    // Remove trailing slash from Evolution API URL if present
    const apiUrl = evolutionApiUrl.replace(/\/$/, '');

    for (const leadId of leadIds) {
      try {
        const lead = await kv.get(`lead:${user.id}:${leadId}`);
        
        // Check for both Portuguese and English field names
        const phone = lead?.telefone || lead?.phone;
        
        if (!lead || !phone) {
          results.push({ leadId, success: false, error: 'Lead not found or no phone' });
          continue;
        }

        // Personalize message with lead data (support both Portuguese and English)
        let personalizedMessage = message
          .replace(/\{nome\}/gi, lead.nome || lead.name || '')
          .replace(/\{name\}/gi, lead.nome || lead.name || '')
          .replace(/\{email\}/gi, lead.email || '')
          .replace(/\{empresa\}/gi, lead.company || '')
          .replace(/\{company\}/gi, lead.company || '');

        const formattedPhone = phone.replace(/[^\d]/g, '');

        const response = await fetch(`${apiUrl}/message/sendText/${instanceName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': evolutionApiKey,
          },
          body: JSON.stringify({
            number: formattedPhone,
            text: personalizedMessage,
          }),
        });

        const data = await response.json();

        if (response.ok) {
          // Update lead (support both Portuguese and English fields)
          lead.lastContactedAt = new Date().toISOString();
          const noteText = `\n[${new Date().toLocaleString()}] Mass WhatsApp: ${personalizedMessage}`;
          lead.notes = (lead.notes || lead.observacao || '') + noteText;
          lead.observacao = (lead.observacao || lead.notes || '') + noteText;
          await kv.set(`lead:${user.id}:${leadId}`, lead);

          results.push({ leadId, success: true, messageId: data.key?.id });
        } else {
          results.push({ leadId, success: false, error: data.message || 'Failed to send' });
        }

        // Small delay between messages to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        results.push({ leadId, success: false, error: error.message });
      }
    }

    // Update usage counter
    userProfile.usage = userProfile.usage || { leads: 0, messages: 0, massMessages: 0 };
    userProfile.usage.massMessages = (userProfile.usage.massMessages || 0) + 1;
    userProfile.usage.messages = (userProfile.usage.messages || 0) + results.filter(r => r.success).length;
    await kv.set(`user:${user.id}`, userProfile);

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return c.json({
      success: true,
      results,
      summary: {
        total: leadIds.length,
        successful: successCount,
        failed: failCount,
      },
    });
  } catch (error) {
    console.error('Send mass WhatsApp error:', error);
    return c.json({ error: 'Internal server error: ' + error.message }, 500);
  }
});

// ============================================
// CSV IMPORT/EXPORT
// ============================================

// Import leads from CSV
app.post('/make-server-4be966ab/leads/import', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { leads } = await c.req.json();

    if (!Array.isArray(leads) || leads.length === 0) {
      return c.json({ error: 'Leads array is required' }, 400);
    }

    // Get user profile to check limits
    const userProfile = await kv.get(`user:${user.id}`);
    
    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    // Check lead limits
    const currentCount = userProfile.usage?.leads || 0;
    console.log('Import leads - Current count:', currentCount);
    console.log('Import leads - Plan limit:', userProfile.limits.leads);

    // Check if import would exceed limit (skip check if limit is -1 or 999999 = unlimited)
    let availableSlots = leads.length; // Default to all leads
    
    if (userProfile.limits.leads !== -1 && userProfile.limits.leads !== 999999) {
      availableSlots = Math.max(0, userProfile.limits.leads - currentCount);
      
      if (availableSlots === 0) {
        return c.json({ 
          error: 'Lead limit reached', 
          message: `You have reached your plan limit of ${userProfile.limits.leads} leads per month`,
          currentPlan: userProfile.plan,
          currentUsage: currentCount,
          limit: userProfile.limits.leads
        }, 403);
      }
      
      // If trying to import more than available slots, only import what fits
      if (leads.length > availableSlots) {
        console.log(`Limiting import to ${availableSlots} leads (user tried to import ${leads.length})`);
      }
    }

    const now = new Date().toISOString();
    const importedLeads = [];
    const leadsToImport = leads.slice(0, availableSlots); // Only take what fits in the limit
    let duplicatesSkipped = 0;

    for (const leadData of leadsToImport) {
      // ✅ CHECK FOR DUPLICATES - normalize and extract data
      const email = (leadData.email || leadData.Email || leadData.EMAIL || leadData['e-mail'] || leadData['E-mail'] || '').trim();
      const telefone = (leadData.phone || leadData.telefone || leadData.Telefone || leadData.Phone || leadData.TELEFONE || leadData.whatsapp || leadData.celular || leadData.Celular || '').trim();
      const nome = (leadData.name || leadData.nome || leadData.Nome || leadData.Name || leadData.NOME || '').trim();
      
      console.log(`[Import Leads] 🔍 Checking lead: ${nome} - Email: ${email}, Phone: ${telefone}`);
      
      const isDuplicate = await checkDuplicateLead(user.id, email, telefone);
      
      if (isDuplicate) {
        console.log(`[Import Leads] ⚠️ DUPLICATE SKIPPED: ${nome} (Email: ${email}, Phone: ${telefone})`);
        duplicatesSkipped++;
        continue; // Skip this lead
      }
      
      console.log(`[Import Leads] ✅ Lead ${nome} is unique, importing...`);

      const leadId = crypto.randomUUID();

      const lead = {
        id: leadId,
        userId: user.id,
        nome: leadData.name || leadData.nome || leadData.Nome || leadData.Name || leadData.NOME || '',
        email: leadData.email || leadData.Email || leadData.EMAIL || leadData['e-mail'] || leadData['E-mail'] || '',
        telefone: leadData.phone || leadData.telefone || leadData.Telefone || leadData.Phone || leadData.TELEFONE || leadData.whatsapp || leadData.celular || leadData.Celular || '',
        empresa: leadData.company || leadData.empresa || leadData.Empresa || leadData.Company || leadData.EMPRESA || '',
        interesse: leadData.interesse || leadData.interest || leadData.Interesse || leadData.Interest || leadData.Interesses || leadData.INTERESSE || leadData.INTEREST || leadData.interesses || leadData.interests || leadData.Interests || '',
        origem: leadData.origem || leadData.source || leadData.Origem || leadData.Source || leadData.ORIGEM || 'import',
        status: leadData.status || leadData.Status || leadData.STATUS || 'novo',
        observacoes: leadData.notes || leadData.observacoes || leadData.Observacoes || leadData.Notes || leadData.OBSERVACOES || leadData.observacao || leadData.Observacao || '',
        agente_atual: leadData.agente_atual || leadData.agenteAtual || leadData.agente || '',
        data: leadData.data || now.split('T')[0],
        tags: leadData.tags || [],
        customFields: leadData,
        createdAt: now,
        updatedAt: now,
        marcado_email: false,
      };

      await kv.set(`lead:${user.id}:${leadId}`, lead);
      importedLeads.push(lead);
    }

    // Update usage counter
    userProfile.usage = userProfile.usage || { leads: 0, messages: 0, massMessages: 0 };
    userProfile.usage.leads = currentCount + importedLeads.length;
    await kv.set(`user:${user.id}`, userProfile);

    console.log(`Imported ${importedLeads.length} leads for user:`, user.id);
    console.log(`Skipped ${duplicatesSkipped} duplicate leads`);

    // 🔔 NOTIFICAR WEBHOOK N8N (se configurado)
    if (userProfile?.n8nWebhookUrl && importedLeads.length > 0) {
      const instanceName = userProfile.whatsappInstance?.instanceName || null;
      
      // Detectar se é importação do WhatsApp (todos os leads têm origem 'whatsapp')
      const isWhatsAppImport = importedLeads.every(lead => lead.origem === 'whatsapp');
      const eventType = isWhatsAppImport ? 'leads.imported.whatsapp' : 'leads.imported';
      
      console.log('[Import Leads] 🔔 Notifying N8N webhook...');
      console.log('[Import Leads] 📱 WhatsApp Instance Name:', instanceName);
      console.log('[Import Leads] 📋 Import source:', isWhatsAppImport ? 'WhatsApp' : 'CSV/Manual');
      console.log('[Import Leads] 🎯 Event type:', eventType);
      
      try {
        await notifyN8NWebhook(userProfile.n8nWebhookUrl, eventType, {
          imported: importedLeads.length,
          total: leads.length,
          duplicatesSkipped: duplicatesSkipped,
          leads: importedLeads,
          userId: user.id,
          userEmail: user.email,
          instanceName: instanceName,
          source: isWhatsAppImport ? 'whatsapp' : 'csv'
        });
        console.log('[Import Leads] ✅ Webhook notification completed');
      } catch (err) {
        console.error('[Import Leads] ⚠️ Webhook notification failed (non-critical):', err.message);
      }
    }

    return c.json({
      success: true,
      imported: importedLeads.length,
      total: leads.length,
      skipped: leads.length - importedLeads.length,
      duplicatesSkipped: duplicatesSkipped,
      message: importedLeads.length < leads.length 
        ? `Importados ${importedLeads.length} de ${leads.length} leads. ${duplicatesSkipped} duplicados ignorados. ${leads.length - importedLeads.length - duplicatesSkipped} ignorados por limite do plano.`
        : `Importados ${importedLeads.length} leads com sucesso`,
      leads: importedLeads,
    });
  } catch (error) {
    console.error('Import leads error:', error);
    return c.json({ error: 'Internal server error: ' + error.message }, 500);
  }
});

// Import leads from WhatsApp - Optimized version (no webhook notification)
app.post('/make-server-4be966ab/leads/import-whatsapp', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { leads } = await c.req.json();

    if (!Array.isArray(leads) || leads.length === 0) {
      return c.json({ error: 'Leads array is required' }, 400);
    }

    console.log(`[Import WhatsApp] 📱 Starting import of ${leads.length} WhatsApp contacts...`);

    // Get user profile to check limits
    const userProfile = await kv.get(`user:${user.id}`);
    
    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    // Check lead limits
    const currentCount = userProfile.usage?.leads || 0;
    let availableSlots = leads.length;
    
    if (userProfile.limits.leads !== -1 && userProfile.limits.leads !== 999999) {
      availableSlots = Math.max(0, userProfile.limits.leads - currentCount);
      
      if (availableSlots === 0) {
        return c.json({ 
          error: 'Lead limit reached', 
          message: `You have reached your plan limit of ${userProfile.limits.leads} leads`,
        }, 403);
      }
    }

    const now = new Date().toISOString();
    const importedLeads = [];
    const leadsToImport = leads.slice(0, availableSlots);
    let duplicatesSkipped = 0;

    console.log(`[Import WhatsApp] 📦 Processing ${leadsToImport.length} contacts in optimized batches...`);

    // ✅ OTIMIZAÇÃO: Buscar todos os leads existentes de uma vez para verificação de duplicados
    const existingLeadsData = await kv.getByPrefix(`lead:${user.id}:`);
    const existingPhones = new Set(existingLeadsData.map((l: any) => l.telefone?.trim().toLowerCase()));
    const existingEmails = new Set(existingLeadsData.map((l: any) => l.email?.trim().toLowerCase()).filter(Boolean));
    
    console.log(`[Import WhatsApp] 📊 Found ${existingPhones.size} existing phone numbers`);

    // ✅ OTIMIZAÇÃO: Processar em lotes maiores com operações paralelas
    const BATCH_SIZE = 10;
    for (let i = 0; i < leadsToImport.length; i += BATCH_SIZE) {
      const batch = leadsToImport.slice(i, i + BATCH_SIZE);
      
      // Processar lote em paralelo
      const batchResults = await Promise.all(batch.map(async (leadData) => {
        const email = (leadData.email || '').trim();
        const telefone = (leadData.numero || leadData.telefone || '').trim();
        const nome = (leadData.nome || leadData.name || '').trim();
        
        // Validar telefone
        if (!telefone || telefone.length < 8) {
          return { success: false, reason: 'invalid_phone' };
        }
        
        // Verificar duplicados usando Set (muito mais rápido)
        const phoneKey = telefone.trim().toLowerCase();
        const emailKey = email.trim().toLowerCase();
        
        if (existingPhones.has(phoneKey) || (emailKey && existingEmails.has(emailKey))) {
          return { success: false, reason: 'duplicate' };
        }

        // Adicionar aos Sets para evitar duplicados dentro do próprio batch
        existingPhones.add(phoneKey);
        if (emailKey) existingEmails.add(emailKey);

        const leadId = crypto.randomUUID();
        const lead = {
          id: leadId,
          userId: user.id,
          nome: nome,
          email: email,
          telefone: telefone,
          avatarUrl: leadData.avatarUrl || null,
          empresa: '',
          interesse: '',
          origem: 'whatsapp',
          status: 'novo',
          observacoes: '',
          agente_atual: leadData.agente_atual || 'comercial',
          data: leadData.data || now.split('T')[0],
          tags: [],
          customFields: {},
          createdAt: now,
          updatedAt: now,
          marcado_email: false,
        };

        return { success: true, lead, leadId };
      }));

      // Separar sucessos e falhas
      const successfulLeads = batchResults.filter(r => r.success).map(r => r.lead);
      const failedCount = batchResults.filter(r => !r.success).length;
      duplicatesSkipped += failedCount;

      // ✅ OTIMIZAÇÃO: Salvar todos os leads do lote em paralelo
      if (successfulLeads.length > 0) {
        await Promise.all(successfulLeads.map(lead => 
          kv.set(`lead:${user.id}:${lead.id}`, lead)
        ));
        importedLeads.push(...successfulLeads);
        console.log(`[Import WhatsApp] ✅ Batch ${Math.floor(i/BATCH_SIZE) + 1}: imported ${successfulLeads.length}, skipped ${failedCount}`);
      }
    }

    // Update usage counter
    userProfile.usage = userProfile.usage || { leads: 0, messages: 0, massMessages: 0 };
    userProfile.usage.leads = currentCount + importedLeads.length;
    await kv.set(`user:${user.id}`, userProfile);

    console.log(`[Import WhatsApp] ✅ Imported ${importedLeads.length} leads, skipped ${duplicatesSkipped} duplicates`);

    return c.json({
      success: true,
      imported: importedLeads.length,
      duplicatesSkipped: duplicatesSkipped,
      total: leads.length,
    });
  } catch (error) {
    console.error('[Import WhatsApp] Error:', error);
    return c.json({ error: 'Internal server error: ' + error.message }, 500);
  }
});

// Export leads to CSV
app.get('/make-server-4be966ab/leads/export', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const userLeads = await kv.getByPrefix(`lead:${user.id}:`);
    
    if (!userLeads || userLeads.length === 0) {
      return c.json({ error: 'No leads to export' }, 404);
    }

    // Convert to CSV format
    const headers = ['ID', 'Nome', 'Email', 'Telefone', 'Empresa', 'Status', 'Origem', 'Criado em'];
    const rows = userLeads.map(lead => [
      lead.id,
      lead.name,
      lead.email,
      lead.phone,
      lead.company,
      lead.status,
      lead.source,
      lead.createdAt,
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="leads_${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Export leads error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ============================================
// N8N WEBHOOK PROXY
// ============================================

// Sync leads from N8N webhook (proxy to avoid CORS issues)
app.post('/make-server-4be966ab/n8n/sync', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { webhookUrl } = await c.req.json();

    console.log('[N8N Sync] ====== STARTING N8N SYNC ======');
    console.log('[N8N Sync] User ID:', user.id);
    console.log('[N8N Sync] Webhook URL received:', webhookUrl);

    if (!webhookUrl) {
      console.error('[N8N Sync] ERROR: webhookUrl not provided');
      return c.json({ error: 'webhookUrl is required' }, 400);
    }

    // Validate URL
    let url;
    try {
      url = new URL(webhookUrl);
      console.log('[N8N Sync] URL validation passed:', url.toString());
    } catch (e) {
      console.error('[N8N Sync] ERROR: Invalid URL format:', e.message);
      return c.json({ error: 'Invalid webhook URL' }, 400);
    }

    console.log('[N8N Sync] Sending request to webhook...');

    // Fetch data from N8N webhook with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 seconds

    let response;
    try {
      // Tentar GET primeiro
      console.log('[N8N Sync] Trying GET request...');
      response = await fetch(webhookUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });
      
      // Se retornar 404 ou 405, o webhook pode ser POST-only
      if (response.status === 404 || response.status === 405) {
        console.log('[N8N Sync] GET not supported (status ' + response.status + '), trying POST...');
        clearTimeout(timeoutId);
        
        // Tentar com POST
        const postController = new AbortController();
        const postTimeoutId = setTimeout(() => postController.abort(), 30000);
        
        response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ action: 'list_all', source: 'LeadsFlow API' }),
          signal: postController.signal,
        });
        
        clearTimeout(postTimeoutId);
        console.log('[N8N Sync] POST request completed with status:', response.status);
      } else {
        clearTimeout(timeoutId);
      }
      
      console.log('[N8N Sync] ✅ Webhook responded with status:', response.status);
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      console.error('[N8N Sync] ❌ Fetch error:', fetchError.name, fetchError.message);
      console.error('[N8N Sync] Full error:', fetchError);
      
      if (fetchError.name === 'AbortError') {
        return c.json({ error: 'Timeout: Webhook did not respond in 30 seconds' }, 408);
      }
      
      return c.json({ 
        error: 'Failed to connect to webhook',
        details: fetchError.message 
      }, 502);
    }

    if (!response.ok) {
      console.error('[N8N Sync] ❌ HTTP error:', response.status, response.statusText);
      const errorText = await response.text().catch(() => 'Unable to read error response');
      console.error('[N8N Sync] Error response body:', errorText);
      return c.json({ 
        error: `Webhook returned error: ${response.status} ${response.statusText}`,
        details: errorText
      }, response.status);
    }

    // Verificar Content-Type
    const contentType = response.headers.get('content-type');
    console.log('[N8N Sync] Response Content-Type:', contentType);

    // Parse JSON response
    let data;
    try {
      const responseText = await response.text();
      console.log('[N8N Sync] Raw response length:', responseText.length);
      console.log('[N8N Sync] Raw response preview:', responseText.substring(0, 500) + (responseText.length > 500 ? '...' : ''));
      
      // Verificar se a resposta está vazia
      if (!responseText || responseText.trim() === '') {
        console.error('[N8N Sync] ❌ Empty response from webhook');
        console.error('[N8N Sync] This usually means:');
        console.error('[N8N Sync]   1. The N8N workflow has no Respond to Webhook node');
        console.error('[N8N Sync]   2. The workflow is not returning any data');
        console.error('[N8N Sync]   3. There is an error in the N8N workflow');
        return c.json({ 
          error: 'Empty response from webhook',
          details: 'The webhook returned an empty response. Possible causes:\n\n' +
                   '• Missing "Respond to Webhook" node in N8N workflow\n' +
                   '• Workflow not returning any data\n' +
                   '• Error in the N8N workflow execution\n\n' +
                   'Check your N8N workflow logs for more details.'
        }, 502);
      }
      
      // Tentar parsear JSON
      data = JSON.parse(responseText);
      console.log('[N8N Sync] ✅ JSON parsed successfully');
      console.log('[N8N Sync] Data type:', typeof data);
      console.log('[N8N Sync] Is array:', Array.isArray(data));
      if (Array.isArray(data)) {
        console.log('[N8N Sync] Array length:', data.length);
      }
    } catch (parseError: any) {
      console.error('[N8N Sync] ❌ JSON parse error:', parseError.message);
      console.error('[N8N Sync] Parse error stack:', parseError.stack);
      console.error('[N8N Sync] Response was not valid JSON');
      console.error('[N8N Sync] First 1000 chars of response:', responseText.substring(0, 1000));
      
      return c.json({ 
        error: 'Invalid JSON response from webhook',
        details: `Could not parse webhook response as JSON.\n\n` +
                 `Error: ${parseError.message}\n\n` +
                 `Response preview: ${responseText.substring(0, 200)}\n\n` +
                 `Make sure your N8N workflow:\n` +
                 `• Has a "Respond to Webhook" node\n` +
                 `• Returns valid JSON format\n` +
                 `• Is properly configured and active`
      }, 502);
    }

    // Extract leads from response - aceitar múltiplos formatos
    let leadsRecebidos;
    
    // Caso 1: Array direto
    if (Array.isArray(data)) {
      leadsRecebidos = data;
    }
    // Caso 2: Objeto com propriedade "leads", "rows", "data", ou "items"
    else if (data.leads) {
      leadsRecebidos = Array.isArray(data.leads) ? data.leads : [data.leads];
    } else if (data.rows) {
      leadsRecebidos = Array.isArray(data.rows) ? data.rows : [data.rows];
    } else if (data.data) {
      leadsRecebidos = Array.isArray(data.data) ? data.data : [data.data];
    } else if (data.items) {
      leadsRecebidos = Array.isArray(data.items) ? data.items : [data.items];
    }
    // Caso 3: POST response do N8N (success message)
    else if (data.success !== undefined || data.message !== undefined) {
      console.log('[N8N Sync] ℹ️ Webhook returned success/message response (not a list)');
      // Webhook POST pode não retornar lista, apenas confirmar sucesso
      leadsRecebidos = [];
    }
    // Caso 4: Objeto único que representa um lead
    else if (typeof data === 'object' && data !== null) {
      console.log('[N8N Sync] ℹ️ Single object response, treating as single lead');
      leadsRecebidos = [data];
    } else {
      leadsRecebidos = [];
    }

    console.log('[N8N Sync] Extracted leads count:', Array.isArray(leadsRecebidos) ? leadsRecebidos.length : 'NOT AN ARRAY');
    console.log('[N8N Sync] Response structure:', {
      isArray: Array.isArray(data),
      hasLeadsKey: !!data.leads,
      hasRowsKey: !!data.rows,
      hasDataKey: !!data.data,
      hasItemsKey: !!data.items,
      dataType: typeof data
    });

    if (!Array.isArray(leadsRecebidos)) {
      console.error('[N8N Sync] ❌ Unexpected response format. Expected array, got:', typeof leadsRecebidos);
      return c.json({ 
        error: 'Unexpected response format from webhook',
        receivedType: typeof leadsRecebidos,
        sampleData: JSON.stringify(data).substring(0, 500)
      }, 502);
    }

    if (leadsRecebidos.length === 0) {
      console.log('[N8N Sync] ℹ️ No leads found in webhook response');
      return c.json({ 
        success: true,
        message: 'No leads found in webhook response',
        added: 0,
        updated: 0,
        errors: 0
      });
    }

    console.log(`[N8N Sync] ====== STEP 1: DEDUPLICATING SHEET DATA ======`);
    console.log(`[N8N Sync] 📊 Received ${leadsRecebidos.length} leads from Google Sheets`);
    console.log('[N8N Sync] 🔍 DEBUGGING - First lead RAW data:', JSON.stringify(leadsRecebidos[0], null, 2));
    console.log('[N8N Sync] 🔍 DEBUGGING - All keys in first lead:', Object.keys(leadsRecebidos[0] || {}));
    
    // ============================================================================
    // ✅ PASSO 1: DEDUPLICAR DADOS DA PLANILHA ANTES DE PROCESSAR
    // ============================================================================
    leadsRecebidos = uniqueByPhoneOrEmail(leadsRecebidos);
    console.log(`[N8N Sync] ✅ After deduplication: ${leadsRecebidos.length} unique leads from sheet`);
    console.log(`[N8N Sync] ====== STEP 2: PROCESSING LEADS (UPSERT) ======`);

    // Get user profile for limit checking
    const userProfile = await kv.get(`user:${user.id}`);
    const currentLeads = await kv.getByPrefix(`lead:${user.id}:`);
    const currentCount = currentLeads?.length || 0;
    
    console.log('[N8N Sync] Current lead count:', currentCount);
    console.log('[N8N Sync] User plan limits:', userProfile?.limits);
    
    // Check plan limits
    const limits = userProfile?.limits || { leads: 100 };
    const availableSlots = limits.leads === -1 ? Infinity : Math.max(0, limits.leads - currentCount);
    
    console.log('[N8N Sync] Available slots:', availableSlots === Infinity ? 'Unlimited' : availableSlots);

    let leadsAdicionados = 0;
    let leadsAtualizados = 0;
    let erros = 0;
    const now = new Date().toISOString();

    // Process each lead with UPSERT logic
    for (let i = 0; i < leadsRecebidos.length; i++) {
      const leadData = leadsRecebidos[i];
      
      try {
        console.log(`[N8N Sync] 🔍 Processing lead ${i + 1}/${leadsRecebidos.length}`);
        
        // Normalize lead data
        const leadNormalizado = {
          nome: leadData.nome || leadData.name || leadData.Nome || leadData.Name || leadData.NOME || '',
          email: leadData.email || leadData.Email || leadData.EMAIL || leadData['e-mail'] || leadData['E-mail'] || '',
          telefone: leadData.telefone || leadData.phone || leadData.Telefone || leadData.Phone || leadData.TELEFONE || leadData.celular || leadData.Celular || '',
          empresa: leadData.empresa || leadData.company || leadData.Empresa || leadData.Company || leadData.EMPRESA || '',
          cargo: leadData.cargo || leadData.position || leadData.Cargo || leadData.Position || leadData.CARGO || '',
          interesse: leadData.interesse || leadData.interest || leadData.Interesse || leadData.Interest || leadData.Interesses || leadData.INTERESSE || leadData.INTEREST || leadData.interesses || leadData.interests || leadData.Interests || '',
          origem: leadData.origem || leadData.source || leadData.Origem || leadData.Source || leadData.ORIGEM || 'Google Sheets',
          status: leadData.status || leadData.Status || leadData.STATUS || 'novo',
          observacoes: leadData.observacoes || leadData.notes || leadData.Observacoes || leadData.Notes || leadData.OBSERVACOES || leadData.observacao || leadData.Observacao || '',
        };
        
        console.log(`[N8N Sync] Normalized lead: ${leadNormalizado.nome} - Email: ${leadNormalizado.email}, Phone: ${leadNormalizado.telefone}`);

        // Validate required fields
        if (!leadNormalizado.nome || leadNormalizado.nome.trim() === '') {
          console.warn('[N8N Sync] ⚠️ Lead without name, skipping');
          erros++;
          continue;
        }

        // ============================================================================
        // ✅ UPSERT LOGIC: Check if lead exists, UPDATE or INSERT
        // ============================================================================
        console.log(`[N8N Sync] 🔍 Checking for existing lead: ${leadNormalizado.nome}`);
        
        const existingLead = await findDuplicateLead(
          user.id, 
          leadNormalizado.email, 
          leadNormalizado.telefone,
          leadNormalizado.nome
        );
        
        if (existingLead) {
          // ✅ LEAD EXISTS - UPDATE IT
          console.log(`[N8N Sync] 🔄 UPDATING existing lead: ${existingLead.nome} (${existingLead.id})`);
          
          const updatedLead = {
            ...existingLead,
            // Atualizar com novos dados da planilha
            nome: leadNormalizado.nome,
            email: leadNormalizado.email || existingLead.email,
            telefone: leadNormalizado.telefone || existingLead.telefone,
            empresa: leadNormalizado.empresa || existingLead.empresa,
            cargo: leadNormalizado.cargo || existingLead.cargo,
            interesse: leadNormalizado.interesse || existingLead.interesse,
            origem: leadNormalizado.origem || existingLead.origem,
            status: leadNormalizado.status || existingLead.status,
            observacoes: leadNormalizado.observacoes || existingLead.observacoes,
            updatedAt: now,
          };
          
          await kv.set(`lead:${user.id}:${existingLead.id}`, updatedLead);
          leadsAtualizados++;
          console.log(`[N8N Sync] ✅ Lead UPDATED: ${updatedLead.nome} (${updatedLead.id})`);
          
        } else {
          // ✅ NEW LEAD - CREATE IT
          console.log(`[N8N Sync] ➕ CREATING new lead: ${leadNormalizado.nome}`);
          
          // Check if we've reached the limit for NEW leads
          if (leadsAdicionados >= availableSlots) {
            console.log('[N8N Sync] ⚠️ Limit reached for new leads, stopping import');
            erros += (leadsRecebidos.length - i);
            break;
          }
          
          const leadId = crypto.randomUUID();
          const lead = {
            id: leadId,
            userId: user.id,
            nome: leadNormalizado.nome,
            email: leadNormalizado.email,
            telefone: leadNormalizado.telefone,
            empresa: leadNormalizado.empresa,
            cargo: leadNormalizado.cargo,
            interesse: leadNormalizado.interesse,
            origem: leadNormalizado.origem,
            status: leadNormalizado.status,
            observacoes: leadNormalizado.observacoes,
            data: now.split('T')[0],
            createdAt: now,
            updatedAt: now,
            marcado_email: false,
          };
          
          await kv.set(`lead:${user.id}:${leadId}`, lead);
          leadsAdicionados++;
          console.log(`[N8N Sync] ✅ Lead CREATED: ${lead.nome} (${leadId})`);
        }

      } catch (error: any) {
        console.error('[N8N Sync] ❌ Error processing lead:', error);
        erros++;
      }
    }

    // Update user usage (only count NEW leads, not updated ones)
    if (userProfile && leadsAdicionados > 0) {
      userProfile.usage = userProfile.usage || { leads: 0, messages: 0, massMessages: 0 };
      userProfile.usage.leads = currentCount + leadsAdicionados;
      await kv.set(`user:${user.id}`, userProfile);
    }

    console.log(`[N8N Sync] ====== SYNC COMPLETE ======`);
    console.log(`[N8N Sync] ✅ NEW leads created: ${leadsAdicionados}`);
    console.log(`[N8N Sync] 🔄 Existing leads updated: ${leadsAtualizados}`);
    console.log(`[N8N Sync] ❌ Errors: ${erros}`);
    console.log(`[N8N Sync] 📊 Total processed: ${leadsRecebidos.length}`);
    console.log(`[N8N Sync] ============================`);

    return c.json({
      success: true,
      message: `Processados ${leadsRecebidos.length} leads do Google Sheets`,
      added: leadsAdicionados,
      updated: leadsAtualizados,
      errors: erros,
      total: leadsRecebidos.length,
      limitReached: leadsAdicionados < (leadsRecebidos.length - erros - leadsAtualizados)
    });

  } catch (error: any) {
    console.error('[N8N Sync] Error:', error);
    return c.json({ 
      error: 'Internal server error',
      details: error.message 
    }, 500);
  }
});

// ============================================
// UTILITY: REMOVE DUPLICATE LEADS
// ============================================

// Remove duplicate leads for a user
app.post('/make-server-4be966ab/leads/remove-duplicates', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    console.log('[Remove Duplicates] 🔧 Starting duplicate removal for user:', user.id);
    
    // Get all leads for this user
    const allLeadsRaw = await kv.getByPrefix(`lead:${user.id}:`);
    
    if (!allLeadsRaw || allLeadsRaw.length === 0) {
      return c.json({
        success: true,
        message: 'No leads found',
        removed: 0,
        remaining: 0
      });
    }
    
    console.log(`[Remove Duplicates] 📊 Found ${allLeadsRaw.length} total leads`);
    
    // Track unique leads by email and phone
    const uniqueByEmail = new Map<string, any>();
    const uniqueByPhone = new Map<string, any>();
    const leadsToKeep = new Map<string, any>();
    const leadsToRemove: string[] = [];
    
    // First pass: identify unique leads (keep the oldest one)
    for (const lead of allLeadsRaw) {
      if (!lead || typeof lead !== 'object' || !lead.id) continue;
      
      const email = (lead.email || '').trim().toLowerCase();
      const phone = (lead.telefone || lead.phone || '').trim().replace(/\D/g, '');
      const createdAt = lead.createdAt || new Date().toISOString();
      
      let isDuplicate = false;
      
      // Check email duplicates
      if (email && email.length > 0) {
        if (uniqueByEmail.has(email)) {
          const existingLead = uniqueByEmail.get(email);
          // Keep the older lead (created first)
          if (createdAt > existingLead.createdAt) {
            isDuplicate = true;
            console.log(`[Remove Duplicates] ⚠️ Duplicate by EMAIL: ${lead.nome} (${email}) - keeping older lead`);
          } else {
            // Current lead is older, mark existing one as duplicate
            leadsToRemove.push(existingLead.id);
            uniqueByEmail.set(email, lead);
            leadsToKeep.set(lead.id, lead);
            isDuplicate = false;
          }
        } else {
          uniqueByEmail.set(email, lead);
        }
      }
      
      // Check phone duplicates (only if not already marked as duplicate by email)
      if (!isDuplicate && phone && phone.length >= 8) {
        if (uniqueByPhone.has(phone)) {
          const existingLead = uniqueByPhone.get(phone);
          // Keep the older lead (created first)
          if (createdAt > existingLead.createdAt) {
            isDuplicate = true;
            console.log(`[Remove Duplicates] ⚠️ Duplicate by PHONE: ${lead.nome} (${phone}) - keeping older lead`);
          } else {
            // Current lead is older, mark existing one as duplicate
            leadsToRemove.push(existingLead.id);
            uniqueByPhone.set(phone, lead);
            leadsToKeep.set(lead.id, lead);
            isDuplicate = false;
          }
        } else {
          uniqueByPhone.set(phone, lead);
        }
      }
      
      // Add to appropriate list
      if (isDuplicate) {
        leadsToRemove.push(lead.id);
      } else if (!leadsToKeep.has(lead.id)) {
        leadsToKeep.set(lead.id, lead);
      }
    }
    
    console.log(`[Remove Duplicates] 📊 Analysis complete:`, {
      total: allLeadsRaw.length,
      toKeep: leadsToKeep.size,
      toRemove: leadsToRemove.length
    });
    
    // Remove duplicate leads
    let removedCount = 0;
    for (const leadId of leadsToRemove) {
      try {
        await kv.delete(`lead:${user.id}:${leadId}`);
        removedCount++;
        console.log(`[Remove Duplicates] 🗑️ Removed duplicate lead: ${leadId}`);
      } catch (error) {
        console.error(`[Remove Duplicates] ❌ Error removing lead ${leadId}:`, error);
      }
    }
    
    // Update user usage count
    const userProfile = await kv.get(`user:${user.id}`);
    if (userProfile) {
      userProfile.usage = userProfile.usage || { leads: 0, messages: 0, massMessages: 0 };
      userProfile.usage.leads = leadsToKeep.size;
      await kv.set(`user:${user.id}`, userProfile);
      console.log(`[Remove Duplicates] 📊 Updated user usage: ${leadsToKeep.size} leads`);
    }
    
    console.log(`[Remove Duplicates] ✅ Complete - Removed: ${removedCount}, Remaining: ${leadsToKeep.size}`);
    
    return c.json({
      success: true,
      message: `Removidos ${removedCount} leads duplicados`,
      removed: removedCount,
      remaining: leadsToKeep.size,
      details: {
        totalBefore: allLeadsRaw.length,
        duplicatesFound: leadsToRemove.length,
        duplicatesRemoved: removedCount,
        uniqueLeads: leadsToKeep.size
      }
    });
    
  } catch (error: any) {
    console.error('[Remove Duplicates] ❌ Error:', error);
    return c.json({ 
      error: 'Internal server error',
      details: error.message 
    }, 500);
  }
});

// ============================================
// EMAIL MARKETING
// ============================================

// Send Email to Single Lead
app.post('/make-server-4be966ab/email/send', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { leadId, subject, message } = await c.req.json();

    if (!leadId || !subject || !message) {
      return c.json({ error: 'leadId, subject, and message are required' }, 400);
    }

    const lead = await kv.get(`lead:${user.id}:${leadId}`);

    if (!lead || !lead.email) {
      return c.json({ error: 'Lead not found or no email address' }, 404);
    }

    // TODO: Integrate with email service (SendGrid, Mailgun, etc.)
    // For now, just log and mark as sent
    console.log(`Sending email to ${lead.email}: ${subject}`);

    // Update lead
    lead.lastEmailedAt = new Date().toISOString();
    lead.notes = (lead.notes || '') + `\n[${new Date().toLocaleString()}] Email sent: ${subject}`;
    await kv.set(`lead:${user.id}:${leadId}`, lead);

    return c.json({
      success: true,
      message: 'Email sent successfully',
    });
  } catch (error) {
    console.error('Send email error:', error);
    return c.json({ error: 'Internal server error: ' + error.message }, 500);
  }
});

// Send Mass Email
app.post('/make-server-4be966ab/email/send-mass', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { leadIds, subject, message } = await c.req.json();

    if (!leadIds || !Array.isArray(leadIds) || !subject || !message) {
      return c.json({ error: 'leadIds array, subject, and message are required' }, 400);
    }

    const results = [];

    for (const leadId of leadIds) {
      try {
        const lead = await kv.get(`lead:${user.id}:${leadId}`);
        
        if (!lead || !lead.email) {
          results.push({ leadId, success: false, error: 'Lead not found or no email' });
          continue;
        }

        // Personalize message
        let personalizedMessage = message
          .replace(/\{nome\}/gi, lead.name || '')
          .replace(/\{email\}/gi, lead.email || '')
          .replace(/\{empresa\}/gi, lead.company || '');

        let personalizedSubject = subject
          .replace(/\{nome\}/gi, lead.name || '')
          .replace(/\{empresa\}/gi, lead.company || '');

        // TODO: Integrate with email service
        console.log(`Sending email to ${lead.email}: ${personalizedSubject}`);

        // Update lead
        lead.lastEmailedAt = new Date().toISOString();
        lead.notes = (lead.notes || '') + `\n[${new Date().toLocaleString()}] Mass email: ${personalizedSubject}`;
        await kv.set(`lead:${user.id}:${leadId}`, lead);

        results.push({ leadId, success: true });

        // Small delay between emails
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        results.push({ leadId, success: false, error: error.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return c.json({
      success: true,
      results,
      summary: {
        total: leadIds.length,
        successful: successCount,
        failed: failCount,
      },
    });
  } catch (error) {
    console.error('Send mass email error:', error);
    return c.json({ error: 'Internal server error: ' + error.message }, 500);
  }
});

// ============================================
// ANALYTICS & TRACKING
// ============================================

// Update Meta Pixel ID
app.post('/make-server-4be966ab/tracking/meta-pixel', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { pixelId } = await c.req.json();

    const userProfile = await kv.get(`user:${user.id}`);

    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    userProfile.metaPixelId = pixelId || null;
    await kv.set(`user:${user.id}`, userProfile);

    return c.json({ success: true, pixelId });
  } catch (error) {
    console.error('Update Meta Pixel error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update Google Analytics ID
app.post('/make-server-4be966ab/tracking/google-analytics', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { measurementId } = await c.req.json();

    const userProfile = await kv.get(`user:${user.id}`);

    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    userProfile.googleAnalyticsId = measurementId || null;
    await kv.set(`user:${user.id}`, userProfile);

    return c.json({ success: true, measurementId });
  } catch (error) {
    console.error('Update Google Analytics error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ============================================
// WEBHOOK SETTINGS
// ============================================

// Get webhook settings
app.get('/make-server-4be966ab/webhooks/settings', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const userProfile = await kv.get(`user:${user.id}`);

    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    return c.json({
      success: true,
      webhookSettings: {
        n8nWebhookUrl: userProfile.n8nWebhookUrl || '',
        metaPixelId: userProfile.metaPixelId || '',
        googleAnalyticsId: userProfile.googleAnalyticsId || '',
      },
    });
  } catch (error) {
    console.error('Get webhook settings error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update webhook settings
app.put('/make-server-4be966ab/webhooks/settings', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { n8nWebhookUrl, metaPixelId, googleAnalyticsId } = await c.req.json();

    const userProfile = await kv.get(`user:${user.id}`);

    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    // Update webhook settings
    if (n8nWebhookUrl !== undefined) userProfile.n8nWebhookUrl = n8nWebhookUrl;
    if (metaPixelId !== undefined) userProfile.metaPixelId = metaPixelId;
    if (googleAnalyticsId !== undefined) userProfile.googleAnalyticsId = googleAnalyticsId;

    await kv.set(`user:${user.id}`, userProfile);

    return c.json({
      success: true,
      webhookSettings: {
        n8nWebhookUrl: userProfile.n8nWebhookUrl || '',
        metaPixelId: userProfile.metaPixelId || '',
        googleAnalyticsId: userProfile.googleAnalyticsId || '',
      },
    });
  } catch (error) {
    console.error('Update webhook settings error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ============================================
// SMTP SETTINGS
// ============================================

// Get SMTP settings
app.get('/make-server-4be966ab/smtp/settings', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const userProfile = await kv.get(`user:${user.id}`);

    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    return c.json({
      success: true,
      settings: userProfile.smtpSettings || {
        host: '',
        port: 587,
        user: '',
        password: '',
        from: '',
        enabled: false,
      },
    });
  } catch (error) {
    console.error('Get SMTP settings error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// Update SMTP settings
app.post('/make-server-4be966ab/smtp/settings', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const smtpSettings = await c.req.json();

    const userProfile = await kv.get(`user:${user.id}`);

    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    userProfile.smtpSettings = {
      host: smtpSettings.host || '',
      port: smtpSettings.port || 587,
      user: smtpSettings.user || '',
      password: smtpSettings.password || '',
      from: smtpSettings.from || '',
      enabled: smtpSettings.enabled || false,
    };

    await kv.set(`user:${user.id}`, userProfile);

    return c.json({
      success: true,
      settings: userProfile.smtpSettings,
    });
  } catch (error) {
    console.error('Update SMTP settings error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ============================================
// USAGE TRACKING ROUTES
// ============================================

// Increment usage counter
app.post('/make-server-4be966ab/usage/increment', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const { type, quantity } = await c.req.json();

    console.log(`[Usage Increment] User: ${user.id}, Type: ${type}, Quantity: ${quantity || 1}`);

    if (!type) {
      return c.json({ error: 'Usage type is required' }, 400);
    }

    // Validate type
    const validTypes = ['messages', 'massMessages', 'leads', 'campaigns'];
    if (!validTypes.includes(type)) {
      return c.json({ error: `Invalid usage type. Must be one of: ${validTypes.join(', ')}` }, 400);
    }

    const userProfile = await kv.get(`user:${user.id}`);

    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    // Ensure usage object exists
    if (!userProfile.usage) {
      userProfile.usage = {
        leads: 0,
        messages: 0,
        massMessages: 0,
        campaigns: 0,
      };
    }

    // Increment usage
    const incrementAmount = quantity || 1;
    userProfile.usage[type] = (userProfile.usage[type] || 0) + incrementAmount;

    console.log(`[Usage Increment] Updated usage for ${type}: ${userProfile.usage[type]}`);

    // Save updated profile
    await kv.set(`user:${user.id}`, userProfile);

    return c.json({
      success: true,
      type,
      incrementedBy: incrementAmount,
      usage: userProfile.usage,
      limits: userProfile.limits,
    });
  } catch (error) {
    console.error('[Usage Increment] Error:', error);
    return c.json({ error: 'Internal server error while incrementing usage' }, 500);
  }
});

// Get current usage
app.get('/make-server-4be966ab/usage', authMiddleware, async (c) => {
  try {
    const user = c.get('user');

    const userProfile = await kv.get(`user:${user.id}`);

    if (!userProfile) {
      return c.json({ error: 'User profile not found' }, 404);
    }

    // Ensure usage object exists
    if (!userProfile.usage) {
      userProfile.usage = {
        leads: 0,
        messages: 0,
        massMessages: 0,
        campaigns: 0,
      };
    }

    return c.json({
      usage: userProfile.usage,
      limits: userProfile.limits,
      plan: userProfile.plan,
    });
  } catch (error) {
    console.error('[Usage Get] Error:', error);
    return c.json({ error: 'Internal server error while fetching usage' }, 500);
  }
});

// ============================================
// PAYPAL ROUTES
// ============================================

// Activate PayPal subscription (requires authentication)
app.post('/make-server-4be966ab/paypal/activate-subscription', authMiddleware, activateSubscription);

// PayPal webhook handler (public endpoint for PayPal webhooks)
app.post('/make-server-4be966ab/paypal/webhook', handleWebhook);

// ============================================
// ADMIN ROUTES
// ============================================

// Check if user is admin
const checkIfAdmin = async (userId: string): Promise<boolean> => {
  try {
    const userKey = `user:${userId}`;
    const userProfile = await kv.get(userKey);
    
    if (!userProfile) {
      console.log(`[Admin Check] User profile not found for userId: ${userId}`);
      return false;
    }

    // Check if user is admin (accept both leadflow and leadsflow variants)
    const isAdmin = userProfile.isAdmin === true || 
                    userProfile.email === 'admin@leadflow.com' ||
                    userProfile.email === 'admin@leadsflow.com';
    
    console.log(`[Admin Check] User ${userProfile.email} - isAdmin: ${isAdmin}`);
    return isAdmin;
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
};

// Get all users (admin only)
app.get('/make-server-4be966ab/admin/users', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const isAdmin = await checkIfAdmin(user.id);
    
    if (!isAdmin) {
      return c.json({ success: false, message: 'Acesso negado. Apenas administradores.' }, 403);
    }

    console.log('[Admin] Loading all users... (using getByPrefix v2)');
    
    // Get all user keys using getByPrefix
    const allUsers: any[] = [];
    
    try {
      // Get all keys starting with 'user:'
      console.log('[Admin] Calling kv.getByPrefix("user:")...');
      const usersData = await kv.getByPrefix('user:');
      console.log(`[Admin] getByPrefix returned ${usersData?.length || 0} items`);
      
      if (!usersData || !Array.isArray(usersData)) {
        console.error('[Admin] getByPrefix did not return an array:', usersData);
        throw new Error('getByPrefix returned invalid data');
      }
      
      for (const userData of usersData) {
        try {
          if (userData && userData.email) {
            allUsers.push({
              id: userData.id,
              email: userData.email,
              name: userData.name,
              plan: userData.plan || 'free',
              planExpiresAt: userData.planExpiresAt,
              createdAt: userData.createdAt,
            });
          }
        } catch (error) {
          console.error(`[Admin] Error processing user data:`, error);
        }
      }
    } catch (kvError: any) {
      console.error('[Admin] KV error:', kvError);
      console.error('[Admin] KV error message:', kvError?.message);
      console.error('[Admin] Available kv functions:', Object.keys(kv));
      throw new Error(`KV operation failed: ${kvError?.message}`);
    }

    // Sort by creation date (newest first)
    allUsers.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    console.log(`[Admin] Returning ${allUsers.length} users`);
    return c.json({ success: true, users: allUsers });
  } catch (error: any) {
    console.error('[Admin] CRITICAL ERROR getting users:', error);
    console.error('[Admin] Error message:', error?.message);
    console.error('[Admin] Error stack:', error?.stack);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// Activate plan for a user (admin only)
app.post('/make-server-4be966ab/admin/activate-plan', authMiddleware, async (c) => {
  try {
    const adminUser = c.get('user');
    const isAdmin = await checkIfAdmin(adminUser.id);
    
    if (!isAdmin) {
      return c.json({ success: false, message: 'Acesso negado. Apenas administradores.' }, 403);
    }

    const { userId, planId, expiresAt } = await c.req.json();

    if (!userId || !planId) {
      return c.json({ success: false, message: 'userId e planId são obrigatórios' }, 400);
    }

    // Get user profile
    const userKey = `user:${userId}`;
    const userProfile = await kv.get(userKey);

    if (!userProfile) {
      return c.json({ success: false, message: 'Usuário não encontrado' }, 404);
    }

    // Define plan limits
    const planLimits: Record<string, any> = {
      free: {
        leads: 100,
        messages: 100,
        massMessages: 200,
        bulkMessages: 200,
        campaigns: 3,
      },
      business: {
        leads: 500,
        messages: 500,
        massMessages: 1000,
        bulkMessages: 1000,
        campaigns: 50,
      },
      enterprise: {
        leads: -1, // unlimited
        messages: -1,
        massMessages: -1,
        bulkMessages: -1,
        campaigns: -1,
      },
    };

    const limits = planLimits[planId] || planLimits.free;

    // Update user profile
    const updatedProfile = {
      ...userProfile,
      plan: planId,
      planExpiresAt: expiresAt || null,
      limits,
      updatedAt: new Date().toISOString(),
    };

    await kv.set(userKey, updatedProfile);

    // Log activity
    const activityKey = `activity:${userId}:${Date.now()}`;
    await kv.set(activityKey, {
      userId,
      action: 'plan_activated_by_admin',
      planId,
      expiresAt,
      timestamp: new Date().toISOString(),
      adminId: adminUser.id,
    });

    return c.json({
      success: true,
      message: 'Plano ativado com sucesso',
      user: updatedProfile,
    });
  } catch (error: any) {
    console.error('Error activating plan:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// ============================================
// UPDATE USER LIMITS ROUTE (for existing users with old limits)
// ============================================

// Update user limits to new values (self-service)
app.post('/make-server-4be966ab/update-my-limits', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const userKey = `user:${user.id}`;
    const userProfile = await kv.get(userKey);
    
    if (!userProfile) {
      return c.json({ success: false, message: 'Usuário não encontrado' }, 404);
    }

    // Define updated plan limits based on current plan
    const planLimits: Record<string, any> = {
      free: {
        leads: 100,
        messages: 100,
        massMessages: 200,
        bulkMessages: 200,
        campaigns: 3,
      },
      business: {
        leads: 500,
        messages: 500,
        massMessages: 1000,
        bulkMessages: 1000,
        campaigns: 50,
      },
      enterprise: {
        leads: -1, // unlimited
        messages: -1,
        massMessages: -1,
        bulkMessages: -1,
        campaigns: -1,
      },
    };

    const currentPlan = userProfile.plan || 'free';
    const updatedLimits = planLimits[currentPlan] || planLimits.free;

    // Update user profile with new limits
    const updatedProfile = {
      ...userProfile,
      limits: updatedLimits,
      updatedAt: new Date().toISOString(),
    };

    await kv.set(userKey, updatedProfile);

    console.log(`[Update Limits] Updated limits for user ${user.email} (${currentPlan}):`, updatedLimits);

    return c.json({
      success: true,
      message: 'Limites atualizados com sucesso',
      user: updatedProfile,
    });
  } catch (error: any) {
    console.error('[Update Limits] Error:', error);
    return c.json({ success: false, message: error.message }, 500);
  }
});

// ============================================
// NOTIFICATIONS ROUTES
// ============================================

// Get user notifications
app.get('/make-server-4be966ab/notifications', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const userProfile = await kv.get(`user:${user.id}`);
    
    if (!userProfile) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Get all notifications for this user
    const notifications = await kv.getByPrefix(`notification:${user.id}:`);
    
    // Sort by timestamp (newest first)
    const sortedNotifications = notifications.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return c.json({
      success: true,
      notifications: sortedNotifications
    });
  } catch (error: any) {
    console.error('Error fetching notifications:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Mark notification as read
app.put('/make-server-4be966ab/notifications/:notificationId/read', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const notificationId = c.req.param('notificationId');
    
    const notification = await kv.get(`notification:${user.id}:${notificationId}`);
    
    if (!notification) {
      return c.json({ error: 'Notification not found' }, 404);
    }

    // Update notification as read
    notification.read = true;
    await kv.set(`notification:${user.id}:${notificationId}`, notification);

    return c.json({ success: true, notification });
  } catch (error: any) {
    console.error('Error marking notification as read:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ✅ Mark all notifications as read
app.put('/make-server-4be966ab/notifications/mark-all-read', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    // Get all notifications for this user
    const notifications = await kv.getByPrefix(`notification:${user.id}:`);
    
    // Update all as read
    const updates = notifications.map(async (notification) => {
      notification.read = true;
      await kv.set(`notification:${user.id}:${notification.id}`, notification);
    });
    
    await Promise.all(updates);

    return c.json({ success: true, count: notifications.length });
  } catch (error: any) {
    console.error('Error marking all notifications as read:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ✅ Remove single notification
app.delete('/make-server-4be966ab/notifications/:notificationId', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const notificationId = c.req.param('notificationId');
    
    const notification = await kv.get(`notification:${user.id}:${notificationId}`);
    
    if (!notification) {
      return c.json({ error: 'Notification not found' }, 404);
    }

    await kv.del(`notification:${user.id}:${notificationId}`);

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error removing notification:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ✅ Clear all notifications
app.delete('/make-server-4be966ab/notifications/clear-all', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    // Get all notifications for this user
    const notifications = await kv.getByPrefix(`notification:${user.id}:`);
    
    // Delete all
    const deletions = notifications.map(notification => 
      kv.del(`notification:${user.id}:${notification.id}`)
    );
    
    await Promise.all(deletions);

    return c.json({ success: true, count: notifications.length });
  } catch (error: any) {
    console.error('Error clearing notifications:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ✅ Create new notification
app.post('/make-server-4be966ab/notifications', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    
    const notificationId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const notification = {
      id: notificationId,
      type: body.type,
      title: body.title,
      message: body.message,
      timestamp: new Date().toISOString(),
      read: false,
      actionLabel: body.actionLabel,
      actionUrl: body.actionUrl,
      metadata: body.metadata,
    };
    
    await kv.set(`notification:${user.id}:${notificationId}`, notification);

    return c.json({ success: true, notification });
  } catch (error: any) {
    console.error('Error creating notification:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ✅ Create batch notifications
app.post('/make-server-4be966ab/notifications/batch', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    const body = await c.req.json();
    const notifications = body.notifications || [];
    
    const created = await Promise.all(
      notifications.map(async (notif: any) => {
        const notificationId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        const notification = {
          id: notificationId,
          type: notif.type,
          title: notif.title,
          message: notif.message,
          timestamp: new Date().toISOString(),
          read: false,
          actionLabel: notif.actionLabel,
          actionUrl: notif.actionUrl,
          metadata: notif.metadata,
        };
        
        await kv.set(`notification:${user.id}:${notificationId}`, notification);
        return notification;
      })
    );

    return c.json({ success: true, count: created.length, notifications: created });
  } catch (error: any) {
    console.error('Error creating batch notifications:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get admin notification settings
app.get('/make-server-4be966ab/admin/notification-settings', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    console.log('[Admin Notification Settings] User requesting:', user?.email);
    
    // Check if user is admin using the same function as other admin endpoints
    const isAdmin = await checkIfAdmin(user.id);
    if (!isAdmin) {
      console.error('[Admin Notification Settings] Unauthorized access attempt by:', user.email);
      return c.json({ success: false, error: 'Unauthorized' }, 403);
    }

    const settings = await kv.get(`admin:notification-settings`) || {
      upgradeNotifications: true,
      newUserNotifications: false,
      paymentNotifications: true,
    };

    console.log('[Admin Notification Settings] Retrieved settings:', settings);
    return c.json({ success: true, settings });
  } catch (error: any) {
    console.error('Error fetching notification settings:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Update admin notification settings
app.post('/make-server-4be966ab/admin/notification-settings', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    
    console.log('[Admin Notification Settings Update] User requesting:', user?.email);
    
    // Check if user is admin using the same function as other admin endpoints
    const isAdmin = await checkIfAdmin(user.id);
    if (!isAdmin) {
      console.error('[Admin Notification Settings Update] Unauthorized access attempt by:', user.email);
      return c.json({ success: false, error: 'Unauthorized' }, 403);
    }

    const body = await c.req.json();
    await kv.set(`admin:notification-settings`, body);

    console.log('[Admin Notification Settings Update] Saved settings:', body);
    return c.json({ success: true, settings: body });
  } catch (error: any) {
    console.error('Error updating notification settings:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Helper function to create notification for admin
async function createAdminNotification(type: string, message: string, metadata: any = {}) {
  try {
    // Get admin user - check both possible admin emails
    const supabase = getSupabaseClient();
    const { data: adminAuthData } = await supabase.auth.admin.listUsers();
    const adminEmails = ['admin@leadflow.com', 'admin@leadsflow.com'];
    const adminUser = adminAuthData?.users?.find(u => adminEmails.includes(u.email || ''));
    
    if (!adminUser) {
      console.log('Admin user not found, skipping notification');
      return;
    }

    // Check if admin has this notification type enabled
    const settings = await kv.get(`admin:notification-settings`) || {
      upgradeNotifications: true,
      newUserNotifications: false,
      paymentNotifications: true,
    };

    // Check if notification should be sent
    if (type === 'upgrade' && !settings.upgradeNotifications) {
      console.log('Upgrade notifications disabled for admin');
      return;
    }
    if (type === 'new_user' && !settings.newUserNotifications) {
      console.log('New user notifications disabled for admin');
      return;
    }
    if (type === 'payment' && !settings.paymentNotifications) {
      console.log('Payment notifications disabled for admin');
      return;
    }

    const notificationId = crypto.randomUUID();
    const notification = {
      id: notificationId,
      type,
      message,
      metadata,
      read: false,
      timestamp: new Date().toISOString(),
    };

    await kv.set(`notification:${adminUser.id}:${notificationId}`, notification);
    console.log(`Admin notification created: ${type} - ${message}`);
  } catch (error) {
    console.error('Error creating admin notification:', error);
  }
}

// ============================================
// 🧪 ROTA DE TESTE - Testar Webhook N8N
// ============================================
app.post('/make-server-4be966ab/test-webhook', authMiddleware, async (c) => {
  try {
    const user = c.get('user');
    console.log('[Test Webhook] 🧪 Testing webhook for user:', user.id);

    // Buscar configurações do usuário
    const userProfile = await kv.get(`user:${user.id}`);
    
    if (!userProfile) {
      return c.json({ 
        error: 'User profile not found',
        userId: user.id 
      }, 404);
    }

    const n8nWebhookUrl = userProfile.n8nWebhookUrl;
    const instanceName = userProfile.whatsappInstance?.instanceName || null;

    console.log('[Test Webhook] 📱 Instance Name:', instanceName);
    console.log('[Test Webhook] 🔗 Webhook URL:', n8nWebhookUrl);

    if (!n8nWebhookUrl) {
      return c.json({ 
        error: 'Webhook N8N não configurado',
        help: 'Configure o webhook na aba Integrações primeiro',
        hasInstanceName: !!instanceName,
        instanceName: instanceName
      }, 400);
    }

    // Criar payload de teste
    const testPayload = {
      event: 'test.webhook',
      timestamp: new Date().toISOString(),
      data: {
        message: 'Este é um teste do webhook N8N',
        userId: user.id,
        userEmail: user.email,
        instanceName: instanceName,
        testId: crypto.randomUUID()
      }
    };

    console.log('[Test Webhook] 📦 Sending test payload:', JSON.stringify(testPayload, null, 2));

    // Enviar requisição de teste
    try {
      await notifyN8NWebhook(n8nWebhookUrl, 'test.webhook', {
        message: 'Este é um teste do webhook N8N',
        userId: user.id,
        userEmail: user.email,
        instanceName: instanceName,
        testId: crypto.randomUUID()
      });

      return c.json({ 
        success: true,
        message: '✅ Webhook enviado com sucesso!',
        webhookUrl: n8nWebhookUrl,
        instanceName: instanceName,
        testPayload: testPayload
      });
    } catch (webhookError: any) {
      console.error('[Test Webhook] ❌ Webhook error:', webhookError);
      return c.json({ 
        error: 'Falha ao enviar webhook',
        details: webhookError.message,
        webhookUrl: n8nWebhookUrl,
        instanceName: instanceName
      }, 500);
    }
  } catch (error: any) {
    console.error('[Test Webhook] ❌ Error:', error);
    return c.json({ 
      error: 'Internal server error',
      details: error.message 
    }, 500);
  }
});

// ============================================
// CHAT ASSISTANT WITH OPENAI
// ============================================

app.post('/make-server-4be966ab/chat/message', async (c) => {
  try {
    const body = await c.req.json();
    const { userId, userName, message, sessionId, context } = body;

    console.log('[Chat] 💬 New message:', {
      userId: userId || 'anonymous',
      userName,
      message: message.substring(0, 50) + '...',
      sessionId,
      context
    });

    // Get OpenAI API key
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      console.error('[Chat] ❌ OpenAI API key not configured');
      return c.json({
        response: 'Desculpe, o assistente inteligente não está configurado. Por favor, entre em contato com o suporte.',
        quickReplies: [
          { text: '📧 Enviar Email', action: 'email_support' },
          { text: '📊 Ver Dashboard', action: 'navigate:/dashboard' }
        ]
      }, 200);
    }

    // Build conversation context for LeadsFlow
    const systemPrompt = `Você é o Assistente Virtual Inteligente do LeadsFlow, um CRM especializado em automação de WhatsApp e gestão de leads.

🎯 **SEU PAPEL:** Você é um CONSULTOR EDUCATIVO, NÃO apenas um menu de navegação.

**❌ NÃO FAÇA ISSO:**
- Redirecionar o usuário sem explicar primeiro
- Agir como menu interativo
- Dar respostas genéricas

**✅ FAÇA ISSO:**
- Responda PERGUNTAS de forma educativa
- Explique COMO usar funcionalidades (passo a passo)
- Ajude a RESOLVER PROBLEMAS com verificações
- Ofereça DICAS e MELHORES PRÁTICAS
- Só redirecione APÓS explicar

**SOBRE O LEADSFLOW:**
- 📊 **Funil Kanban:** Gestão visual com 6 etapas (Novos → Contatados → Qualificados → Negociação → Convertidos → Perdidos). Arraste cards entre colunas
- 💬 **WhatsApp:** Integração via Evolution API para mensagens individuais e em massa
- 📥 **Importação:** CSV/Excel com mapeamento de colunas
- ✅ **Tarefas:** 7 tipos (ligação, email, whatsapp, reunião, follow-up, proposta, outro) com lembretes automáticos
- 🔔 **Notificações:** Automáticas para tarefas atrasadas, lembretes, novos leads
- 🤖 **Automação:** Webhooks N8N para remarketing e follow-up
- 📈 **Analytics:** Métricas de conversão, funil e desempenho

**Planos disponíveis:**
- 🆓 **Free:** 100 leads, 50 mensagens individuais/mês, 10 em massa/mês
- 💼 **Business:** 500 leads, 200 individuais, 50 em massa
- 👑 **Enterprise:** ILIMITADO em tudo, suporte VIP 24/7

**Contexto do usuário atual:**
- Nome: ${userName || 'Usuário'}
- Plano: ${context?.userPlan || 'free'}
- Página: ${context?.currentPage || 'dashboard'}

**INSTRUÇÕES DE COMPORTAMENTO:**

1. **Entenda a INTENÇÃO:** O que o usuário realmente quer?
   - "Dashboard" = Pode querer ver estatísticas, ou só navegar
   - "Leads" = Pode querer adicionar, importar, ou ver lista
   - Faça perguntas de clarificação se necessário

2. **Estrutura da resposta:**
   a) Reconheça a pergunta
   b) Dê explicação ÚTIL com passos claros (2-3 parágrafos max)
   c) Ofereça próximos passos práticos
   d) Dê 2-3 botões de ação contextual

3. **Tom de voz:**
   - Amigável mas profissional
   - Prestativo e paciente
   - Claro e objetivo
   - Use emojis com moderação (máx 3 por mensagem)

4. **Quando redirecionar:**
   - Só APÓS explicar a funcionalidade
   - Quando usuário pedir explicitamente
   - Quando fizer sentido contextualmente

**EXEMPLO DE RESPOSTA CORRETA:**
Usuário: "Como adiciono leads?"
Bot: "Você pode adicionar leads de 3 formas no LeadsFlow:

1️⃣ **Manualmente:** Clique em '+ Novo Lead' e preencha nome, telefone, email e tags

2️⃣ **Importação:** Faça upload de CSV/Excel. O sistema mapeia as colunas automaticamente

3️⃣ **WhatsApp:** Conecte sua conta Evolution API e sincronize contatos

Qual método você quer usar?"
[Botões: "➕ Adicionar Manual" | "📥 Importar CSV" | "💬 WhatsApp"]

**AÇÕES DISPONÍVEIS (quick replies):**
- navigate:/dashboard - Dashboard principal
- navigate:/leads - Gestão de leads
- navigate:/settings - Configurações
- navigate:/plans - Planos e preços
- contact_support - Suporte humano (dispara webhook N8N)
- human_support - Atendimento humano
- import_csv - Importar CSV
- whatsapp_integration - WhatsApp
- current_plan - Plano atual

**FORMATO DE RESPOSTA (JSON):**
{
  "response": "Resposta educativa e útil (máx 150 palavras)",
  "quickReplies": [
    { "text": "Emoji + Texto", "action": "ação_relevante" }
  ],
  "showSatisfaction": false
}

**IMPORTANTE:**
- Retorne APENAS JSON válido
- NÃO seja um menu de navegação
- EDUQUE antes de redirecionar
- Seja ESPECÍFICO nos passos
- Use português do Brasil
- "showSatisfaction": true apenas ao finalizar ou escalar para humano

**LEMBRE-SE:** Seu trabalho é ENSINAR o usuário a usar o LeadsFlow, não apenas dizer onde clicar!`;

    // Log to confirm new educational prompt is active
    const timestamp = new Date().toISOString();
    console.log(`[Chat] 🧠 Using EDUCATIONAL CONSULTANT prompt (v2.0) at ${timestamp}`);
    console.log('[Chat] 📏 Prompt length:', systemPrompt.length, 'characters');
    console.log('[Chat] 🔑 First 100 chars of prompt:', systemPrompt.substring(0, 100));

    // Call OpenAI API
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: message
          }
        ],
        temperature: 0.8,
        max_tokens: 600,
        response_format: { type: 'json_object' }
      })
    });

    if (!openaiResponse.ok) {
      const errorData = await openaiResponse.json();
      console.error('[Chat] ❌ OpenAI API error:', errorData);
      
      return c.json({
        response: 'Desculpe, estou com dificuldades técnicas no momento. Por favor, tente novamente em alguns instantes ou entre em contato com o suporte.',
        quickReplies: [
          { text: '📧 Suporte', action: 'contact_support' },
          { text: '🔄 Tentar Novamente', action: 'retry' }
        ]
      }, 200);
    }

    const openaiData = await openaiResponse.json();
    const assistantMessage = openaiData.choices[0]?.message?.content;

    console.log('[Chat] ✅ OpenAI response received');

    // Parse JSON response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(assistantMessage);
    } catch (parseError) {
      console.error('[Chat] ⚠️ Failed to parse JSON, using raw response');
      parsedResponse = {
        response: assistantMessage,
        quickReplies: []
      };
    }

    // Log conversation to KV store (for analytics)
    try {
      const conversationKey = `chat_conversation:${sessionId}:${Date.now()}`;
      await kv.set(conversationKey, {
        userId: userId || 'anonymous',
        userName,
        userMessage: message,
        botResponse: parsedResponse.response,
        timestamp: new Date().toISOString(),
        context
      });
      console.log('[Chat] 📝 Conversation logged');
    } catch (logError) {
      console.error('[Chat] ⚠️ Failed to log conversation:', logError);
    }

    return c.json(parsedResponse);

  } catch (error: any) {
    console.error('[Chat] ❌ Error:', error);
    return c.json({
      response: 'Desculpe, ocorreu um erro inesperado. Nossa equipe foi notificada. Por favor, tente novamente ou entre em contato com o suporte.',
      quickReplies: [
        { text: '📧 Suporte', action: 'contact_support' },
        { text: '📊 Dashboard', action: 'navigate:/dashboard' }
      ]
    }, 200);
  }
});

// ============================================
// CAMPAIGNS ROUTES
// ============================================
app.route('/make-server-4be966ab/campaigns', campaignsApp);
app.route('/make-server-4be966ab/api', campaignsV2App);

Deno.serve(app.fetch);
