import 'dotenv/config';
import { readFileSync } from 'fs';
import { join } from 'path';
import { query } from './connection';

async function runTagsMigration() {
  try {
    console.log('[Migration] Running 011_conversation_tags migration...');

    const migrationPath = join(__dirname, 'migrations', '011_conversation_tags.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    await query(migrationSQL);

    console.log('[Migration] ✅ Conversation Tags migration completed successfully');
    console.log('[Migration] Tables created:');
    console.log('[Migration]   - conversation_tags');
    console.log('[Migration]   - conversation_tag_assignments');
    console.log('[Migration] Views created:');
    console.log('[Migration]   - conversations_with_tags');
    console.log('[Migration]   - conversation_tags_stats');
    
    process.exit(0);
  } catch (error) {
    console.error('[Migration] ❌ Migration failed:', error);
    process.exit(1);
  }
}

runTagsMigration();
