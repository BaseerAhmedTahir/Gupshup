/*
  # Fix user lookup and profile creation issues

  1. Changes
    - Improve the trigger function to handle profile creation more reliably
    - Add a function to lookup users that can be called from the client
    - Ensure profiles are always created when users sign up

  2. Security
    - Maintain RLS policies
    - Add function for safe user lookup
*/

-- Drop and recreate the trigger function with better error handling
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert profile with proper error handling
  INSERT INTO public.profiles (id, email, display_name, status, last_active, created_at)
  VALUES (
    NEW.id, 
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
    'offline',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(EXCLUDED.display_name, profiles.display_name);
    
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log the error and re-raise it to ensure we know about profile creation failures
    RAISE LOG 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RAISE;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();

-- Create a function to safely lookup users by email
CREATE OR REPLACE FUNCTION public.lookup_user_by_email(user_email text)
RETURNS TABLE (
  id uuid,
  email text,
  display_name text,
  status text,
  last_active timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- First try to find in profiles
  RETURN QUERY
  SELECT p.id, p.email, p.display_name, p.status, p.last_active
  FROM profiles p
  WHERE p.email = user_email;
  
  -- If found, return
  IF FOUND THEN
    RETURN;
  END IF;
  
  -- If not found, return empty result
  RETURN;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.lookup_user_by_email(text) TO authenticated;

-- Create a function to ensure profile exists for a user
CREATE OR REPLACE FUNCTION public.ensure_profile_exists(user_id uuid, user_email text, user_display_name text DEFAULT '')
RETURNS TABLE (
  id uuid,
  email text,
  display_name text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Try to insert or update the profile
  INSERT INTO public.profiles (id, email, display_name, status, last_active, created_at)
  VALUES (
    user_id,
    user_email,
    COALESCE(user_display_name, ''),
    'offline',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = CASE 
      WHEN EXCLUDED.display_name != '' THEN EXCLUDED.display_name 
      ELSE profiles.display_name 
    END,
    last_active = EXCLUDED.last_active;
    
  -- Return the profile
  RETURN QUERY
  SELECT p.id, p.email, p.display_name, p.status
  FROM profiles p
  WHERE p.id = user_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.ensure_profile_exists(uuid, text, text) TO authenticated;