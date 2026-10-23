/**
 * Liga uma instância axios ao cache offline: guarda as respostas GET e, quando o servidor
 * não responde, devolve a última cópia guardada (ver offlineCache.ts e serverStatus.ts).
 */
import axios, { type AxiosError, type AxiosInstance, type AxiosResponse } from 'axios';
import { GET_TIMEOUT_MS, loadCachedResponse, saveCachedResponse } from './offlineCache';
import { SERVER_DOWN_MESSAGE, isServerDownResponse, reportServerDown, reportServerUp } from './serverStatus';

const isGet = (method?: string) => (method ?? 'get').toLowerCase() === 'get';

function isServerDownError(error: AxiosError): boolean {
  if (axios.isCancel(error)) return false; // cancelado pelo próprio ecrã
  if (!error.response) return true; // sem rede, tempo esgotado, servidor inalcançável
  const contentType = error.response.headers?.['content-type'];
  return isServerDownResponse(error.response.status, typeof contentType === 'string' ? contentType : null, error.response.data);
}

export function withOfflineCache(api: AxiosInstance): AxiosInstance {
  api.interceptors.request.use((config) => {
    if (isGet(config.method) && !config.timeout) config.timeout = GET_TIMEOUT_MS;
    return config;
  });

  api.interceptors.response.use(
    (response) => {
      reportServerUp();
      if (isGet(response.config.method)) void saveCachedResponse(api.getUri(response.config), response.data);
      return response;
    },
    async (error: AxiosError) => {
      if (!isServerDownError(error)) return Promise.reject(error);

      const config = error.config;
      if (config && isGet(config.method)) {
        const cached = await loadCachedResponse(api.getUri(config));
        if (cached) {
          reportServerDown(cached.savedAt);
          return { data: cached.data, status: 200, statusText: 'OK', headers: {}, config } as AxiosResponse;
        }
      }

      reportServerDown();
      error.message = SERVER_DOWN_MESSAGE;
      (error as AxiosError & { isServerDown?: boolean }).isServerDown = true;
      return Promise.reject(error);
    },
  );

  return api;
}
