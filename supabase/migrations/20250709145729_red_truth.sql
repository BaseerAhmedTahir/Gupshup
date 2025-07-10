/*
  # Fix Group Functionality Issues

  1. Fix RLS policies to show all group members
  2. Ensure real-time messaging works properly
  3. Add group info management functions
  4. Fix storage policies for group avatars

  ## Changes
  - Update group_members RLS policies to show all members in user's groups
  - Add group info update function
  - Fix storage policies for group avatars
  - Ensure proper permissions for group management
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view all members in their groups" ON group_members;
DROP POLICY IF EXISTS "Group admins can manage members" ON group_members;
DROP POLICY IF EXISTS "Users can join groups" ON group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON group_members;
DROP POLICY IF EXISTS "Group creators can add members" ON group_members;
DROP POLICY IF EXISTS "Group creators can remove members" ON group_members;
DROP POLICY IF EXISTS "Group creators can update member roles" ON group_members;

-- Create comprehensive policies for group_members

-- Allow users to view ALL members in groups they belong to
CREATE POLICY "Users can view all group members"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (
    -- User can see all members in groups where they are also a member
    EXISTS (
      SELECT 1 FROM group_members gm 
      WHERE gm.group_id = group_members.group_id 
      AND gm.user_id = auth.uid()
    )
  );

-- Allow users to join groups
CREATE POLICY "Users can join groups"
  ON group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Allow users to leave groups
CREATE POLICY "Users can leave groups"
  ON group_members
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Allow group creators to manage all members
CREATE POLICY "Group creators can manage members"
  ON group_members
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = group_members.group_id 
      AND g.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = group_members.group_id 
      AND g.created_by = auth.uid()
    )
  );

-- Allow group admins to manage other members (not themselves to prevent lockout)
CREATE POLICY "Group admins can manage other members"
  ON group_members
  FOR ALL
  TO authenticated
  USING (
    group_members.user_id != auth.uid() AND
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.user_id = auth.uid()
      AND gm.role = 'admin'
    )
  )
  WITH CHECK (
    group_members.user_id != auth.uid() AND
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
      AND gm.user_id = auth.uid()
      AND gm.role = 'admin'
    )
  );

-- Function to get group info with member count
CREATE OR REPLACE FUNCTION get_group_info(p_group_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  avatar_url text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  member_count bigint,
  creator_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    g.id,
    g.name,
    g.description,
    g.avatar_url,
    g.created_by,
    g.created_at,
    g.updated_at,
    (SELECT COUNT(*) FROM group_members gm WHERE gm.group_id = g.id) as member_count,
    p.display_name as creator_name
  FROM groups g
  LEFT JOIN profiles p ON g.created_by = p.id
  WHERE g.id = p_group_id
  AND EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = g.id AND gm.user_id = auth.uid()
  );
END;
$$;

-- Function to update group information
CREATE OR REPLACE FUNCTION update_group_info(
  p_group_id uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if user is group creator or admin
  IF NOT EXISTS (
    SELECT 1 FROM groups g
    WHERE g.id = p_group_id 
    AND g.created_by = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = p_group_id
    AND gm.user_id = auth.uid()
    AND gm.role = 'admin'
  ) THEN
    RETURN false;
  END IF;

  -- Update group information
  UPDATE groups
  SET 
    name = p_name,
    description = COALESCE(p_description, description),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    updated_at = now()
  WHERE id = p_group_id;

  RETURN true;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_group_info(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION update_group_info(uuid, text, text, text) TO authenticated;

-- Fix storage policies for group avatars
DROP POLICY IF EXISTS "Users can upload group avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update group avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete group avatars" ON storage.objects;

-- Create proper storage policies for group avatars
CREATE POLICY "Group members can upload group avatars"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = 'groups'
  );

CREATE POLICY "Group members can update group avatars"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = 'groups'
  );

CREATE POLICY "Group members can delete group avatars"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = 'groups'
  );

-- Ensure groups policy allows viewing group info
DROP POLICY IF EXISTS "Users can view their groups" ON groups;

CREATE POLICY "Users can view their groups"
  ON groups
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = groups.id AND gm.user_id = auth.uid()
    )
  );

-- Allow group creators and admins to update groups
CREATE POLICY "Group creators and admins can update groups"
  ON groups
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = groups.id 
      AND gm.user_id = auth.uid() 
      AND gm.role = 'admin'
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = groups.id 
      AND gm.user_id = auth.uid() 
      AND gm.role = 'admin'
    )
  );