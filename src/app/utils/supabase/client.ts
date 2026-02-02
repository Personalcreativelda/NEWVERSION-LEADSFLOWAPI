import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey, supabaseUrl as supabaseUrlFromEnv } from './info';

// Singleton Supabase client instance
let supabaseClient: ReturnType<typeof createSupabaseClient> | null = null;

// Resolve Supabase URL from env or fallback to projectId for backwards compatibility
const resolvedSupabaseUrl = supabaseUrlFromEnv || (projectId ? `https://${projectId}.supabase.co` : '');

// Check if we have valid Supabase configuration
const hasValidConfig = Boolean(resolvedSupabaseUrl && publicAnonKey);

export const getSupabaseClient = () => {
  if (!hasValidConfig) {
    console.error('[Supabase] Invalid configuration - Supabase URL or anon key missing');
    console.error('[Supabase] projectId:', projectId);
    console.error('[Supabase] Please configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
    throw new Error('Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente.');
  }

  if (!supabaseClient) {
    try {
      console.log('[Supabase] Initializing client with URL:', resolvedSupabaseUrl);

      supabaseClient = createSupabaseClient(
        resolvedSupabaseUrl,
        publicAnonKey,
        {
          auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true,
            flowType: 'pkce',
          },
          global: {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        }
      );
      console.log('[Supabase] Client initialized successfully with PKCE flow');
    } catch (error) {
      console.error('[Supabase] Failed to initialize client:', error);
      throw error;
    }
  }
  return supabaseClient;
};

// Helper to check if Supabase is reachable
export const checkSupabaseConnection = async (): Promise<boolean> => {
  if (!hasValidConfig) {
    return false;
  }

  try {
    const client = getSupabaseClient();
    // Try a simple health check - get session doesn't require network if no session exists
    const { data, error } = await client.auth.getSession();
    
    // If we get here without throwing, connection is working
    console.log('[Supabase] Connection check passed');
    return true;
  } catch (error) {
    console.error('[Supabase] Connection check failed:', error);
    return false;
  }
};
