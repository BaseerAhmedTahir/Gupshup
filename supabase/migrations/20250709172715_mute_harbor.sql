/*
  # Fix Group System Messages and Add Message Status

  1. Changes
    - Create system user in auth.users table first
    - Create corresponding system profile
    - Update RLS policies for group messages
    - Add delivered_at and read_at columns to group_messages
    - Add functions for message status and deletion

  2. Security
    - Allow system messages through RLS policies
    - Maintain proper access control for group messages
*/

-- First, create the system user in auth.users table
-- We need to use a function that can access the auth schema
DO $$
BEGIN
  -- Check if system user already exists in auth.users
  IF NOT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id = '00000000-0000-0000-0000-000000000000'
  ) THEN
    -- Insert system user into auth.users
    INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      recovery_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'system@app.local',
      '$2a$10$system.encrypted.password.hash',
      now(),
      null,
      null,
      '{"provider": "system", "providers": ["system"]}',
      '{"display_name": "System"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

-- Now create the system profile
INSERT INTO profiles (id, email, display_name, status, created_at)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'system@app.local',
  'System',
  'online',
  now()
) ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  display_name = EXCLUDED.display_name,
  status = EXCLUDED.status;

-- Update RLS policy for group messages to allow system messages
DROP POLICY IF EXISTS "System can send messages" ON group_messages;
DROP POLICY IF EXISTS "Group members can send messages" ON group_messages;

-- Create comprehensive policy for group message insertion
CREATE POLICY "Group members and system can send messages"
  ON group_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Allow system messages
    (sender_id = '00000000-0000-0000-0000-000000000000'::uuid) OR
    -- Allow authenticated users who are group members
    (
      sender_id = auth.uid() AND 
      EXISTS (
        SELECT 1 FROM group_members 
        WHERE group_members.group_id = group_messages.group_id 
        AND group_members.user_id = auth.uid()
      )
    )
  );

-- Add delivered_at and read_at columns to group_messages for status tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_messages' AND column_name = 'delivered_at'
  ) THEN
    ALTER TABLE group_messages ADD COLUMN delivered_at timestamptz;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'group_messages' AND column_name = 'read_at'
  ) THEN
    ALTER TABLE group_messages ADD COLUMN read_at timestamptz;
  END IF;
END $$;

-- Create function to delete group message for everyone
CREATE OR REPLACE FUNCTION delete_group_message_for_everyone(message_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  message_record group_messages;
  time_limit timestamptz;
BEGIN
  -- Get the message
  SELECT * INTO message_record
  FROM group_messages
  WHERE id = message_id;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Check if user is the sender
  IF message_record.sender_id != user_id THEN
    RETURN false;
  END IF;
  
  -- Check if message is within 24 hours (optional time limit)
  time_limit := now() - interval '24 hours';
  IF message_record.timestamp < time_limit THEN
    RETURN false;
  END IF;
  
  -- Delete the message completely
  DELETE FROM group_messages WHERE id = message_id;
  
  RETURN true;
END;
$$;

-- Create function to mark group messages as delivered
CREATE OR REPLACE FUNCTION mark_group_messages_delivered(group_id uuid, user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE group_messages
  SET delivered_at = COALESCE(delivered_at, now())
  WHERE group_messages.group_id = mark_group_messages_delivered.group_id
    AND sender_id != user_id
    AND delivered_at IS NULL
    AND NOT (user_id = ANY(deleted_for_users));
END;
$$;

-- Create function to mark group messages as read
CREATE OR REPLACE FUNCTION mark_group_messages_read(group_id uuid, user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE group_messages
  SET read_at = COALESCE(read_at, now())
  WHERE group_messages.group_id = mark_group_messages_read.group_id
    AND sender_id != user_id
    AND read_at IS NULL
    AND NOT (user_id = ANY(deleted_for_users));
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION delete_group_message_for_everyone(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_group_messages_delivered(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_group_messages_read(uuid, uuid) TO authenticated;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_group_messages_delivered_at ON group_messages(delivered_at);
CREATE INDEX IF NOT EXISTS idx_group_messages_read_at ON group_messages(read_at);