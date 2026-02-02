import { Router, Request, Response } from 'express';
import pool, { query } from '../database/connection';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

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
