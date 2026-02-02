export const configureProxy = () => {
  // Proxy support disabled. This file remains to satisfy legacy imports.
  return;
};

export const getProxyAwareFetch = (): typeof fetch => {
  return fetch;
};