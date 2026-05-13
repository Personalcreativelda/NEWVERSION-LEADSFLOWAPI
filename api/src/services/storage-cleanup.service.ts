import pool from '../database/connection';
import { getStorageService } from './storage.service';

class StorageCleanupService {
  private timer: NodeJS.Timeout | null = null;

  start() {
    // First run 5 minutes after server startup (let everything settle)
    setTimeout(() => this.runCleanup(), 5 * 60 * 1000);
    // Then every 24 hours
    this.timer = setInterval(() => this.runCleanup(), 24 * 60 * 60 * 1000);
    console.log('[StorageCleanup] Service started — daily cleanup scheduled (first run in 5 min)');
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  async runCleanup(): Promise<void> {
    const startTime = Date.now();
    console.log('\n[StorageCleanup] ── Starting cleanup job ──────────────────────');

    try {
      const storage = getStorageService();
      let deletedCount  = 0;
      let orphanCount   = 0;
      let errorCount    = 0;
      let totalBytes    = 0;

      // ── 1. Expire & delete files past their expires_at ───────────────────
      const expired = await pool.query<{
        id: string; public_url: string; storage_key: string;
        size_bytes: number | null; message_id: string | null;
      }>(
        `UPDATE file_attachments
         SET status = 'expired', updated_at = NOW()
         WHERE status = 'active'
           AND is_temporary = true
           AND expires_at IS NOT NULL
           AND expires_at < NOW()
         RETURNING id, public_url, storage_key, size_bytes, message_id`
      );

      for (const file of expired.rows) {
        try {
          await storage.deleteFile(file.public_url);
          totalBytes += file.size_bytes ?? 0;

          await pool.query(
            `UPDATE file_attachments
             SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [file.id]
          );

          // Mark the associated message so the UI can show "Arquivo expirado"
          if (file.message_id) {
            await pool.query(
              `UPDATE messages
               SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{media_expired}', 'true'::jsonb)
               WHERE id = $1`,
              [file.message_id]
            );
          } else {
            // Try to find message by media_url (outgoing uploads don't set message_id at upload time)
            await pool.query(
              `UPDATE messages
               SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{media_expired}', 'true'::jsonb)
               WHERE media_url = $1`,
              [file.public_url]
            );
          }

          deletedCount++;
        } catch (err: any) {
          console.error(`[StorageCleanup] Failed to delete ${file.storage_key}:`, err.message);
          errorCount++;
          // Keep status as 'expired' — will retry next run
        }
      }

      // ── 2. Clean orphan uploads (no message reference, older than 24 h) ──
      // These are files uploaded but never sent in a message
      const orphans = await pool.query<{
        id: string; public_url: string; size_bytes: number | null;
      }>(
        `SELECT fa.id, fa.public_url, fa.size_bytes
         FROM file_attachments fa
         WHERE fa.status = 'active'
           AND fa.is_temporary = true
           AND fa.created_at < NOW() - INTERVAL '24 hours'
           AND NOT EXISTS (
             SELECT 1 FROM messages m WHERE m.media_url = fa.public_url
           )
           AND NOT EXISTS (
             SELECT 1 FROM campaigns c WHERE fa.public_url = ANY(c.media_urls)
           )`
      );

      for (const file of orphans.rows) {
        try {
          await storage.deleteFile(file.public_url);
          totalBytes += file.size_bytes ?? 0;

          await pool.query(
            `UPDATE file_attachments
             SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [file.id]
          );

          orphanCount++;
          deletedCount++;
        } catch (err: any) {
          console.error('[StorageCleanup] Failed to delete orphan:', err.message);
          errorCount++;
        }
      }

      const elapsed = Date.now() - startTime;
      const sizeMB  = (totalBytes / 1024 / 1024).toFixed(2);

      console.log(`[StorageCleanup] ✅ Completed in ${elapsed}ms`);
      console.log(`[StorageCleanup]   Expired files deleted : ${deletedCount}`);
      console.log(`[StorageCleanup]   Orphan uploads cleaned: ${orphanCount}`);
      console.log(`[StorageCleanup]   Errors                : ${errorCount}`);
      console.log(`[StorageCleanup]   Space freed           : ~${sizeMB} MB`);
      console.log('[StorageCleanup] ────────────────────────────────────────────\n');
    } catch (err: any) {
      console.error('[StorageCleanup] Fatal error in cleanup job:', err.message);
    }
  }
}

export const storageCleanupService = new StorageCleanupService();
