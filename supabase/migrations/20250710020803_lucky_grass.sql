/*
  # Add automatic account cleanup for inactive users

  1. New Function
    - `cleanup_inactive_accounts`: Deletes accounts inactive for more than 5 days
    - Includes proper cascade deletion of related data

  2. Security
    - Function runs with security definer privileges
    - Only deletes truly inactive accounts (no activity for 5+ days)
    - Preserves data integrity with proper cascade handling
*/

-- Function to cleanup inactive accounts (5+ days)
CREATE OR REPLACE FUNCTION cleanup_inactive_accounts()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
  inactive_user_id uuid;
BEGIN
  -- Find users who haven't been active for more than 5 days
  FOR inactive_user_id IN 
    SELECT id 
    FROM profiles 
    WHERE last_active < (now() - interval '5 days')
    AND status = 'offline'
  LOOP
    -- Delete from auth.users (this will cascade to profiles and other tables)
    DELETE FROM auth.users WHERE id = inactive_user_id;
    deleted_count := deleted_count + 1;
    
    RAISE LOG 'Deleted inactive user: %', inactive_user_id;
  END LOOP;
  
  RETURN deleted_count;
END;
$$;

-- Grant execute permission to service role for automated cleanup
GRANT EXECUTE ON FUNCTION cleanup_inactive_accounts() TO service_role;

-- Create a function that can be called periodically to clean up accounts
CREATE OR REPLACE FUNCTION schedule_account_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  SELECT cleanup_inactive_accounts() INTO deleted_count;
  RAISE LOG 'Account cleanup completed. Deleted % inactive accounts.', deleted_count;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION schedule_account_cleanup() TO service_role;

-- Add a comment to document the cleanup policy
COMMENT ON FUNCTION cleanup_inactive_accounts() IS 'Automatically deletes user accounts that have been inactive for more than 5 days to maintain system performance and security.';