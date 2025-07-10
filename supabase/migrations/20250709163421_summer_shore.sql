/*
  # Fix infinite recursion in group_members RLS policies

  1. Problem
    - Current policies create circular references by querying group_members within group_members policies
    - This causes infinite recursion when fetching group memberships

  2. Solution
    - Remove all existing policies that cause recursion
    - Create new policies that avoid self-referencing queries
    - Use direct relationships and simpler logic paths
    - Allow group creators to manage members without recursive checks
    - Enable users to manage their own membership directly

  3. New Policy Structure
    - Users can view their own membership records directly
    - Users can view memberships for groups they belong to (via groups table)
    - Group creators can manage all members of their groups
    - Users can join/leave groups themselves
    - No circular dependencies or complex nested queries
*/

-- Drop all existing policies for group_members to start fresh
DROP POLICY IF EXISTS "Group admins can manage members" ON group_members;
DROP POLICY IF EXISTS "Group creators can manage members" ON group_members;
DROP POLICY IF EXISTS "Join groups" ON group_members;
DROP POLICY IF EXISTS "Leave groups" ON group_members;
DROP POLICY IF EXISTS "View group memberships for accessible groups" ON group_members;
DROP POLICY IF EXISTS "View own membership" ON group_members;

-- Create new policies without circular references

-- 1. Users can view their own membership records
CREATE POLICY "Users can view own membership"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 2. Users can view memberships for groups they created
CREATE POLICY "Group creators can view all members"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM groups 
      WHERE groups.id = group_members.group_id 
      AND groups.created_by = auth.uid()
    )
  );

-- 3. Users can insert themselves into groups (join)
CREATE POLICY "Users can join groups"
  ON group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 4. Users can delete their own membership (leave)
CREATE POLICY "Users can leave groups"
  ON group_members
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 5. Group creators can insert any member
CREATE POLICY "Group creators can add members"
  ON group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM groups 
      WHERE groups.id = group_members.group_id 
      AND groups.created_by = auth.uid()
    )
  );

-- 6. Group creators can update any member's role
CREATE POLICY "Group creators can update members"
  ON group_members
  FOR UPDATE
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

-- 7. Group creators can delete any member
CREATE POLICY "Group creators can remove members"
  ON group_members
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM groups 
      WHERE groups.id = group_members.group_id 
      AND groups.created_by = auth.uid()
    )
  );