/*
  # Add display name column to profiles table

  1. Changes
    - Add `display_name` column to profiles table
    - Add index for display name searches
    - Update trigger function to handle display name

  2. Security
    - No changes to RLS policies needed
*/

-- Add display_name column if it doesn't exist
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

-- Update the trigger function to handle display name from user metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, status, last_active, created_at)
  VALUES (
    NEW.id, 
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
    'offline',
    now(),
    now()
  );
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log the error but don't fail the user creation
    RAISE LOG 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;