/*
  # Disable Row Level Security
  
  This migration disables RLS on all AcademiQ tables to allow unrestricted access.
  
  ## Changes
  - Disables RLS on all academiq_* tables
  - Drops all existing RLS policies
*/

-- Disable RLS on all tables
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

-- Drop all existing policies
DROP POLICY IF EXISTS "Allow authenticated and anon to read persons" ON academiq_persons;
DROP POLICY IF EXISTS "Allow authenticated and anon to insert persons" ON academiq_persons;
DROP POLICY IF EXISTS "Allow authenticated and anon to update persons" ON academiq_persons;
DROP POLICY IF EXISTS "Allow authenticated and anon to delete persons" ON academiq_persons;

DROP POLICY IF EXISTS "Allow authenticated and anon to read education" ON academiq_education;
DROP POLICY IF EXISTS "Allow authenticated and anon to insert education" ON academiq_education;
DROP POLICY IF EXISTS "Allow authenticated and anon to update education" ON academiq_education;
DROP POLICY IF EXISTS "Allow authenticated and anon to delete education" ON academiq_education;

DROP POLICY IF EXISTS "Allow authenticated and anon to read publications" ON academiq_publications;
DROP POLICY IF EXISTS "Allow authenticated and anon to insert publications" ON academiq_publications;
DROP POLICY IF EXISTS "Allow authenticated and anon to update publications" ON academiq_publications;
DROP POLICY IF EXISTS "Allow authenticated and anon to delete publications" ON academiq_publications;

DROP POLICY IF EXISTS "Allow authenticated and anon to read experience" ON academiq_experience;
DROP POLICY IF EXISTS "Allow authenticated and anon to insert experience" ON academiq_experience;
DROP POLICY IF EXISTS "Allow authenticated and anon to update experience" ON academiq_experience;
DROP POLICY IF EXISTS "Allow authenticated and anon to delete experience" ON academiq_experience;

DROP POLICY IF EXISTS "Allow authenticated and anon to read grants" ON academiq_grants;
DROP POLICY IF EXISTS "Allow authenticated and anon to insert grants" ON academiq_grants;
DROP POLICY IF EXISTS "Allow authenticated and anon to update grants" ON academiq_grants;
DROP POLICY IF EXISTS "Allow authenticated and anon to delete grants" ON academiq_grants;

DROP POLICY IF EXISTS "Allow authenticated and anon to read teaching" ON academiq_teaching;
DROP POLICY IF EXISTS "Allow authenticated and anon to insert teaching" ON academiq_teaching;
DROP POLICY IF EXISTS "Allow authenticated and anon to update teaching" ON academiq_teaching;
DROP POLICY IF EXISTS "Allow authenticated and anon to delete teaching" ON academiq_teaching;

DROP POLICY IF EXISTS "Allow authenticated and anon to read supervision" ON academiq_supervision;
DROP POLICY IF EXISTS "Allow authenticated and anon to insert supervision" ON academiq_supervision;
DROP POLICY IF EXISTS "Allow authenticated and anon to update supervision" ON academiq_supervision;
DROP POLICY IF EXISTS "Allow authenticated and anon to delete supervision" ON academiq_supervision;

DROP POLICY IF EXISTS "Allow authenticated and anon to read memberships" ON academiq_memberships;
DROP POLICY IF EXISTS "Allow authenticated and anon to insert memberships" ON academiq_memberships;
DROP POLICY IF EXISTS "Allow authenticated and anon to update memberships" ON academiq_memberships;
DROP POLICY IF EXISTS "Allow authenticated and anon to delete memberships" ON academiq_memberships;

DROP POLICY IF EXISTS "Allow authenticated and anon to read awards" ON academiq_awards;
DROP POLICY IF EXISTS "Allow authenticated and anon to insert awards" ON academiq_awards;
DROP POLICY IF EXISTS "Allow authenticated and anon to update awards" ON academiq_awards;
DROP POLICY IF EXISTS "Allow authenticated and anon to delete awards" ON academiq_awards;

DROP POLICY IF EXISTS "Allow authenticated and anon to read parsing lessons" ON academiq_parsing_lessons;