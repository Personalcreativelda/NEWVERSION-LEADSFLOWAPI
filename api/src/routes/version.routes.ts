import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import multer from 'multer';
import pool, { query } from '../database/connection';
import { requireAuth } from '../middleware/auth.middleware';
import { getStorageService } from '../services/storage.service';

const router = Router();

// ── Atualizações ao vivo do app Android ────────────────────────────────────────
// O app pergunta GET /mobile pelo pacote web mais recente compatível com o seu APK;
// o script `npm run release:mobile` publica pacotes em POST /mobile/release.

let mobileColumnsReady: Promise<void> | null = null;

// Mesmas colunas de migrations/022_mobile_live_updates.sql, aplicadas no primeiro uso
// para não depender de correr a migração à mão no servidor
function ensureMobileColumns(): Promise<void> {
  if (!mobileColumnsReady) {
    mobileColumnsReady = (async () => {
      await pool.query(`
        ALTER TABLE app_version ADD COLUMN IF NOT EXISTS mobile_bundle_url TEXT;
        ALTER TABLE app_version ADD COLUMN IF NOT EXISTS mobile_bundle_checksum TEXT;
        ALTER TABLE app_version ADD COLUMN IF NOT EXISTS mobile_bundle_size INTEGER;
        ALTER TABLE app_version ADD COLUMN IF NOT EXISTS mobile_built_at TIMESTAMP WITH TIME ZONE;
        ALTER TABLE app_version ADD COLUMN IF NOT EXISTS min_native_build INTEGER DEFAULT 1;
      `);
    })().catch((error) => {
      mobileColumnsReady = null;
      throw error;
    });
  }
  return mobileColumnsReady;
}

// Comparação em tempo constante da chave de publicação
function isValidReleaseKey(provided: unknown): boolean {
  const expected = process.env.MOBILE_RELEASE_KEY || '';
  if (!expected || typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const bundleUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
});

// Pacote mais recente para o APK que pergunta (?native=<versionCode>)
router.get('/mobile', async (req: Request, res: Response) => {
  try {
    await ensureMobileColumns();
    const nativeBuild = parseInt(String(req.query.native || '0'), 10) || 0;

    const result = await pool.query(`
      SELECT version, mobile_bundle_url, mobile_bundle_checksum, mobile_bundle_size, mobile_built_at
      FROM app_version
      WHERE mobile_bundle_url IS NOT NULL
        AND COALESCE(min_native_build, 1) <= $1
      ORDER BY mobile_built_at DESC
      LIMIT 1
    `, [nativeBuild]);

    res.setHeader('Cache-Control', 'no-store');
    const row = result.rows[0];
    if (!row) {
      return res.json({ available: false });
    }

    res.json({
      available: true,
      version: row.version,
      // Caminho relativo à API: o app junta-lhe o endereço da API que já conhece
      path: `/api/version/mobile/bundle/${encodeURIComponent(row.version)}`,
      checksum: row.mobile_bundle_checksum,
      size: row.mobile_bundle_size,
      builtAt: new Date(row.mobile_built_at).toISOString(),
    });
  } catch (error: any) {
    console.error('[Version] Error fetching mobile bundle:', error);
    res.status(500).json({ error: 'Failed to fetch mobile bundle' });
  }
});

