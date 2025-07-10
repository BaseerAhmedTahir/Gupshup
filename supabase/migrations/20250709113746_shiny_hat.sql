/*
  # Fix RLS policies for proper user access

  1. Issues Fixed
    - Users can't see profiles to send connection requests
    - Notification system can't access connection data properly
    - Connection requests are not being processed correctly

  2. Changes
    - Update profiles policies to allow viewing for connection purposes
    - Fix connections policies for proper notification handling
    - Ensure notifications can be processed correctly
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view profiles of connected users" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view profiles for connection requests" ON public.profiles;
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

-- Allow authenticated users to view profiles (needed for adding contacts)
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow system and users to create notifications
CREATE POLICY "Users and system can create notifications"
  ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Update connections policies to handle notification data properly
DROP POLICY IF EXISTS "Users can update connections they're part of" ON public.connections;

CREATE POLICY "Users can update connections they're part of"
  ON public.connections
  FOR UPDATE
  TO authenticated
  USING (requester_id = auth.uid() OR receiver_id = auth.uid())
  WITH CHECK (requester_id = auth.uid() OR receiver_id = auth.uid());

-- Ensure the notification update function works properly
CREATE OR REPLACE FUNCTION update_connection_notification()
RETURNS trigger AS $$
BEGIN
  -- Update notification data when connection status changes
  IF OLD.status = 'pending' AND NEW.status IN ('accepted', 'rejected') THEN
    UPDATE public.notifications
    SET data = jsonb_set(
      COALESCE(data, '{}'::jsonb),
      '{connection_id}',
      to_jsonb(NEW.id::text)
    )
    WHERE data->>'requester_id' = OLD.requester_id::text
    AND user_id = OLD.receiver_id
    AND type = 'connection_request'
    AND is_read = false;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_connection_status_changed ON public.connections;
CREATE TRIGGER on_connection_status_changed
  AFTER UPDATE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION update_connection_notification();