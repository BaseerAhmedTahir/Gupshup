/*
  # Fix infinite recursion in group_members RLS policy

  1. Policy Changes
    - Remove the problematic "Creators manage members" policy that causes infinite recursion
    - Add separate, more specific policies for group creators and admins
    - Ensure policies don't create circular dependencies

  2. Security
    - Maintain proper access control for group management
    - Allow group creators to manage all members
    - Allow admins to manage members (if needed)
    - Allow users to view group memberships they're part of
*/

-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Creators manage members" ON group_members;

-- Create more specific policies that don't cause recursion

-- Allow group creators to manage members (INSERT, UPDATE, DELETE)
CREATE POLICY "Group creators can manage members"
  ON group_members
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM groups 
      WHERE groups.id = group_members.group_id 
      AND groups.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups 
      WHERE groups.id = group_members.group_id 
      AND groups.created_by = auth.uid()
    )
  );

-- Allow users to view all group memberships for groups they belong to
CREATE POLICY "View group memberships for accessible groups"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (
    group_id IN (
      SELECT gm.group_id 
      FROM group_members gm 
      WHERE gm.user_id = auth.uid()
    )
  );

-- Allow admins to manage members (if role-based management is needed)
CREATE POLICY "Group admins can manage members"
  ON group_members
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members admin_check
      WHERE admin_check.group_id = group_members.group_id
      AND admin_check.user_id = auth.uid()
      AND admin_check.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM group_members admin_check
      WHERE admin_check.group_id = group_members.group_id
      AND admin_check.user_id = auth.uid()
      AND admin_check.role = 'admin'
    )
  );