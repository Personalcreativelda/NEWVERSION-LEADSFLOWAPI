const normalizeUrl = (value: string | undefined): string => {
  if (!value) return '';
  return value.trim().replace(/\/$/, '');
};

const resolveProjectId = (url: string): string => {
  if (!url) return '';
  try {
    const hostname = new URL(url).hostname;
    const [subdomain] = hostname.split('.');
    return subdomain || '';
  } catch (error) {
    console.error('[Supabase] Invalid VITE_SUPABASE_URL:', error);
    return '';
  }
};

const supabaseUrlEnv = normalizeUrl(import.meta.env.VITE_SUPABASE_URL as string | undefined);
const publicAnonKeyEnv = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

export const supabaseUrl = supabaseUrlEnv;
export const projectId = resolveProjectId(supabaseUrlEnv);
export const publicAnonKey = publicAnonKeyEnv;

export const supabaseFunctionsBaseUrl = supabaseUrlEnv
  ? `${supabaseUrlEnv}/functions/v1`
  : projectId
  ? `https://${projectId}.supabase.co/functions/v1`
  : '';

export const supabaseEdgeFunctionUrl = supabaseFunctionsBaseUrl
  ? `${supabaseFunctionsBaseUrl}/make-server-4be966ab`
  : '';
