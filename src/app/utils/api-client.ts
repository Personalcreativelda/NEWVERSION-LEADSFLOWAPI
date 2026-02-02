const normalizeUrl = (value?: string) => (value ? value.trim().replace(/\/$/, '') : '');

const envApiUrl = normalizeUrl(import.meta.env.VITE_API_URL as string | undefined);

let resolvedApiUrl = envApiUrl;

if (!resolvedApiUrl && typeof window !== 'undefined') {
  resolvedApiUrl = normalizeUrl(window.location.origin);
}

if (!resolvedApiUrl) {
  console.error('[API] Missing backend URL. Configure VITE_API_URL or deploy dashboard with the API under the same origin.');
}

export const getApiBaseUrl = () => resolvedApiUrl;
