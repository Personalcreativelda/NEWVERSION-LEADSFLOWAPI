-- =====================================================
-- Cleanup Script: Remove Unused WhatsApp Tables
-- =====================================================
--
-- CONTEXT:
-- The whatsapp_instances table was part of an old implementation
-- where instances were stored in the database. The current
-- implementation uses Evolution API directly with per-user
-- instance names (leadflow_{userId}), which provides better
-- isolation and doesn't require database storage.
--
-- SAFE TO RUN:
-- This script only drops unused tables that are not referenced
-- by the current codebase.
-- =====================================================

BEGIN;

-- Drop whatsapp_instances table (not used in current implementation)
DROP TABLE IF EXISTS whatsapp_instances CASCADE;

COMMIT;

-- Verification queries to run after cleanup:
-- SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;
