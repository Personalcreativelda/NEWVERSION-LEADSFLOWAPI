// Texto de erro para o utilizador a partir de um erro do axios/fetch: a mensagem que a API
// devolveu ({ error }) ou, sem ela, o texto de recurso (nunca "Request failed with status code 500").
export function apiErrorMessage(err: any, fallback: string): string {
  const fromApi = err?.response?.data?.error;
  return typeof fromApi === 'string' && fromApi.trim() ? fromApi : fallback;
}
