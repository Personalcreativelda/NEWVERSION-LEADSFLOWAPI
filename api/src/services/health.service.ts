/**
 * Saúde da API e recuperação automática.
 *
 * - isDatabaseHealthy: SELECT 1 com tempo máximo; o resultado é reutilizado durante 5 s
 *   (o app consulta /api/health a cada 15 s enquanto acha que o servidor está em baixo).
 * - startWatchdog (só em produção): se o processo ficar bloqueado mais de 90 s, ou a base de
 *   dados falhar 5 minutos seguidos, o processo termina e o Docker (restart: unless-stopped)
 *   arranca-o de novo, com ligações novas. Precisa de `init: true` no docker-compose: o
 *   processo 1 de um contentor ignora sinais enviados de dentro do próprio contentor.
 * - setupGracefulShutdown: num deploy (SIGTERM) deixa terminar os pedidos em curso.
 */
import type { Server } from 'http';
import { Worker } from 'worker_threads';
import { checkConnection, closePool } from '../database/connection';

const DB_CHECK_TIMEOUT_MS = 3_000;
const DB_CHECK_CACHE_MS = 5_000;

const HEARTBEAT_MS = 5_000;
const BLOCKED_LIMIT_MS = 90_000;
const DB_WATCH_INTERVAL_MS = 30_000;
const DB_FAILURE_LIMIT_MS = 5 * 60_000;
const SHUTDOWN_GRACE_MS = 8_000;

let lastDbCheck = { at: 0, ok: true };
let dbCheckInFlight: Promise<boolean> | null = null;

export function isDatabaseHealthy(): Promise<boolean> {
  if (Date.now() - lastDbCheck.at < DB_CHECK_CACHE_MS) return Promise.resolve(lastDbCheck.ok);
  if (!dbCheckInFlight) {
    dbCheckInFlight = Promise.race([
      checkConnection(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), DB_CHECK_TIMEOUT_MS).unref()),
    ])
      .then((ok) => {
        lastDbCheck = { at: Date.now(), ok };
        return ok;
      })
      .finally(() => {
        dbCheckInFlight = null;
      });
  }
  return dbCheckInFlight;
}

/**
 * Erros que significam "sem ligação à base de dados" (e não um erro da query): a API
 * responde 503 com code SERVER_UNAVAILABLE e o app usa as cópias guardadas e a fila.
 */
export function isDatabaseConnectionError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  const codes = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENOTFOUND', '57P01', '57P02', '57P03', '53300', '08000', '08001', '08003', '08006'];
  if (err?.code && codes.includes(err.code)) return true;
  return /Connection terminated|timeout exceeded when trying to connect|pool not initialised|Client has encountered a connection error/i.test(err?.message || '');
}

export function startWatchdog(): void {
  if (process.env.NODE_ENV !== 'production' || process.env.DISABLE_WATCHDOG === 'true') return;

  // 1. Processo bloqueado: uma thread à parte acompanha o batimento da thread principal
  //    (segundos desde o arranque) e, se parar, termina o processo inteiro.
  const startedAt = Date.now();
  const beat = new Int32Array(new SharedArrayBuffer(4));
  const tick = () => Atomics.store(beat, 0, Math.floor((Date.now() - startedAt) / 1000));
  tick();
  setInterval(tick, HEARTBEAT_MS).unref();

  const worker = new Worker(
    `
    const { workerData } = require('worker_threads');
    const beat = new Int32Array(workerData.buffer);
    setInterval(() => {
      const stale = Math.floor((Date.now() - workerData.startedAt) / 1000) - Atomics.load(beat, 0);
      if (stale * 1000 > workerData.limitMs) {
        require('fs').writeSync(2, '[Watchdog] Processo bloqueado há ' + stale + ' s — a terminar para o Docker reiniciar\\n');
        process.kill(process.pid, 'SIGKILL');
      }
    }, 10000);
    `,
    { eval: true, workerData: { buffer: beat.buffer, startedAt, limitMs: BLOCKED_LIMIT_MS } },
  );
  worker.unref();
  worker.on('error', (err) => console.error('[Watchdog] Thread de vigilância falhou:', err.message));

  // 2. Base de dados sem resposta durante muito tempo: reinicia para recriar as ligações
  let failingSince: number | null = null;
  setInterval(() => {
    void isDatabaseHealthy().then((ok) => {
      if (ok) {
        failingSince = null;
        return;
      }
      failingSince ??= Date.now();
      console.error(`[Watchdog] Base de dados sem resposta há ${Math.round((Date.now() - failingSince) / 1000)} s`);
      if (Date.now() - failingSince > DB_FAILURE_LIMIT_MS) {
        console.error('[Watchdog] Base de dados sem resposta há mais de 5 min — a terminar para o Docker reiniciar');
        process.exit(1);
      }
    });
  }, DB_WATCH_INTERVAL_MS).unref();

  console.log('[Watchdog] Vigilância ativa (processo bloqueado > 90 s ou base de dados em baixo > 5 min → reinício)');
}

export function setupGracefulShutdown(server: Server): void {
  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`[Leadflow API] ${signal} recebido — a terminar os pedidos em curso...`);
    // WebSockets e ligações keep-alive não fecham sozinhos: ao fim do prazo sai na mesma
    setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref();
    server.close(() => {
      void closePool().finally(() => process.exit(0));
    });
    server.closeIdleConnections?.();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
