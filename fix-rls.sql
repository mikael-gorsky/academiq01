-- ============================================================================
-- FIX RLS ISSUE - Run this in Supabase SQL Editor
-- ============================================================================

-- Step 1: Drop ALL existing policies on all tables
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
        AND tablename LIKE 'academiq_%'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
            r.policyname, r.schemaname, r.tablename);
    END LOOP;
END $$;

-- Step 2: Disable RLS on all tables
ALTER TABLE IF EXISTS academiq_persons DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS academiq_education DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS academiq_publications DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS academiq_experience DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS academiq_grants DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS academiq_teaching DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS academiq_supervision DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS academiq_memberships DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS academiq_awards DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS academiq_parsing_lessons DISABLE ROW LEVEL SECURITY;

-- Step 3: Grant ALL privileges to anon and authenticated roles
GRANT ALL ON TABLE academiq_persons TO anon, authenticated;
GRANT ALL ON TABLE academiq_education TO anon, authenticated;
GRANT ALL ON TABLE academiq_publications TO anon, authenticated;
GRANT ALL ON TABLE academiq_experience TO anon, authenticated;
GRANT ALL ON TABLE academiq_grants TO anon, authenticated;
GRANT ALL ON TABLE academiq_teaching TO anon, authenticated;
GRANT ALL ON TABLE academiq_supervision TO anon, authenticated;
GRANT ALL ON TABLE academiq_memberships TO anon, authenticated;
GRANT ALL ON TABLE academiq_awards TO anon, authenticated;
GRANT ALL ON TABLE academiq_parsing_lessons TO anon, authenticated;

-- Step 4: Grant usage on all sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Step 5: Verify the changes
SELECT
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
AND tablename LIKE 'academiq_%'
ORDER BY tablename;

-- This should show rls_enabled = false for all tables
