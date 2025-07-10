/*
  # Enhanced Chat Features - Profile Images, Groups, and Advanced Features

  1. New Tables
    - Add `avatar_url` to profiles table
    - `groups` table for group chats
    - `group_members` table for group membership
    - `group_messages` table for group messages
    - `message_mentions` table for tracking mentions

  2. Functions
    - Clear conversation for one user
    - Create group with admin role
    - Add user to group
    - Send group message with mentions
    - Delete group message for user

  3. Security
    - Enable RLS on all new tables
    - Add policies for group access control
    - Maintain existing security model

  4. Storage
    - Create avatars bucket for profile images
    - Set up proper storage policies
*/

-- Add avatar_url to profiles table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN avatar_url text;
  END IF;
END $$;

-- Create groups table
CREATE TABLE IF NOT EXISTS groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  avatar_url text,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create group_members table
CREATE TABLE IF NOT EXISTS group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role text DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  joined_at timestamptz DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Create group_messages table
CREATE TABLE IF NOT EXISTS group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  timestamp timestamptz DEFAULT now(),
  type text DEFAULT 'text' CHECK (type IN ('text', 'image', 'file')),
  file_url text,
  file_name text,
  file_size integer,
  mentioned_users uuid[] DEFAULT '{}',
  deleted_for_users uuid[] DEFAULT '{}'
);

-- Create message_mentions table for tracking mentions
CREATE TABLE IF NOT EXISTS message_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid REFERENCES group_messages(id) ON DELETE CASCADE,
  mentioned_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  mentioned_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  is_read boolean DEFAULT false
);

-- Enable RLS
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_mentions ENABLE ROW LEVEL SECURITY;

-- Groups policies
CREATE POLICY "Users can view groups they're members of"
  ON groups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = groups.id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create groups"
  ON groups FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Group admins can update groups"
  ON groups FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = groups.id AND user_id = auth.uid() AND role = 'admin'
    )
  );

-- Group members policies
CREATE POLICY "Users can view group members of their groups"
  ON group_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id AND gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Group admins can manage members"
  ON group_members FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = group_members.group_id AND user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can join groups when invited"
  ON group_members FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Group messages policies
CREATE POLICY "Group members can view messages"
  ON group_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = group_messages.group_id AND user_id = auth.uid()
    ) AND NOT (auth.uid() = ANY(deleted_for_users))
  );

CREATE POLICY "Group members can send messages"
  ON group_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_id = group_messages.group_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own group messages"
  ON group_messages FOR UPDATE
  TO authenticated
  USING (sender_id = auth.uid());

-- Message mentions policies
CREATE POLICY "Users can view their mentions"
  ON message_mentions FOR SELECT
  TO authenticated
  USING (mentioned_user_id = auth.uid());

CREATE POLICY "Users can create mentions"
  ON message_mentions FOR INSERT
  TO authenticated
  WITH CHECK (mentioned_by = auth.uid());

CREATE POLICY "Users can update their mention status"
  ON message_mentions FOR UPDATE
  TO authenticated
  USING (mentioned_user_id = auth.uid());

