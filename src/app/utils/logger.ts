/**
 * Centralised logger — dev-only output.
 *
 * In development  → delegates to console normally.
 * In production   → all methods are no-ops (also stripped by Vite esbuild.drop).
 * console.error   → always active (needed for error monitoring tools).
 */

const isDev = import.meta.env.DEV;

// eslint-disable-next-line @typescript-eslint/no-empty-function
const noop = () => {};

export const logger = {
  log: isDev ? (...args: any[]) => console.log(...args) : noop,
  info: isDev ? (...args: any[]) => console.info(...args) : noop,
  warn: isDev ? (...args: any[]) => console.warn(...args) : noop,
  debug: isDev ? (...args: any[]) => console.debug(...args) : noop,
  /** Always active — use for real runtime errors only. */
  error: (...args: any[]) => console.error(...args),
} as const;
