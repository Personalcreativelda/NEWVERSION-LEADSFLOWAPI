import { Pool, PoolClient } from 'pg';

const poolConfig = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  database: process.env.PG_DATABASE || 'leadsflow',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: 10, // Reduzido para evitar muitas conexões ociosas
  min: 2, // Manter mínimo de conexões
  idleTimeoutMillis: 60000, // 60s antes de fechar conexões ociosas
  connectionTimeoutMillis: 10000, // 10s para timeout de conexão
  keepAlive: true, // Manter conexões ativas
  keepAliveInitialDelayMillis: 10000, // Delay inicial para keepalive
};

let pool = new Pool(poolConfig);

// Flag para controlar reconexão
let isReconnecting = false;

// Função para recriar o pool
const recreatePool = async () => {
  if (isReconnecting) return;
  isReconnecting = true;
  
  console.log('[DB] Tentando reconectar ao banco de dados...');
  
  try {
    // Encerrar pool antigo graciosamente
    await pool.end().catch(() => {});
    
    // Aguardar antes de reconectar
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Criar novo pool
    pool = new Pool(poolConfig);
    
    // Testar conexão
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

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool:', err.message);
  // Tentar reconectar em caso de erro fatal
  if (err.message.includes('Connection terminated') || 
      err.message.includes('EHOSTUNREACH') ||
      err.message.includes('ECONNREFUSED')) {
    recreatePool();
  }
});

// Função de query com retry automático
export const query = async (text: string, params?: any[], retries = 3): Promise<any> => {
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
  try {
    return await pool.connect();
  } catch (err: any) {
    console.error('[DB] Erro ao obter cliente:', err.message);
    // Tentar reconectar e obter novamente
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

export default pool;
