import 'dotenv/config';
import express from 'express';
import http from 'http'; // INBOX: Importar http para WebSocket
import helmet from 'helmet';
import morgan from 'morgan';
import { corsMiddleware } from './middleware/cors.middleware';
import routes from './routes';
import { errorMiddleware } from './middleware/error.middleware';
import { initDatabase } from './database/init';
import { campaignScheduler } from './services/campaign-scheduler.service';
import { campaignCleanupService } from './services/campaign-cleanup.service';
// INBOX: Importar WebSocket service
import { initializeWebSocket } from './services/websocket.service';

const app = express();
const port = Number(process.env.PORT || 4000);

app.use(helmet());
app.use(corsMiddleware);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('tiny'));

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', routes);
app.use(errorMiddleware);

// Log MinIO configuration on startup for debugging
function logMinIOConfig() {
  console.log('\n' + '='.repeat(60));
  console.log('[MinIO Startup Check] Verificando configuração...');
  console.log('='.repeat(60));

  const accessKey = process.env.MINIO_ACCESS_KEY || process.env.SERVICE_USER_MINIO;
  const secretKey = process.env.MINIO_SECRET_KEY || process.env.SERVICE_PASSWORD_MINIO;

  const isConfigured = Boolean(
    process.env.MINIO_ENDPOINT &&
    accessKey &&
    secretKey
  );

  console.log('[MinIO] MINIO_ENDPOINT:', process.env.MINIO_ENDPOINT || '❌ NOT SET');
  console.log('[MinIO] MINIO_PORT:', process.env.MINIO_PORT || '❌ NOT SET');
  console.log('[MinIO] MINIO_USE_SSL:', process.env.MINIO_USE_SSL || '❌ NOT SET');
  console.log('[MinIO] MINIO_BUCKET:', process.env.MINIO_BUCKET || '❌ NOT SET');
  console.log('[MinIO] MINIO_REGION:', process.env.MINIO_REGION || '❌ NOT SET');
  console.log('[MinIO] MINIO_PUBLIC_URL:', process.env.MINIO_PUBLIC_URL || '⚠️ NOT SET (optional)');
  console.log('[MinIO] MINIO_ACCESS_KEY:', process.env.MINIO_ACCESS_KEY ? `✅ ${process.env.MINIO_ACCESS_KEY.substring(0, 10)}...` : '❌ NOT SET');
  console.log('[MinIO] MINIO_SECRET_KEY:', process.env.MINIO_SECRET_KEY ? `✅ ${process.env.MINIO_SECRET_KEY.substring(0, 10)}...` : '❌ NOT SET');
  console.log('[MinIO] SERVICE_USER_MINIO:', process.env.SERVICE_USER_MINIO ? `✅ ${process.env.SERVICE_USER_MINIO.substring(0, 10)}...` : '❌ NOT SET');
  console.log('[MinIO] SERVICE_PASSWORD_MINIO:', process.env.SERVICE_PASSWORD_MINIO ? `✅ ${process.env.SERVICE_PASSWORD_MINIO.substring(0, 10)}...` : '❌ NOT SET');

  if (isConfigured) {
    console.log('\n✅ [MinIO] Configurado! Sistema usará MinIO S3 para uploads.');
    console.log('[MinIO] Endpoint:', process.env.MINIO_ENDPOINT);
    console.log('[MinIO] Bucket:', process.env.MINIO_BUCKET || 'leadflow-avatars');
  } else {
    console.log('\n⚠️ [MinIO] NÃO configurado! Sistema usará Base64 (banco de dados).');
    console.log('[MinIO] Para usar MinIO, configure:');
    console.log('[MinIO]   - MINIO_ENDPOINT');
    console.log('[MinIO]   - MINIO_ACCESS_KEY (ou SERVICE_USER_MINIO)');
    console.log('[MinIO]   - MINIO_SECRET_KEY (ou SERVICE_PASSWORD_MINIO)');
  }

  console.log('='.repeat(60) + '\n');
}

initDatabase().then(() => {
  // Log MinIO config on startup
  logMinIOConfig();

  // ✅ Iniciar scheduler de campanhas agendadas
  campaignScheduler.start();
  console.log('[Leadflow API] Campaign scheduler iniciado ✅');

  // ✅ Iniciar serviço de limpeza automática de campanhas
  campaignCleanupService.start();
  console.log('[Leadflow API] Campaign cleanup service iniciado ✅');

  // INBOX: Criar HTTP server e inicializar WebSocket
  const server = http.createServer(app);

  initializeWebSocket(server);
  console.log('[Leadflow API] WebSocket server iniciado ✅');

  server.listen(port, () => {
    console.log(`[Leadflow API] Listening on port ${port}`);
    console.log(`[Leadflow API] WebSocket disponível em ws://localhost:${port}`);
  });
}).catch((error) => {
  console.error('Failed to initialize database:', error);
  process.exit(1);
});
