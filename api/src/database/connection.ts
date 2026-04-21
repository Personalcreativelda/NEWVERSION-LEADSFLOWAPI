import { Pool, PoolClient } from 'pg';
import * as net from 'net';
import * as http from 'http';

// ─── HTTP CONNECT Proxy Bridge ────────────────────────────────────────────────
// When HTTP_PROXY is set, we create a local TCP server on 127.0.0.1 that
// tunnels every pg connection through the HTTP proxy via CONNECT method.
// This is needed because Node.js raw sockets don't respect WinINet proxy
// settings and corporate/ISP proxies intercept non-HTTP TCP traffic.

let bridgePort: number | null = null;
let bridgeServer: net.Server | null = null;

function createConnectTunnel(
  proxyHost: string,
  proxyPort: number,
  targetHost: string,
  targetPort: number,
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      method: 'CONNECT',
      host: proxyHost,
      port: proxyPort,
      path: `${targetHost}:${targetPort}`,
      headers: { Host: `${targetHost}:${targetPort}`, 'Proxy-Connection': 'Keep-Alive' },
    });

    req.setTimeout(10_000, () => req.destroy(new Error('Proxy CONNECT timeout')));
    req.on('connect', (res, socket) => {
      if (res.statusCode === 200) {
        resolve(socket as net.Socket);
      } else {
        socket.destroy();
        reject(new Error(`Proxy CONNECT rejected: ${res.statusCode} ${res.statusMessage}`));
      }
    });
    req.on('error', reject);
    req.end();
  });
}

async function startProxyBridge(
  proxyUrl: URL,
  targetHost: string,
  targetPort: number,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer(async (clientSocket) => {
      try {
        const tunnelSocket = await createConnectTunnel(
          proxyUrl.hostname,
          parseInt(proxyUrl.port || '8080', 10),
          targetHost,
          targetPort,
        );

        clientSocket.pipe(tunnelSocket);
        tunnelSocket.pipe(clientSocket);

        const destroy = () => { clientSocket.destroy(); tunnelSocket.destroy(); };
        clientSocket.on('error', destroy);
        tunnelSocket.on('error', destroy);
        clientSocket.on('close', () => tunnelSocket.destroy());
        tunnelSocket.on('close', () => clientSocket.destroy());
      } catch (err) {
        console.error('[DB Bridge] Tunnel failed:', (err as Error).message);
        clientSocket.destroy();
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      console.log(`[DB Bridge] ✅ Proxy tunnel bridge started on localhost:${addr.port} → ${targetHost}:${targetPort}`);
      resolve(addr.port);
    });

    server.on('error', reject);
    bridgeServer = server;
  });
}

// ─── Pool initialisation (lazy + proxy-aware) ─────────────────────────────────

let pool: Pool;
let poolInitPromise: Promise<void> | null = null;

async function initPoolInternal(): Promise<void> {
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
  const pgHost    = process.env.PG_HOST || 'localhost';
  const pgPort    = parseInt(process.env.PG_PORT || '5432', 10);

  let host = pgHost;
  let port = pgPort;

  const isRemote = pgHost !== 'localhost' && pgHost !== '127.0.0.1';

  if (httpProxy && isRemote && !bridgePort) {
    try {
      const proxyUrl = new URL(httpProxy);
      bridgePort = await startProxyBridge(proxyUrl, pgHost, pgPort);
      host = '127.0.0.1';
      port = bridgePort;
    } catch (err) {
      console.warn('[DB] Bridge failed, trying direct connection:', (err as Error).message);
    }
  }

  const cfg = {
    host,
    port,
    database: process.env.PG_DATABASE || 'leadsflow',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || '',
    ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 10,
    min: 2,
    idleTimeoutMillis: 60_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  };

  pool = new Pool(cfg);

  pool.on('error', (err) => {
    console.error('[DB] Erro inesperado no pool:', err.message);
    if (
      err.message.includes('Connection terminated') ||
      err.message.includes('EHOSTUNREACH') ||
      err.message.includes('ECONNREFUSED')
    ) {
      recreatePool();
    }
  });
}

export function initPool(): Promise<void> {
  if (!poolInitPromise) poolInitPromise = initPoolInternal();
  return poolInitPromise;
}

// Flag para controlar reconexão
let isReconnecting = false;

// Função para recriar o pool
const recreatePool = async () => {
  if (isReconnecting) return;
  isReconnecting = true;
  
  console.log('[DB] Tentando reconectar ao banco de dados...');
  
  try {
    await pool.end().catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Reinitialise pool (will reuse existing bridge if already started)
    poolInitPromise = null;
    await initPool();

    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    
    console.log('[DB] ✅ Reconexão bem-sucedida!');
  } catch (err) {
    console.error('[DB] ❌ Falha na reconexão:', err);
  } finally {
    isReconnecting = false;
  }
};

// Função de query com retry automático
export const query = async (text: string, params?: any[], retries = 3): Promise<any> => {
  await initPool();
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await pool.query(text, params);
    } catch (err: any) {
      const isConnectionError = 
        err.message?.includes('Connection terminated') ||
        err.message?.includes('EHOSTUNREACH') ||
        err.message?.includes('ECONNREFUSED') ||
        err.code === 'ECONNRESET';
      
      if (isConnectionError && attempt < retries) {
        console.log(`[DB] Query falhou (tentativa ${attempt}/${retries}), tentando novamente...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        continue;
      }
      throw err;
    }
  }
};

export const getClient = async (): Promise<PoolClient> => {
  await initPool();
  try {
    return await pool.connect();
  } catch (err: any) {
    console.error('[DB] Erro ao obter cliente:', err.message);
    await recreatePool();
    return await pool.connect();
  }
};

export const transaction = async <T>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
};

// Função para verificar saúde da conexão
export const checkConnection = async (): Promise<boolean> => {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};

// Export a proxy so `import pool from './connection'` always gets the
// current pool instance even after lazy initialisation.
const poolProxy = new Proxy({} as Pool, {
  get(_target, prop) {
    if (!pool) throw new Error('[DB] pool not initialised yet — call initPool() first');
    const val = (pool as any)[prop];
    return typeof val === 'function' ? val.bind(pool) : val;
  },
});

export default poolProxy;
