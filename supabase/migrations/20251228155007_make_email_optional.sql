/*
  # Make Email Optional for Manual Entry

  1. Schema Changes
    - Remove NOT NULL constraint from `academiq_persons.email` column
    - Keep UNIQUE constraint for duplicate detection when email is present
    - Allow CVs without email addresses to be indexed

  2. Notes
    - Email remains unique when present (no duplicates allowed)
    - Duplicate detection only runs when email is provided
    - Users can manually add email during review if not auto-detected
*/

DO $$
BEGIN
  -- Remove NOT NULL constraint from email while keeping UNIQUE
  ALTER TABLE academiq_persons ALTER COLUMN email DROP NOT NULL;
END $$;