// Download do zip. A API serve o ficheiro a partir do armazenamento, por isso o bucket
// não precisa de ser público. O download é feito pelo código nativo (sem Origin).
router.get('/mobile/bundle/:version', async (req: Request, res: Response) => {
  try {
    await ensureMobileColumns();
    const result = await pool.query(
      `SELECT mobile_bundle_url, mobile_bundle_size FROM app_version
       WHERE version = $1 AND mobile_bundle_url IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [req.params.version]
    );
    const row = result.rows[0];
    const storage = getStorageService();
    const stream = row && storage.getFileStream ? await storage.getFileStream(row.mobile_bundle_url) : null;
    if (!stream) {
      return res.status(404).json({ error: 'Bundle not found' });
    }

    res.setHeader('Content-Type', 'application/zip');
    if (row.mobile_bundle_size) res.setHeader('Content-Length', String(row.mobile_bundle_size));
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    stream.on('error', (err) => {
      console.error('[Version] Error streaming mobile bundle:', err);
      res.destroy(err);
    });
    stream.pipe(res);
  } catch (error: any) {
    console.error('[Version] Error serving mobile bundle:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Failed to serve mobile bundle' });
  }
});

// Publicar um pacote (zip do build Android). Protegido pela chave MOBILE_RELEASE_KEY.
router.post('/mobile/release', (req: Request, res: Response, next) => {
  if (!process.env.MOBILE_RELEASE_KEY) {
    return res.status(503).json({ error: 'Mobile releases are disabled (MOBILE_RELEASE_KEY not set)' });
  }
  if (!isValidReleaseKey(req.headers['x-release-key'])) {
    return res.status(401).json({ error: 'Invalid release key' });
  }
  next();
}, bundleUpload.single('bundle'), async (req: Request, res: Response) => {
  try {
    await ensureMobileColumns();

    const file = (req as any).file as Express.Multer.File | undefined;
    const version = String(req.body.version || '').trim();
    const builtAt = new Date(Number(req.body.builtAt));
    const minNativeBuild = parseInt(String(req.body.minNativeBuild || '1'), 10) || 1;
    const releaseNotes = String(req.body.releaseNotes || '').trim() || null;
    const notifyUsers = req.body.notifyUsers === 'true';

    if (!file || !version || Number.isNaN(builtAt.getTime())) {
      return res.status(400).json({ error: 'bundle, version and builtAt are required' });
    }
    if (!/^[0-9A-Za-z.\-_]{1,50}$/.test(version)) {
      return res.status(400).json({ error: 'Invalid version format' });
    }

    const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');
    if (req.body.checksum && req.body.checksum !== checksum) {
      return res.status(400).json({ error: 'Checksum mismatch — upload corrupted' });
    }

    const existing = await pool.query(
      'SELECT 1 FROM app_version WHERE version = $1 AND mobile_bundle_url IS NOT NULL LIMIT 1',
      [version]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: `Version ${version} already has a mobile bundle` });
    }

    const url = await getStorageService().uploadBuffer(
      file.buffer, `leadsflow-${version}.zip`, 'application/zip', 'mobile-bundles'
    );
    if (url.startsWith('data:')) {
      return res.status(500).json({ error: 'File storage (MinIO) is not available' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE app_version SET is_current = false WHERE is_current = true');
      const result = await client.query(`
        INSERT INTO app_version
          (version, release_notes, is_current, notify_users,
           mobile_bundle_url, mobile_bundle_checksum, mobile_bundle_size, mobile_built_at, min_native_build)
        VALUES ($1, $2, true, $3, $4, $5, $6, $7, $8)
        RETURNING id, version, created_at
      `, [version, releaseNotes, notifyUsers, url, checksum, file.size, builtAt, minNativeBuild]);
      await client.query('COMMIT');

      console.log(`[Version] Mobile bundle ${version} published (${file.size} bytes)`);
      res.json({ success: true, version: result.rows[0], url, checksum });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('[Version] Error publishing mobile bundle:', error);
    res.status(500).json({ error: 'Failed to publish mobile bundle' });
  }
});

// Get current app version (public)
router.get('/current', async (req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT id, version, release_notes, created_at 
      FROM app_version 
      WHERE is_current = true 
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      return res.json({ version: '1.0.0', release_notes: null });
    }
    
    res.json(result.rows[0]);
  } catch (error: any) {
    console.error('[Version] Error fetching version:', error);
    res.status(500).json({ error: 'Failed to fetch version' });
  }
});

// Check if user has new version notification
router.get('/check-notification', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.json({ hasNewVersion: false });
    }
    
    // Get current version that should notify users
    const versionResult = await pool.query(`
      SELECT av.id, av.version, av.release_notes, av.created_at
      FROM app_version av
      WHERE av.is_current = true 
        AND av.notify_users = true
        AND NOT EXISTS (
          SELECT 1 FROM user_version_notifications uvn 
          WHERE uvn.user_id = $1 AND uvn.version_id = av.id
        )
      LIMIT 1
    `, [userId]);
    
    if (versionResult.rows.length === 0) {
      return res.json({ hasNewVersion: false });
    }
    
    res.json({
      hasNewVersion: true,
      version: versionResult.rows[0]
    });
  } catch (error: any) {
    console.error('[Version] Error checking notification:', error);
    res.json({ hasNewVersion: false });
  }
});

// Mark version notification as seen
router.post('/mark-seen', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const { versionId } = req.body;
    
    if (!userId || !versionId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    await pool.query(`
      INSERT INTO user_version_notifications (user_id, version_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, version_id) DO NOTHING
    `, [userId, versionId]);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('[Version] Error marking seen:', error);
    res.status(500).json({ error: 'Failed to mark as seen' });
  }
});

// Admin: Update current version
router.post('/update', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    // Only admins can update version
    if (user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { version, releaseNotes, notifyUsers = true } = req.body;
    
    if (!version) {
      return res.status(400).json({ error: 'Version is required' });
    }
    
    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Remove current flag from all versions
      await client.query('UPDATE app_version SET is_current = false WHERE is_current = true');
      
      // Insert new version
      const result = await client.query(`
        INSERT INTO app_version (version, release_notes, is_current, notify_users)
        VALUES ($1, $2, true, $3)
        RETURNING id, version, release_notes, is_current, notify_users, created_at
      `, [version, releaseNotes || null, notifyUsers]);
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        version: result.rows[0]
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error('[Version] Error updating version:', error);
    res.status(500).json({ error: 'Failed to update version' });
  }
});

// Admin: Get version history
router.get('/history', requireAuth, async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    
    if (user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const result = await pool.query(`
      SELECT id, version, release_notes, is_current, notify_users, created_at
      FROM app_version
      ORDER BY created_at DESC
      LIMIT 50
    `);
    
    res.json(result.rows);
  } catch (error: any) {
    console.error('[Version] Error fetching history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

export default router;
