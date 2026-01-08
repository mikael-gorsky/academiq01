/*
  # Add Parsing Lessons Table for CV Parser Learning
  
  This table stores "lessons learned" from each CV parsing operation.
  The AI models can write observations about unusual formatting, section naming,
  and parsing challenges. Future parsing operations query this table to benefit
  from accumulated knowledge.
  
  ## Table Structure
  
  - `id` (uuid, primary key) - Unique identifier
  - `lesson_type` - Category: section_naming, format_pattern, edge_case, institution_alias, etc.
  - `pattern` - The specific pattern observed (e.g., "Selected Publications" instead of "Publications")
  - `resolution` - How to handle this pattern
  - `confidence` - How reliable this lesson is (0.0 to 1.0)
  - `occurrences` - How many times this pattern has been seen
  - `source_cv_id` - Reference to the CV where this was first observed (nullable)
  - `created_at` - When the lesson was first recorded
  - `last_seen_at` - When this pattern was last encountered
  - `metadata` - Additional context in JSON format
*/

-- Create the parsing lessons table
CREATE TABLE IF NOT EXISTS academiq_parsing_lessons (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lesson_type text NOT NULL,
  pattern text NOT NULL,
  resolution text NOT NULL,
  confidence numeric(3,2) DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  occurrences integer DEFAULT 1,
  source_cv_id uuid REFERENCES academiq_persons(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  
  -- Prevent duplicate lessons for same pattern
  UNIQUE(lesson_type, pattern)
);

-- Index for quick lookups by lesson type
CREATE INDEX IF NOT EXISTS idx_parsing_lessons_type ON academiq_parsing_lessons(lesson_type);

-- Index for finding high-confidence lessons
CREATE INDEX IF NOT EXISTS idx_parsing_lessons_confidence ON academiq_parsing_lessons(confidence DESC);

-- Index for recently updated lessons
CREATE INDEX IF NOT EXISTS idx_parsing_lessons_last_seen ON academiq_parsing_lessons(last_seen_at DESC);

-- Enable RLS
ALTER TABLE academiq_parsing_lessons ENABLE ROW LEVEL SECURITY;

-- Policies - service role can do everything, authenticated can read
CREATE POLICY "Service role full access to parsing lessons"
  ON academiq_parsing_lessons FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read parsing lessons"
  ON academiq_parsing_lessons FOR SELECT
  TO authenticated
  USING (true);

-- Insert some initial lessons based on common CV patterns
INSERT INTO academiq_parsing_lessons (lesson_type, pattern, resolution, confidence, occurrences, metadata) VALUES
  -- Section naming variations
  ('section_naming', 'Selected Publications', 'Treat as publications section, may be subset of full list', 0.9, 5, '{"category": "publications"}'),
  ('section_naming', 'Research Output', 'Treat as publications section', 0.9, 3, '{"category": "publications"}'),
  ('section_naming', 'Scholarly Works', 'Treat as publications section', 0.85, 2, '{"category": "publications"}'),
  ('section_naming', 'Papers', 'Treat as publications section, usually journal articles', 0.9, 4, '{"category": "publications"}'),
  ('section_naming', 'Academic Appointments', 'Treat as experience section', 0.9, 5, '{"category": "experience"}'),
  ('section_naming', 'Employment History', 'Treat as experience section', 0.95, 6, '{"category": "experience"}'),
  ('section_naming', 'Professional Experience', 'Treat as experience section', 0.95, 8, '{"category": "experience"}'),
  ('section_naming', 'Academic Background', 'Treat as education section', 0.9, 4, '{"category": "education"}'),
  ('section_naming', 'Degrees', 'Treat as education section', 0.95, 5, '{"category": "education"}'),
  ('section_naming', 'Training', 'May include postdoc, certifications - check context', 0.7, 3, '{"category": "education"}'),
  
  -- Format patterns
  ('format_pattern', 'numbered_publications_with_asterisk', 'Asterisk often marks corresponding author or student co-author', 0.8, 4, '{"example": "1. *Smith, J., Jones, K. (2020)..."}'),
  ('format_pattern', 'reverse_chronological_publications', 'Most recent publications listed first', 0.9, 10, '{}'),
  ('format_pattern', 'publications_grouped_by_type', 'Separate sections for journals, conferences, books', 0.85, 7, '{}'),
  ('format_pattern', 'hebrew_section_headers', 'CV may have Hebrew headers - look for RTL text patterns', 0.7, 2, '{"language": "hebrew"}'),
  
  -- Edge cases
  ('edge_case', 'split_publications_sections', 'Publications appear in multiple locations - merge all sections', 0.85, 3, '{"handling": "merge"}'),
  ('edge_case', 'publications_in_experience', 'Some CVs list key publications under each position', 0.7, 2, '{"handling": "extract_separately"}'),
  ('edge_case', 'multi_column_layout', 'Text extraction may interleave columns - look for logical breaks', 0.6, 4, '{}'),
  
  -- Institution aliases
  ('institution_alias', 'MIT', 'Massachusetts Institute of Technology', 1.0, 10, '{"country": "USA"}'),
  ('institution_alias', 'Technion', 'Technion - Israel Institute of Technology', 1.0, 8, '{"country": "Israel"}'),
  ('institution_alias', 'HIT', 'Holon Institute of Technology', 0.9, 3, '{"country": "Israel"}'),
  ('institution_alias', 'TAU', 'Tel Aviv University', 1.0, 7, '{"country": "Israel"}'),
  ('institution_alias', 'HUJI', 'Hebrew University of Jerusalem', 1.0, 5, '{"country": "Israel"}'),
  ('institution_alias', 'BGU', 'Ben-Gurion University of the Negev', 1.0, 4, '{"country": "Israel"}'),
  ('institution_alias', 'Weizmann', 'Weizmann Institute of Science', 1.0, 5, '{"country": "Israel"}'),
  ('institution_alias', 'UCB', 'University of California, Berkeley', 0.9, 3, '{"country": "USA"}'),
  ('institution_alias', 'UCLA', 'University of California, Los Angeles', 1.0, 4, '{"country": "USA"}'),
  ('institution_alias', 'Stanford', 'Stanford University', 1.0, 6, '{"country": "USA"}'),
  ('institution_alias', 'Harvard', 'Harvard University', 1.0, 8, '{"country": "USA"}'),
  ('institution_alias', 'Oxford', 'University of Oxford', 1.0, 5, '{"country": "UK"}'),
  ('institution_alias', 'Cambridge', 'University of Cambridge', 1.0, 5, '{"country": "UK"}')
ON CONFLICT (lesson_type, pattern) DO UPDATE SET
  occurrences = academiq_parsing_lessons.occurrences + 1,
  last_seen_at = now();

-- Function to increment lesson occurrence count
CREATE OR REPLACE FUNCTION increment_lesson_occurrence(p_lesson_type text, p_pattern text)
RETURNS void AS $$
BEGIN
  UPDATE academiq_parsing_lessons
  SET occurrences = occurrences + 1,
      last_seen_at = now(),
      confidence = LEAST(confidence + 0.02, 1.0)
  WHERE lesson_type = p_lesson_type AND pattern = p_pattern;
END;
$$ LANGUAGE plpgsql;

-- Function to add or update a lesson
CREATE OR REPLACE FUNCTION upsert_parsing_lesson(
  p_lesson_type text,
  p_pattern text,
  p_resolution text,
  p_confidence numeric DEFAULT 0.5,
  p_source_cv_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO academiq_parsing_lessons (lesson_type, pattern, resolution, confidence, source_cv_id, metadata)
  VALUES (p_lesson_type, p_pattern, p_resolution, p_confidence, p_source_cv_id, p_metadata)
  ON CONFLICT (lesson_type, pattern) DO UPDATE SET
    occurrences = academiq_parsing_lessons.occurrences + 1,
    last_seen_at = now(),
    confidence = LEAST((academiq_parsing_lessons.confidence + EXCLUDED.confidence) / 2 + 0.05, 1.0),
    metadata = academiq_parsing_lessons.metadata || EXCLUDED.metadata
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;
