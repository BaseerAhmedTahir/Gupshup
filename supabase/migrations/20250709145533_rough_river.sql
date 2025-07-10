/*
  # Fix Group Features

  1. Fix group_members RLS policies to allow viewing all members in user's groups
  2. Add group info management functions
  3. Ensure proper permissions for group operations

  ## Changes
  - Update group_members SELECT policy to show all members in user's groups
  - Add function to update group info
  - Add proper storage policies for group avatars
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view group memberships" ON group_members;
DROP POLICY IF EXISTS "Group admins can manage members" ON group_members;

-- Create new policy that allows users to see all members in groups they belong to
CREATE POLICY "Users can view all members in their groups"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (
    -- User can see all members in groups where they are also a member
    group_id IN (
      SELECT gm.group_id 
      FROM group_members gm 
      WHERE gm.user_id = auth.uid()
    )
  );

-- Allow group admins to manage members (without recursion)
CREATE POLICY "Group admins can manage members"
  ON group_members
  FOR ALL
  TO authenticated
  USING (
    -- Check if user is admin by looking at groups table first
    group_id IN (
      SELECT g.id FROM groups g WHERE g.created_by = auth.uid()
    )
    OR
    -- Or check if user has admin role (simplified check)
    (user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    -- Same check for WITH CHECK
    group_id IN (
      SELECT g.id FROM groups g WHERE g.created_by = auth.uid()
    )
    OR
    (user_id = auth.uid() AND role = 'admin')
  );

-- Function to update group information
CREATE OR REPLACE FUNCTION update_group_info(
  p_group_id uuid,
  p_name text,
  p_description text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_user_id uuid DEFAULT auth.uid()
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
    AND g.created_by = p_user_id
  ) AND NOT EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.group_id = p_group_id
    AND gm.user_id = p_user_id
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

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_group_info(uuid, text, text, text, uuid) TO authenticated;

-- Create storage policies for group avatars
CREATE POLICY "Users can upload group avatars"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = 'groups'
  );

CREATE POLICY "Users can update group avatars"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = 'groups'
  );

CREATE POLICY "Users can delete group avatars"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = 'groups'
  );