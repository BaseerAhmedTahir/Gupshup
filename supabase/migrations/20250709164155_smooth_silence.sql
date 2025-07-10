/*
  # Fix Group Policies - Remove Infinite Recursion

  1. Security Changes
    - Drop all existing complex policies on group_members table
    - Create simple, non-recursive policies
    - Ensure users can only see their own memberships
    
  2. Simplification
    - Remove complex group management features
    - Keep basic group viewing functionality
*/

-- Drop all existing policies on group_members to prevent recursion
DROP POLICY IF EXISTS "Group creators can manage all memberships" ON group_members;
DROP POLICY IF EXISTS "Group creators can manage memberships" ON group_members;
DROP POLICY IF EXISTS "Users can join groups" ON group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON group_members;
DROP POLICY IF EXISTS "Users can update own membership" ON group_members;
DROP POLICY IF EXISTS "Users can view memberships of their groups" ON group_members;
DROP POLICY IF EXISTS "Users can view their own memberships" ON group_members;

-- Create simple, non-recursive policies
CREATE POLICY "Users can view their own group memberships"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own membership"
  ON group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own membership"
  ON group_members
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Simplify groups policies as well
DROP POLICY IF EXISTS "Group admins can update groups" ON groups;
DROP POLICY IF EXISTS "Group creators and admins can update groups" ON groups;
DROP POLICY IF EXISTS "Users can create groups" ON groups;
DROP POLICY IF EXISTS "View accessible groups" ON groups;

-- Create simple group policies
CREATE POLICY "Users can create groups"
  ON groups
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can view groups they are members of"
  ON groups
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid() OR 
    id IN (
      SELECT gm.group_id 
      FROM group_members gm 
      WHERE gm.user_id = auth.uid()
    )
  );

CREATE POLICY "Group creators can update their groups"
  ON groups
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());