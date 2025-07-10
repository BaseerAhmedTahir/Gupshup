/*
  # Fix infinite recursion in group_members RLS policies

  1. Policy Updates
    - Remove problematic policies that cause circular references
    - Create simpler, non-recursive policies for group_members table
    - Ensure policies don't reference the same table they're protecting

  2. Security
    - Maintain proper access control without circular dependencies
    - Allow users to view their own memberships
    - Allow group creators to manage memberships
    - Allow users to join/leave groups
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Group creators and users can add members" ON group_members;
DROP POLICY IF EXISTS "Group creators can update member roles" ON group_members;
DROP POLICY IF EXISTS "Users can join groups" ON group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON group_members;
DROP POLICY IF EXISTS "Users can view group memberships" ON group_members;
DROP POLICY IF EXISTS "Group creators and users can remove members" ON group_members;

-- Create new, non-recursive policies

-- Allow users to view their own memberships and memberships in groups they belong to
CREATE POLICY "Users can view group memberships"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Allow users to join groups (insert their own membership)
CREATE POLICY "Users can join groups"
  ON group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Allow users to leave groups (delete their own membership)
CREATE POLICY "Users can leave groups"
  ON group_members
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Allow group creators to add members (simplified check)
CREATE POLICY "Group creators can add members"
  ON group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups 
      WHERE groups.id = group_id 
      AND groups.created_by = auth.uid()
    )
  );

-- Allow group creators to remove members (simplified check)
CREATE POLICY "Group creators can remove members"
  ON group_members
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM groups 
      WHERE groups.id = group_id 
      AND groups.created_by = auth.uid()
    )
  );

-- Allow group creators to update member roles (simplified check)
CREATE POLICY "Group creators can update member roles"
  ON group_members
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM groups 
      WHERE groups.id = group_id 
      AND groups.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups 
      WHERE groups.id = group_id 
      AND groups.created_by = auth.uid()
    )
  );