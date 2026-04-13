import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from './connection';

async function runMigration() {
  try {
    console.log('[Migration] Running 017_update_plan_limits migration...');

    const migrationPath = join(__dirname, 'migrations', '017_update_plan_limits.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    await query(migrationSQL);

    console.log('[Migration] ✅ Plan limits updated successfully');
    process.exit(0);
  } catch (error) {
    console.error('[Migration] ❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
