/*
  # AcademIQ Database Schema - Academic CV Management System
  
  This migration creates the complete database structure for indexing and managing academic CVs.
  
  ## 1. New Tables
  
  ### Main Tables
  - `academiq_persons` - Core table storing researcher personal information
    - `id` (uuid, primary key) - Unique identifier
    - `first_name` (text, required) - First name
    - `last_name` (text, required) - Last name
    - `email` (text, required, unique) - Email address for duplicate detection
    - `phone` (text) - Contact phone number
    - `birth_year` (integer) - Year of birth
    - `birth_country` (text) - Country of birth
    - `marital_status` (text) - Marital status
    - `num_children` (integer) - Number of children
    - `imported_at` (timestamp) - When the CV was imported
    - `pdf_filename` (text) - Original PDF filename
    - `metadata` (jsonb) - Additional flexible data storage
  
  ### Academic Records
  - `academiq_education` - Educational background (degrees, institutions)
  - `academiq_publications` - Research publications with citation tracking
  - `academiq_experience` - Employment history and positions
  - `academiq_grants` - Research grants and funding
  - `academiq_teaching` - Teaching experience and courses
  - `academiq_supervision` - Student supervision records
  - `academiq_memberships` - Professional organization memberships
  - `academiq_awards` - Awards and honors received
  
  ## 2. Indexes
  
  Performance indexes on frequently queried fields:
  - Email lookup for duplicate detection
  - Name searching
  - Publication year filtering
  - Person-based queries across all linked tables
  
  ## 3. Security
  
  Row Level Security (RLS) enabled on all tables with policies:
  - All authenticated users can read all academic data
  - All authenticated users can insert and update records
  - Data is publicly readable for analytics and collaboration
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- MAIN PERSONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS academiq_persons (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL UNIQUE,
  phone text,
  birth_year integer,
  birth_country text,
  marital_status text,
  num_children integer DEFAULT 0,
  imported_at timestamptz DEFAULT now(),
  pdf_filename text,
  metadata jsonb DEFAULT '{}'::jsonb
);

-- =====================================================
-- ACADEMIC RECORDS TABLES
-- =====================================================

CREATE TABLE IF NOT EXISTS academiq_education (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
  degree_type text,
  institution text NOT NULL,
  department text,
  subject text,
  specialization text,
  award_date date,
  honors text,
  country text
);

CREATE TABLE IF NOT EXISTS academiq_publications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
  title text NOT NULL,
  publication_type text,
  venue_name text,
  publication_year integer NOT NULL,
  volume text,
  issue text,
  pages text,
  co_authors text[] DEFAULT ARRAY[]::text[],
  citation_count integer DEFAULT 0,
  url text,
  indexed_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS academiq_experience (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
  institution text NOT NULL,
  department text,
  position_title text NOT NULL,
  start_date date,
  end_date date,
  description text,
  employment_type text
);

CREATE TABLE IF NOT EXISTS academiq_grants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
  title text NOT NULL,
  funding_institution text NOT NULL,
  amount numeric,
  currency_code text DEFAULT 'USD',
  award_year integer,
  duration text,
  role text
);

CREATE TABLE IF NOT EXISTS academiq_teaching (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
  course_title text NOT NULL,
  education_level text,
  institution text,
  teaching_period text
);

CREATE TABLE IF NOT EXISTS academiq_supervision (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
  student_name text NOT NULL,
  degree_level text,
  thesis_title text,
  completion_year integer,
  role text
);

CREATE TABLE IF NOT EXISTS academiq_memberships (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
  organization text NOT NULL,
  start_year integer,
  end_year integer
);

CREATE TABLE IF NOT EXISTS academiq_awards (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  person_id uuid NOT NULL REFERENCES academiq_persons(id) ON DELETE CASCADE,
  award_name text NOT NULL,
  awarding_institution text,
  award_year integer,
  description text
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_academiq_persons_email ON academiq_persons(email);
CREATE INDEX IF NOT EXISTS idx_academiq_persons_name ON academiq_persons(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_academiq_publications_year ON academiq_publications(publication_year);
CREATE INDEX IF NOT EXISTS idx_academiq_publications_person ON academiq_publications(person_id);
CREATE INDEX IF NOT EXISTS idx_academiq_education_person ON academiq_education(person_id);
CREATE INDEX IF NOT EXISTS idx_academiq_experience_person ON academiq_experience(person_id);
CREATE INDEX IF NOT EXISTS idx_academiq_grants_person ON academiq_grants(person_id);
CREATE INDEX IF NOT EXISTS idx_academiq_teaching_person ON academiq_teaching(person_id);
CREATE INDEX IF NOT EXISTS idx_academiq_supervision_person ON academiq_supervision(person_id);
CREATE INDEX IF NOT EXISTS idx_academiq_memberships_person ON academiq_memberships(person_id);
CREATE INDEX IF NOT EXISTS idx_academiq_awards_person ON academiq_awards(person_id);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE academiq_persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_education ENABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_experience ENABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_teaching ENABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_supervision ENABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE academiq_awards ENABLE ROW LEVEL SECURITY;

-- Policies for academiq_persons
CREATE POLICY "Authenticated users can read all persons"
  ON academiq_persons FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert persons"
  ON academiq_persons FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update persons"
  ON academiq_persons FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policies for academiq_education
CREATE POLICY "Authenticated users can read all education"
  ON academiq_education FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert education"
  ON academiq_education FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update education"
  ON academiq_education FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policies for academiq_publications
CREATE POLICY "Authenticated users can read all publications"
  ON academiq_publications FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert publications"
  ON academiq_publications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update publications"
  ON academiq_publications FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policies for academiq_experience
CREATE POLICY "Authenticated users can read all experience"
  ON academiq_experience FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert experience"
  ON academiq_experience FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update experience"
  ON academiq_experience FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policies for academiq_grants
CREATE POLICY "Authenticated users can read all grants"
  ON academiq_grants FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert grants"
  ON academiq_grants FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update grants"
  ON academiq_grants FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policies for academiq_teaching
CREATE POLICY "Authenticated users can read all teaching"
  ON academiq_teaching FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert teaching"
  ON academiq_teaching FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update teaching"
  ON academiq_teaching FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policies for academiq_supervision
CREATE POLICY "Authenticated users can read all supervision"
  ON academiq_supervision FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert supervision"
  ON academiq_supervision FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update supervision"
  ON academiq_supervision FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policies for academiq_memberships
CREATE POLICY "Authenticated users can read all memberships"
  ON academiq_memberships FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert memberships"
  ON academiq_memberships FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update memberships"
  ON academiq_memberships FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policies for academiq_awards
CREATE POLICY "Authenticated users can read all awards"
  ON academiq_awards FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert awards"
  ON academiq_awards FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update awards"
  ON academiq_awards FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);