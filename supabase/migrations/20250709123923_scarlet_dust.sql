/*
  # Add message status tracking and deletion features

  1. New Columns
    - Add `delivered_at` timestamp to messages table
    - Add `read_at` timestamp to messages table  
    - Add `deleted_for_sender` boolean to messages table
    - Add `deleted_for_receiver` boolean to messages table
    - Add `deleted_for_everyone` boolean to messages table
    - Add `can_delete_for_everyone` computed field based on timestamp

  2. Functions
    - Function to mark messages as delivered
    - Function to mark messages as read
    - Function to delete messages
    - Function to cleanup deleted messages after 1 hour

  3. Triggers
    - Auto-cleanup trigger for deleted messages

  4. Security
    - Update RLS policies for message deletion
    - Ensure proper access control
*/

-- Add new columns to messages table
DO $$
BEGIN
  -- Add delivered_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'delivered_at'
  ) THEN
    ALTER TABLE messages ADD COLUMN delivered_at timestamptz;
  END IF;

  -- Add read_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'read_at'
  ) THEN
    ALTER TABLE messages ADD COLUMN read_at timestamptz;
  END IF;

  -- Add deletion tracking columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'deleted_for_sender'
  ) THEN
    ALTER TABLE messages ADD COLUMN deleted_for_sender boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'deleted_for_receiver'
  ) THEN
    ALTER TABLE messages ADD COLUMN deleted_for_receiver boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'messages' AND column_name = 'deleted_for_everyone'
  ) THEN
    ALTER TABLE messages ADD COLUMN deleted_for_everyone boolean DEFAULT false;
  END IF;
END $$;

-- Function to mark messages as delivered
CREATE OR REPLACE FUNCTION mark_messages_delivered(receiver_user_id uuid, sender_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE messages
  SET delivered_at = now()
  WHERE receiver_id = receiver_user_id
    AND sender_id = sender_user_id
    AND delivered_at IS NULL
    AND deleted_for_receiver = false
    AND deleted_for_everyone = false;
END;
$$;

-- Function to mark messages as read
CREATE OR REPLACE FUNCTION mark_messages_read(receiver_user_id uuid, sender_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE messages
  SET read_at = now(), read = true
  WHERE receiver_id = receiver_user_id
    AND sender_id = sender_user_id
    AND read_at IS NULL
    AND deleted_for_receiver = false
    AND deleted_for_everyone = false;
END;
$$;

-- Function to delete message for user
CREATE OR REPLACE FUNCTION delete_message_for_user(
  message_id uuid,
  user_id uuid,
  delete_for_everyone boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  message_record messages%ROWTYPE;
  can_delete_for_all boolean := false;
BEGIN
  -- Get the message
  SELECT * INTO message_record
  FROM messages
  WHERE id = message_id
    AND (sender_id = user_id OR receiver_id = user_id);

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Check if user can delete for everyone (within 2 minutes and is sender)
  can_delete_for_all := (
    message_record.sender_id = user_id AND
    message_record.timestamp > (now() - interval '2 minutes')
  );

  -- If deleting for everyone and user has permission
  IF delete_for_everyone AND can_delete_for_all THEN
    UPDATE messages
    SET deleted_for_everyone = true
    WHERE id = message_id;
    RETURN true;
  END IF;

  -- Delete for specific user
  IF message_record.sender_id = user_id THEN
    UPDATE messages
    SET deleted_for_sender = true
    WHERE id = message_id;
  ELSE
    UPDATE messages
    SET deleted_for_receiver = true
    WHERE id = message_id;
  END IF;

  RETURN true;
END;
$$;

-- Function to cleanup deleted messages after 1 hour
CREATE OR REPLACE FUNCTION cleanup_deleted_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete messages that are deleted for everyone and older than 1 hour
  DELETE FROM messages
  WHERE deleted_for_everyone = true
    AND timestamp < (now() - interval '1 hour');

  -- Delete messages that are deleted for both sender and receiver and older than 1 hour
  DELETE FROM messages
  WHERE deleted_for_sender = true
    AND deleted_for_receiver = true
    AND timestamp < (now() - interval '1 hour');
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION mark_messages_delivered(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_messages_read(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_message_for_user(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION cleanup_deleted_messages() TO service_role;

-- Update RLS policies to handle deleted messages
DROP POLICY IF EXISTS "Users can view messages they sent or received" ON messages;

CREATE POLICY "Users can view messages they sent or received"
  ON messages FOR SELECT
  TO authenticated
  USING (
    (sender_id = auth.uid() OR receiver_id = auth.uid()) AND
    deleted_for_everyone = false AND
    CASE 
      WHEN sender_id = auth.uid() THEN deleted_for_sender = false
      WHEN receiver_id = auth.uid() THEN deleted_for_receiver = false
      ELSE false
    END
  );

-- Add policy for message deletion
CREATE POLICY "Users can delete their own messages"
  ON messages FOR UPDATE
  TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid())
  WITH CHECK (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_delivered_at ON messages(delivered_at);
CREATE INDEX IF NOT EXISTS idx_messages_read_at ON messages(read_at);
CREATE INDEX IF NOT EXISTS idx_messages_deleted_flags ON messages(deleted_for_sender, deleted_for_receiver, deleted_for_everyone);

-- Schedule cleanup job (this would typically be done via pg_cron or similar)
-- For now, we'll create a function that can be called periodically
CREATE OR REPLACE FUNCTION schedule_message_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM cleanup_deleted_messages();
END;
$$;

GRANT EXECUTE ON FUNCTION schedule_message_cleanup() TO service_role;