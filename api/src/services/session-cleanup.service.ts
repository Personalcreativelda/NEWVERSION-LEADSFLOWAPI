import { query } from '../database/connection';

/**
 * Deletes expired rows from the sessions table on a regular interval.
 * Without this the table fills with dead rows and the health-check warns about
 * sessions cleanup being stuck.
 */
class SessionCleanupService {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  private readonly INTERVAL_MS = 60 * 60 * 1000; // every hour

  start(): void {
    if (this.running) return;
    this.running = true;
    // Run immediately on start, then on the interval
    void this.cleanup();
    this.timer = setInterval(() => void this.cleanup(), this.INTERVAL_MS);
    console.log('[SessionCleanup] 🧹 Session cleanup service started (interval: 1h)');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
  }

  async cleanup(): Promise<void> {
    try {
      const result = await query(
        `DELETE FROM sessions WHERE expires_at < NOW()`,
        []
      );
      const deleted = result.rowCount ?? 0;
      if (deleted > 0) {
        console.log(`[SessionCleanup] ✅ Removed ${deleted} expired session(s)`);
      }
    } catch (err: any) {
      console.error('[SessionCleanup] ❌ Failed to clean expired sessions:', err.message);
    }
  }

  /** One-shot call used by the admin /cleanup endpoint */
  async runNow(): Promise<number> {
    const result = await query(`DELETE FROM sessions WHERE expires_at < NOW()`, []);
    return result.rowCount ?? 0;
  }
}

export const sessionCleanupService = new SessionCleanupService();
