-- Diagnostic Script to Check Database Schema for Voice Agents
-- Run this in pgAdmin to verify if Migration 014 has been applied correctly

-- 1. Check if the users table exists
SELECT 'Users table' as check_name, EXISTS (
  SELECT 1 FROM information_schema.tables WHERE table_name = 'users'
) as exists;

-- 2. Check which voice-related columns exist in the users table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'users' 
AND column_name IN ('elevenlabs_api_key', 'openai_api_key', 'anthropic_api_key', 'google_api_key', 'preferred_ai_model', 'voice_settings')
ORDER BY column_name;

-- 3. If any columns are missing, show which ones
SELECT 
  'elevenlabs_api_key' as column_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'elevenlabs_api_key'
  ) THEN 'EXISTS ✅' ELSE 'MISSING ❌' END as status
UNION ALL
SELECT 'openai_api_key', 
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'openai_api_key'  
  ) THEN 'EXISTS ✅' ELSE 'MISSING ❌' END
UNION ALL
SELECT 'anthropic_api_key', 
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'anthropic_api_key'  
  ) THEN 'EXISTS ✅' ELSE 'MISSING ❌' END
UNION ALL
SELECT 'google_api_key', 
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'google_api_key'  
  ) THEN 'EXISTS ✅' ELSE 'MISSING ❌' END
UNION ALL
SELECT 'preferred_ai_model', 
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'preferred_ai_model'  
  ) THEN 'EXISTS ✅' ELSE 'MISSING ❌' END
UNION ALL
SELECT 'voice_settings', 
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'voice_settings'  
  ) THEN 'EXISTS ✅' ELSE 'MISSING ❌' END;

-- 4. Check if migration 014 was recorded as executed
SELECT * FROM migrations 
WHERE name = '014_add_ai_models_support' 
ORDER BY executed_at DESC 
LIMIT 1;

-- 5. Show what API keys are currently configured (showing only if they exist, not the content)
SELECT 
  COUNT(*) as total_users,
  SUM(CASE WHEN elevenlabs_api_key IS NOT NULL THEN 1 ELSE 0 END) as users_with_elevenlabs,
  SUM(CASE WHEN openai_api_key IS NOT NULL THEN 1 ELSE 0 END) as users_with_openai,
  SUM(CASE WHEN anthropic_api_key IS NOT NULL THEN 1 ELSE 0 END) as users_with_anthropic,
  SUM(CASE WHEN google_api_key IS NOT NULL THEN 1 ELSE 0 END) as users_with_google
FROM users;

-- INSTRUCTIONS:
-- If you see "MISSING ❌" for any columns:
-- 1. Open pgAdmin
-- 2. Go to your database → Schemas → public → Tables → users
-- 3. Run the SQL from api/src/database/migrations/014_add_ai_models_support.sql
-- 4. If it says "Columns already exist", that's OK
-- 5. Run this diagnostic script again to verify
