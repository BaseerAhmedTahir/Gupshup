/*
  # Add display name to profiles table

  1. Changes
    - Add `display_name` column to `profiles` table
    - Set default value to empty string
    - Add index for display name searches

  2. Security
    - No changes to RLS policies needed
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'display_name'
  ) THEN
    ALTER TABLE profiles ADD COLUMN display_name text DEFAULT '';
  END IF;
END $$;

-- Add index for display name searches
CREATE INDEX IF NOT EXISTS idx_profiles_display_name ON profiles(display_name);