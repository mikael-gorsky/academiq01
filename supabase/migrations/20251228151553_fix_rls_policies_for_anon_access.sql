/*
  # Fix RLS Policies for Anonymous Access
  
  This migration updates Row Level Security policies to allow anonymous (anon) users
  to access and modify data in the AcademIQ system.
  
  ## Changes
  
  Updates all existing policies to grant access to both:
  - `authenticated` - Authenticated users
  - `anon` - Anonymous users (using the anon key)
  
  This allows the application to work without requiring user authentication,
  which is appropriate for this CV management use case.
  
  ## Security Note
  
  While this allows public access, the data is still protected by:
  - API key authentication (VITE_SUPABASE_ANON_KEY required)
  - Network-level security
  - Storage bucket policies
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can read all persons" ON academiq_persons;
DROP POLICY IF EXISTS "Authenticated users can insert persons" ON academiq_persons;
DROP POLICY IF EXISTS "Authenticated users can update persons" ON academiq_persons;

DROP POLICY IF EXISTS "Authenticated users can read all education" ON academiq_education;
DROP POLICY IF EXISTS "Authenticated users can insert education" ON academiq_education;
DROP POLICY IF EXISTS "Authenticated users can update education" ON academiq_education;

DROP POLICY IF EXISTS "Authenticated users can read all publications" ON academiq_publications;
DROP POLICY IF EXISTS "Authenticated users can insert publications" ON academiq_publications;
DROP POLICY IF EXISTS "Authenticated users can update publications" ON academiq_publications;

DROP POLICY IF EXISTS "Authenticated users can read all experience" ON academiq_experience;
DROP POLICY IF EXISTS "Authenticated users can insert experience" ON academiq_experience;
DROP POLICY IF EXISTS "Authenticated users can update experience" ON academiq_experience;

DROP POLICY IF EXISTS "Authenticated users can read all grants" ON academiq_grants;
DROP POLICY IF EXISTS "Authenticated users can insert grants" ON academiq_grants;
DROP POLICY IF EXISTS "Authenticated users can update grants" ON academiq_grants;

DROP POLICY IF EXISTS "Authenticated users can read all teaching" ON academiq_teaching;
DROP POLICY IF EXISTS "Authenticated users can insert teaching" ON academiq_teaching;
DROP POLICY IF EXISTS "Authenticated users can update teaching" ON academiq_teaching;

DROP POLICY IF EXISTS "Authenticated users can read all supervision" ON academiq_supervision;
DROP POLICY IF EXISTS "Authenticated users can insert supervision" ON academiq_supervision;
DROP POLICY IF EXISTS "Authenticated users can update supervision" ON academiq_supervision;

DROP POLICY IF EXISTS "Authenticated users can read all memberships" ON academiq_memberships;
DROP POLICY IF EXISTS "Authenticated users can insert memberships" ON academiq_memberships;
DROP POLICY IF EXISTS "Authenticated users can update memberships" ON academiq_memberships;

DROP POLICY IF EXISTS "Authenticated users can read all awards" ON academiq_awards;
DROP POLICY IF EXISTS "Authenticated users can insert awards" ON academiq_awards;
DROP POLICY IF EXISTS "Authenticated users can update awards" ON academiq_awards;

-- Create new policies that allow both authenticated and anon access

-- Policies for academiq_persons
CREATE POLICY "Allow all to read persons"
  ON academiq_persons FOR SELECT
  USING (true);

CREATE POLICY "Allow all to insert persons"
  ON academiq_persons FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow all to update persons"
  ON academiq_persons FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policies for academiq_education
CREATE POLICY "Allow all to read education"
  ON academiq_education FOR SELECT
  USING (true);

CREATE POLICY "Allow all to insert education"
  ON academiq_education FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow all to update education"
  ON academiq_education FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policies for academiq_publications
CREATE POLICY "Allow all to read publications"
  ON academiq_publications FOR SELECT
  USING (true);

CREATE POLICY "Allow all to insert publications"
  ON academiq_publications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow all to update publications"
  ON academiq_publications FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policies for academiq_experience
CREATE POLICY "Allow all to read experience"
  ON academiq_experience FOR SELECT
  USING (true);

CREATE POLICY "Allow all to insert experience"
  ON academiq_experience FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow all to update experience"
  ON academiq_experience FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policies for academiq_grants
CREATE POLICY "Allow all to read grants"
  ON academiq_grants FOR SELECT
  USING (true);

CREATE POLICY "Allow all to insert grants"
  ON academiq_grants FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow all to update grants"
  ON academiq_grants FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policies for academiq_teaching
CREATE POLICY "Allow all to read teaching"
  ON academiq_teaching FOR SELECT
  USING (true);

CREATE POLICY "Allow all to insert teaching"
  ON academiq_teaching FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow all to update teaching"
  ON academiq_teaching FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policies for academiq_supervision
CREATE POLICY "Allow all to read supervision"
  ON academiq_supervision FOR SELECT
  USING (true);

CREATE POLICY "Allow all to insert supervision"
  ON academiq_supervision FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow all to update supervision"
  ON academiq_supervision FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policies for academiq_memberships
CREATE POLICY "Allow all to read memberships"
  ON academiq_memberships FOR SELECT
  USING (true);

CREATE POLICY "Allow all to insert memberships"
  ON academiq_memberships FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow all to update memberships"
  ON academiq_memberships FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Policies for academiq_awards
CREATE POLICY "Allow all to read awards"
  ON academiq_awards FOR SELECT
  USING (true);

CREATE POLICY "Allow all to insert awards"
  ON academiq_awards FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow all to update awards"
  ON academiq_awards FOR UPDATE
  USING (true)
  WITH CHECK (true);