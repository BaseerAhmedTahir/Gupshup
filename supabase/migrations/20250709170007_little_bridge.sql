/*
  # Improve Group Functionality

  1. Changes
    - Add unique constraint on group names
    - Add functions for better group management
    - Add system message support for group events
    - Improve group member management

  2. Functions
    - Function to handle user leaving group with admin transfer
    - Function to send system messages for group events
    - Function to update group info with member permissions
    - Function to check group name uniqueness

  3. Security
    - Maintain existing RLS policies
    - Add proper validation for group operations
*/

-- Add unique constraint on group names (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_name_unique ON groups (LOWER(name));

-- Function to send system message to group
CREATE OR REPLACE FUNCTION send_group_system_message(
  p_group_id uuid,
  p_message text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  message_id uuid;
BEGIN
  -- Insert system message
  INSERT INTO group_messages (
    group_id, 
    sender_id, 
    content, 
    type
  )
  VALUES (
    p_group_id,
    '00000000-0000-0000-0000-000000000000'::uuid, -- System user ID
    p_message,
    'text'
  )
  RETURNING id INTO message_id;
  
  RETURN message_id;
END;
$$;

-- Function to handle user leaving group with proper admin management
CREATE OR REPLACE FUNCTION leave_group_with_management(
  p_group_id uuid,
  p_user_id uuid,
  p_new_admin_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_name text;
  is_creator boolean := false;
  is_admin boolean := false;
  member_count integer;
  admin_count integer;
  group_name text;
BEGIN
  -- Get user info
  SELECT display_name INTO user_name
  FROM profiles
  WHERE id = p_user_id;

  -- Get group name
  SELECT name INTO group_name
  FROM groups
  WHERE id = p_group_id;

  -- Check if user is a member of the group
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'User is not a member of this group');
  END IF;

  -- Check if user is the creator
  SELECT EXISTS (
    SELECT 1 FROM groups
    WHERE id = p_group_id AND created_by = p_user_id
  ) INTO is_creator;

  -- Check if user is admin
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = p_user_id AND role = 'admin'
  ) INTO is_admin;

  -- Get member and admin counts
  SELECT COUNT(*) INTO member_count
  FROM group_members
  WHERE group_id = p_group_id;

  SELECT COUNT(*) INTO admin_count
  FROM group_members
  WHERE group_id = p_group_id AND role = 'admin';

  -- If this is the last member, delete the group
  IF member_count = 1 THEN
    DELETE FROM groups WHERE id = p_group_id;
    RETURN jsonb_build_object('success', true, 'action', 'group_deleted');
  END IF;

  -- If creator/admin is leaving and there are other members
  IF (is_creator OR is_admin) AND member_count > 1 THEN
    -- If a new admin is specified, make them admin
    IF p_new_admin_id IS NOT NULL THEN
      UPDATE group_members
      SET role = 'admin'
      WHERE group_id = p_group_id AND user_id = p_new_admin_id;

      -- If user was creator, transfer ownership
      IF is_creator THEN
        UPDATE groups
        SET created_by = p_new_admin_id
        WHERE id = p_group_id;
      END IF;
    ELSE
      -- Auto-promote the first member to admin if no admin specified
      UPDATE group_members
      SET role = 'admin'
      WHERE group_id = p_group_id
      AND user_id = (
        SELECT user_id
        FROM group_members
        WHERE group_id = p_group_id
        AND user_id != p_user_id
        LIMIT 1
      );

      -- If user was creator, transfer ownership
      IF is_creator THEN
        UPDATE groups
        SET created_by = (
          SELECT user_id
          FROM group_members
          WHERE group_id = p_group_id
          AND user_id != p_user_id
          AND role = 'admin'
          LIMIT 1
        )
        WHERE id = p_group_id;
      END IF;
    END IF;
  END IF;

  -- Remove user from group
  DELETE FROM group_members
  WHERE group_id = p_group_id AND user_id = p_user_id;

  -- Send system message about user leaving
  PERFORM send_group_system_message(
    p_group_id,
    COALESCE(user_name, 'Someone') || ' left the group'
  );

  RETURN jsonb_build_object('success', true, 'action', 'left_group');
END;
$$;

-- Function to update group info with member permissions
CREATE OR REPLACE FUNCTION update_group_info_by_member(
  p_group_id uuid,
  p_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_name text;
  user_name text;
BEGIN
  -- Check if user is a member of the group
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = p_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only group members can update group info');
  END IF;

  -- Get current group name and user name
  SELECT name INTO old_name FROM groups WHERE id = p_group_id;
  SELECT display_name INTO user_name FROM profiles WHERE id = p_user_id;

  -- Check if new name is unique (if provided)
  IF p_name IS NOT NULL AND p_name != old_name THEN
    IF EXISTS (SELECT 1 FROM groups WHERE LOWER(name) = LOWER(p_name) AND id != p_group_id) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Group name already exists');
    END IF;
  END IF;

  -- Update group information
  UPDATE groups
  SET 
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    updated_at = now()
  WHERE id = p_group_id;

  -- Send system message if name was changed
  IF p_name IS NOT NULL AND p_name != old_name THEN
    PERFORM send_group_system_message(
      p_group_id,
      COALESCE(user_name, 'Someone') || ' changed the group name to "' || p_name || '"'
    );
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- Function to check group name availability
CREATE OR REPLACE FUNCTION check_group_name_availability(p_name text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NOT EXISTS (
    SELECT 1 FROM groups 
    WHERE LOWER(name) = LOWER(p_name)
  );
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION send_group_system_message(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION leave_group_with_management(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_group_info_by_member(uuid, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION check_group_name_availability(text) TO authenticated;

-- Update group_messages policies to handle system messages
DROP POLICY IF EXISTS "Group members can view messages" ON group_messages;

CREATE POLICY "Group members can view messages"
  ON group_messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_messages.group_id AND gm.user_id = auth.uid()
    ) AND NOT (auth.uid() = ANY(deleted_for_users))
  );

-- Allow system to send messages
CREATE POLICY "System can send messages"
  ON group_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = '00000000-0000-0000-0000-000000000000'::uuid OR
    (sender_id = auth.uid() AND
     EXISTS (
       SELECT 1 FROM group_members
       WHERE group_id = group_messages.group_id AND user_id = auth.uid()
     ))
  );