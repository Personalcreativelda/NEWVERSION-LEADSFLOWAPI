import { query } from './src/database/connection';
import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.join(__dirname, '.env') });

async function runMigration() {
  console.log('🚀 Starting activity migration...');
  
  try {
    // Add last_active_at column to users
    await query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    `);
    console.log('✅ Added last_active_at column to users table');

    // Create index for last_active_at
    await query(`
      CREATE INDEX IF NOT EXISTS idx_users_last_active_at ON users(last_active_at DESC)
    `);
    console.log('✅ Created index for last_active_at');

    console.log('🎉 Activity migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
