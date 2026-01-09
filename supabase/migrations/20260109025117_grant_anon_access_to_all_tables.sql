/*
  # Grant anonymous access to all tables
  
  1. Permissions
    - Grant ALL privileges on all academiq tables to anon and authenticated roles
    - Ensure no RLS policies block access
  
  2. Security
    - This is intentional for an internal academic database
    - RLS is disabled completely to allow full access
*/

-- Grant all privileges to anon and authenticated roles
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

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Ensure RLS is disabled (should already be, but double-check)
ALTER TABLE academiq_persons DISABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_education DISABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_publications DISABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_experience DISABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_grants DISABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_teaching DISABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_supervision DISABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_memberships DISABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_awards DISABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_parsing_lessons DISABLE ROW LEVEL SECURITY;