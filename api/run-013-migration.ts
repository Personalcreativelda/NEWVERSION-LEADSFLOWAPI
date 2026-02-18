import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from './src/database/connection';

async function runMigration() {
  try {
    console.log('[Migration 013] Running user voice settings migration...');

    const migrationPath = join(__dirname, 'src', 'database', 'migrations', '013_user_voice_settings.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    await query(migrationSQL);

    console.log('[Migration 013] ✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('[Migration 013] ❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
