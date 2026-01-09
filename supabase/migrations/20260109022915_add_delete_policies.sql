/*
  # Add DELETE Policies for All Tables

  This migration adds DELETE policies to all AcademIQ tables to allow users
  to delete CV records and all associated data.

  ## Changes

  Adds DELETE policies for:
  - academiq_persons (main table - cascades to all related tables)
  - academiq_education
  - academiq_publications
  - academiq_experience
  - academiq_grants
  - academiq_teaching
  - academiq_supervision
  - academiq_memberships
  - academiq_awards

  ## Security

  DELETE policies allow all users (authenticated and anonymous) to delete records.
  This is appropriate for this CV management system where users need full CRUD access.
*/

-- Policies for academiq_persons
CREATE POLICY "Allow all to delete persons"
  ON academiq_persons FOR DELETE
  USING (true);

-- Policies for academiq_education
CREATE POLICY "Allow all to delete education"
  ON academiq_education FOR DELETE
  USING (true);

-- Policies for academiq_publications
CREATE POLICY "Allow all to delete publications"
  ON academiq_publications FOR DELETE
  USING (true);

-- Policies for academiq_experience
CREATE POLICY "Allow all to delete experience"
  ON academiq_experience FOR DELETE
  USING (true);

-- Policies for academiq_grants
CREATE POLICY "Allow all to delete grants"
  ON academiq_grants FOR DELETE
  USING (true);

-- Policies for academiq_teaching
CREATE POLICY "Allow all to delete teaching"
  ON academiq_teaching FOR DELETE
  USING (true);

-- Policies for academiq_supervision
CREATE POLICY "Allow all to delete supervision"
  ON academiq_supervision FOR DELETE
  USING (true);

-- Policies for academiq_memberships
CREATE POLICY "Allow all to delete memberships"
  ON academiq_memberships FOR DELETE
  USING (true);

-- Policies for academiq_awards
CREATE POLICY "Allow all to delete awards"
  ON academiq_awards FOR DELETE
  USING (true);