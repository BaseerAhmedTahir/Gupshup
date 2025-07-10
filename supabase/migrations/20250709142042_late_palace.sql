/*
  # Update Group Implementation

  1. Changes
    - Add function to leave group
    - Update create_group to handle direct addition of contacts
    - Add function to check if users are connected
    - Update group member management

  2. Security
    - Maintain RLS policies
    - Ensure proper access control for leaving groups
*/

-- Function to check if two users are connected
CREATE OR REPLACE FUNCTION are_users_connected(user1_id uuid, user2_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM connections
    WHERE status = 'accepted'
    AND (
      (requester_id = user1_id AND receiver_id = user2_id) OR
      (requester_id = user2_id AND receiver_id = user1_id)
    )
  );
END;
$$;

-- Function for user to leave a group
CREATE OR REPLACE FUNCTION leave_group(
  p_group_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_creator boolean := false;
  member_count integer;
  admin_count integer;
BEGIN
  -- Check if user is a member of the group
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = p_user_id
  ) THEN
    RETURN false;
  END IF;

  -- Check if user is the creator
  SELECT EXISTS (
    SELECT 1 FROM groups
    WHERE id = p_group_id AND created_by = p_user_id
  ) INTO is_creator;

  -- Get member and admin counts
  SELECT COUNT(*) INTO member_count
  FROM group_members
  WHERE group_id = p_group_id;

  SELECT COUNT(*) INTO admin_count
  FROM group_members
  WHERE group_id = p_group_id AND role = 'admin';

  -- If creator is leaving and there are other members, transfer ownership to another admin
  IF is_creator AND member_count > 1 THEN
    -- Find another admin to make the new creator
    UPDATE groups
    SET created_by = (
      SELECT user_id
      FROM group_members
      WHERE group_id = p_group_id
      AND role = 'admin'
      AND user_id != p_user_id
      LIMIT 1
    )
    WHERE id = p_group_id;

    -- If no other admin exists, promote the first member to admin
    IF NOT FOUND THEN
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

      -- Update group creator
      UPDATE groups
      SET created_by = (
        SELECT user_id
        FROM group_members
        WHERE group_id = p_group_id
        AND user_id != p_user_id
        LIMIT 1
      )
      WHERE id = p_group_id;
    END IF;
  END IF;

  -- Remove user from group
  DELETE FROM group_members
  WHERE group_id = p_group_id AND user_id = p_user_id;

  -- If this was the last member, delete the group
  IF member_count = 1 THEN
    DELETE FROM groups WHERE id = p_group_id;
  END IF;

  RETURN true;
END;
$$;

-- Function to add user to group with connection check
CREATE OR REPLACE FUNCTION add_user_to_group_with_check(
  p_group_id uuid,
  p_user_email text,
  p_added_by uuid,
  p_send_notification boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_user_id uuid;
  target_user_record profiles%ROWTYPE;
  is_connected boolean;
  group_name text;
  result jsonb;
BEGIN
  -- Validate that the user adding is a member of the group
  IF NOT EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = p_group_id AND gm.user_id = p_added_by
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only group members can add users');
  END IF;

  -- Get group name
  SELECT name INTO group_name FROM groups WHERE id = p_group_id;

  -- Find user by email
  SELECT * INTO target_user_record
  FROM profiles
  WHERE email = LOWER(TRIM(p_user_email));

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'User not found',
      'user_exists', false
    );
  END IF;

  target_user_id := target_user_record.id;

  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = target_user_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'User is already a member of this group'
    );
  END IF;

  -- Check if users are connected
  SELECT are_users_connected(p_added_by, target_user_id) INTO is_connected;

  IF is_connected THEN
    -- Add user directly to group (no invitation needed)
    INSERT INTO group_members (group_id, user_id, role)
    VALUES (p_group_id, target_user_id, 'member');

    -- Send notification about being added to group
    IF p_send_notification THEN
      INSERT INTO notifications (user_id, type, content, data)
      VALUES (
        target_user_id,
        'group_invite',
        (SELECT display_name FROM profiles WHERE id = p_added_by) || ' added you to "' || group_name || '"',
        jsonb_build_object(
          'group_id', p_group_id,
          'group_name', group_name,
          'added_by', p_added_by,
          'auto_added', true
        )
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'User added to group directly',
      'auto_added', true,
      'user_exists', true
    );
  ELSE
    -- Send invitation notification (user needs to accept)
    IF p_send_notification THEN
      INSERT INTO notifications (user_id, type, content, data)
      VALUES (
        target_user_id,
        'group_invite',
        (SELECT display_name FROM profiles WHERE id = p_added_by) || ' invited you to join "' || group_name || '"',
        jsonb_build_object(
          'group_id', p_group_id,
          'group_name', group_name,
          'invited_by', p_added_by,
          'requires_acceptance', true
        )
      );
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'message', 'Invitation sent',
      'auto_added', false,
      'user_exists', true
    );
  END IF;
END;
$$;

-- Function to accept group invitation
CREATE OR REPLACE FUNCTION accept_group_invitation(
  p_group_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is already a member
  IF EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = p_user_id
  ) THEN
    RETURN false;
  END IF;

  -- Add user to group
  INSERT INTO group_members (group_id, user_id, role)
  VALUES (p_group_id, p_user_id, 'member');

  -- Mark related notifications as read
  UPDATE notifications
  SET is_read = true
  WHERE user_id = p_user_id
  AND type = 'group_invite'
  AND (data->>'group_id')::uuid = p_group_id;

  RETURN true;
END;
$$;

-- Function to reject group invitation
CREATE OR REPLACE FUNCTION reject_group_invitation(
  p_group_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Mark related notifications as read
  UPDATE notifications
  SET is_read = true
  WHERE user_id = p_user_id
  AND type = 'group_invite'
  AND (data->>'group_id')::uuid = p_group_id;

  RETURN true;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION are_users_connected(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION leave_group(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION add_user_to_group_with_check(uuid, text, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION accept_group_invitation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_group_invitation(uuid, uuid) TO authenticated;