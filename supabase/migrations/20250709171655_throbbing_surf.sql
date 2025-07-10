/*
  # Add unique constraint for group names

  1. Changes
    - Add unique constraint on group names (case-insensitive)
    - Create index for better performance on name lookups

  2. Security
    - No changes to RLS policies
*/

-- Create unique index for group names (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_name_unique 
ON groups (lower(name));