-- Function to clear conversation for one user
CREATE OR REPLACE FUNCTION clear_conversation_for_user(
  user_id uuid,
  other_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark all messages as deleted for this user
  UPDATE messages
  SET 
    deleted_for_sender = CASE WHEN sender_id = user_id THEN true ELSE deleted_for_sender END,
    deleted_for_receiver = CASE WHEN receiver_id = user_id THEN true ELSE deleted_for_receiver END
  WHERE (sender_id = user_id AND receiver_id = other_user_id)
     OR (sender_id = other_user_id AND receiver_id = user_id);
  
  RETURN true;
END;
$$;

-- Function to create group (fixed parameter order)
CREATE OR REPLACE FUNCTION create_group(
  group_name text,
  group_description text,
  creator_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_group_id uuid;
BEGIN
  -- Create the group
  INSERT INTO groups (name, description, created_by)
  VALUES (group_name, group_description, creator_id)
  RETURNING id INTO new_group_id;
  
  -- Add creator as admin
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (new_group_id, creator_id, 'admin');
  
  RETURN new_group_id;
END;
$$;

-- Function to add user to group
CREATE OR REPLACE FUNCTION add_user_to_group(
  group_id uuid,
  user_id uuid,
  added_by uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the person adding is an admin
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_members.group_id = add_user_to_group.group_id 
    AND group_members.user_id = added_by 
    AND role = 'admin'
  ) THEN
    RETURN false;
  END IF;
  
  -- Add user to group
  INSERT INTO group_members (group_id, user_id)
  VALUES (add_user_to_group.group_id, add_user_to_group.user_id)
  ON CONFLICT (group_id, user_id) DO NOTHING;
  
  RETURN true;
END;
$$;

-- Function to send group message with mentions (fixed parameter defaults)
CREATE OR REPLACE FUNCTION send_group_message_with_mentions(
  p_group_id uuid,
  p_sender_id uuid,
  p_content text,
  p_type text DEFAULT 'text',
  p_file_url text DEFAULT NULL,
  p_file_name text DEFAULT NULL,
  p_file_size integer DEFAULT NULL,
  p_mentioned_users uuid[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  message_id uuid;
  mentioned_user uuid;
BEGIN
  -- Insert the message
  INSERT INTO group_messages (
    group_id, sender_id, content, type, file_url, file_name, file_size, mentioned_users
  )
  VALUES (
    p_group_id, p_sender_id, p_content, p_type, p_file_url, p_file_name, p_file_size, p_mentioned_users
  )
  RETURNING id INTO message_id;
  
  -- Create mention records and notifications
  FOREACH mentioned_user IN ARRAY p_mentioned_users
  LOOP
    -- Insert mention record
    INSERT INTO message_mentions (message_id, mentioned_user_id, mentioned_by)
    VALUES (message_id, mentioned_user, p_sender_id);
    
    -- Create notification
    INSERT INTO notifications (user_id, type, content, data)
    VALUES (
      mentioned_user,
      'mention',
      'You were mentioned in a group message',
      jsonb_build_object(
        'message_id', message_id,
        'group_id', p_group_id,
        'mentioned_by', p_sender_id
      )
    );
  END LOOP;
  
  RETURN message_id;
END;
$$;

-- Function to delete group message for user
CREATE OR REPLACE FUNCTION delete_group_message_for_user(
  message_id uuid,
  user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE group_messages
  SET deleted_for_users = array_append(deleted_for_users, user_id)
  WHERE id = message_id
  AND NOT (user_id = ANY(deleted_for_users));
  
  RETURN FOUND;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION clear_conversation_for_user(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_group(text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION add_user_to_group(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION send_group_message_with_mentions(uuid, uuid, text, text, text, text, integer, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_group_message_for_user(uuid, uuid) TO authenticated;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_groups_created_by ON groups(created_by);
CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_group_id ON group_messages(group_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_sender_id ON group_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_group_messages_timestamp ON group_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_message_mentions_mentioned_user ON message_mentions(mentioned_user_id);
CREATE INDEX IF NOT EXISTS idx_message_mentions_message_id ON message_mentions(message_id);

-- Update notifications table to support mentions and group invites
DO $$
BEGIN
  -- Drop existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'notifications_type_check'
  ) THEN
    ALTER TABLE notifications DROP CONSTRAINT notifications_type_check;
  END IF;
END $$;

-- Add updated constraint
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check 
CHECK (type IN ('connection_request', 'message', 'general', 'mention', 'group_invite'));

-- Create storage bucket for avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for avatars
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Anyone can view avatars"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update bucket configuration for avatars
UPDATE storage.buckets 
SET 
  file_size_limit = 2097152, -- 2MB
  allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
WHERE id = 'avatars';