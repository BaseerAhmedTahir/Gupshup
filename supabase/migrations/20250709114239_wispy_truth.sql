/*
  # Fix loading issues and improve database performance

  1. Functions
    - Create safe_create_profile function for better error handling
    - Create get_user_status function for status checks
    - Update trigger functions to be more robust

  2. Performance
    - Add regular index (not CONCURRENTLY since we're in a transaction)
    - Optimize notification update function

  3. Security
    - Grant proper permissions to functions
    - Maintain existing RLS policies
*/

-- Create a function to safely create profiles with better error handling
CREATE OR REPLACE FUNCTION public.safe_create_profile(
  user_id uuid,
  user_email text,
  user_display_name text DEFAULT ''
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_exists boolean := false;
BEGIN
  -- Check if profile already exists
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = user_id) INTO profile_exists;
  
  IF profile_exists THEN
    RETURN true;
  END IF;
  
  -- Try to create the profile
  INSERT INTO profiles (id, email, display_name, status, last_active, created_at)
  VALUES (
    user_id,
    user_email,
    COALESCE(user_display_name, ''),
    'offline',
    now(),
    now()
  );
  
  RETURN true;
EXCEPTION
  WHEN unique_violation THEN
    -- Profile was created by another process, that's fine
    RETURN true;
  WHEN others THEN
    -- Log the error and return false
    RAISE LOG 'Error creating profile for user %: %', user_id, SQLERRM;
    RETURN false;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.safe_create_profile(uuid, text, text) TO authenticated;

-- Update the trigger function to use the safer approach
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Use the safer profile creation function
  PERFORM public.safe_create_profile(
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', '')
  );
  
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log the error but don't fail the user creation
    RAISE LOG 'Error in handle_new_user for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Add a regular index to improve profile lookup performance (not CONCURRENTLY)
CREATE INDEX IF NOT EXISTS idx_profiles_id_email ON profiles(id, email);

-- Add a function to check user status without causing locks
CREATE OR REPLACE FUNCTION public.get_user_status(user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_status text;
BEGIN
  SELECT status INTO user_status
  FROM profiles
  WHERE id = user_id;
  
  RETURN COALESCE(user_status, 'offline');
EXCEPTION
  WHEN others THEN
    RETURN 'offline';
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_user_status(uuid) TO authenticated;

-- Optimize the notification update function to prevent deadlocks
CREATE OR REPLACE FUNCTION update_connection_notification()
RETURNS trigger AS $$
BEGIN
  -- Only update if status actually changed from pending
  IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'rejected') THEN
    -- Use a more targeted update to prevent locks
    UPDATE notifications
    SET 
      data = jsonb_set(
        COALESCE(data, '{}'::jsonb),
        '{connection_id}',
        to_jsonb(NEW.id::text)
      ),
      is_read = CASE WHEN NEW.status = 'accepted' THEN true ELSE is_read END
    WHERE data->>'requester_id' = OLD.requester_id::text
      AND user_id = OLD.receiver_id
      AND type = 'connection_request'
      AND is_read = false;
  END IF;
  
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log error but don't fail the connection update
    RAISE LOG 'Error updating connection notification: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;