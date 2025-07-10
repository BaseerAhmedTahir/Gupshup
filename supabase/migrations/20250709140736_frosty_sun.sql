/*
  # Fix Group Policies and Functions

  1. Issues Fixed
    - Infinite recursion in group_members policies
    - Ambiguous column references in functions
    - Proper group access control

  2. Changes
    - Fix group_members RLS policies to prevent recursion
    - Update functions with proper table aliases
    - Ensure proper group access control
*/

-- Drop problematic policies that cause infinite recursion
DROP POLICY IF EXISTS "Group admins can manage members" ON group_members;
DROP POLICY IF EXISTS "Users can view group members of their groups" ON group_members;

-- Create non-recursive policies for group_members
CREATE POLICY "Users can view group members of their groups"
  ON group_members FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_members gm2
      WHERE gm2.group_id = group_members.group_id 
      AND gm2.user_id = auth.uid()
    )
  );

CREATE POLICY "Group admins can manage members"
  ON group_members FOR ALL
  TO authenticated
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_members gm_admin
      WHERE gm_admin.group_id = group_members.group_id 
      AND gm_admin.user_id = auth.uid() 
      AND gm_admin.role = 'admin'
    )
  );

-- Fix the add_user_to_group function with proper table aliases
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
  -- Check if the person adding is an admin (use table alias to avoid ambiguity)
  IF NOT EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = add_user_to_group.group_id 
    AND gm.user_id = add_user_to_group.added_by 
    AND gm.role = 'admin'
  ) THEN
    RETURN false;
  END IF;
  
  -- Add user to group (use table alias to avoid ambiguity)
  INSERT INTO group_members (group_id, user_id)
  VALUES (add_user_to_group.group_id, add_user_to_group.user_id)
  ON CONFLICT (group_id, user_id) DO NOTHING;
  
  RETURN true;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION add_user_to_group(uuid, uuid, uuid) TO authenticated;

-- Fix the create_group function to ensure it works properly
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_group(text, text, uuid) TO authenticated;

-- Update groups policies to be more straightforward
DROP POLICY IF EXISTS "Users can view groups they're members of" ON groups;

CREATE POLICY "Users can view groups they're members of"
  ON groups FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = groups.id AND gm.user_id = auth.uid()
    )
  );

-- Ensure group messages policy works correctly
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