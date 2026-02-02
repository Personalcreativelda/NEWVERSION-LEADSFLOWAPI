import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from './connection';

async function runMigration() {
  try {
    console.log('[Migration] Running add_2fa_and_api_tokens migration...');

    const migrationPath = join(__dirname, 'migrations', 'add_2fa_and_api_tokens.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    await query(migrationSQL);

    console.log('[Migration] ✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('[Migration] ❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
