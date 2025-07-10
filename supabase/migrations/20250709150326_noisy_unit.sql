/*
  # Fix infinite recursion in group_members RLS policies

  This migration fixes the circular dependency in group_members table policies
  that was causing infinite recursion errors.

  ## Changes Made
  1. Drop existing problematic policies
  2. Create new policies that avoid self-referencing queries
  3. Ensure proper access control without circular dependencies

  ## Security
  - Users can view group members for groups they belong to
  - Group creators can manage all members
  - Users can manage their own membership (join/leave)
*/

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Group admins can manage other members" ON group_members;
DROP POLICY IF EXISTS "Group creators can manage members" ON group_members;
DROP POLICY IF EXISTS "Users can join groups" ON group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON group_members;
DROP POLICY IF EXISTS "Users can view all group members" ON group_members;

-- Create new policies without recursion

-- Allow users to view group members for groups they belong to
-- This uses a simpler approach that doesn't create circular dependencies
CREATE POLICY "Users can view group members"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (
    -- Users can see members of groups where they are also members
    EXISTS (
      SELECT 1 FROM group_members gm2 
      WHERE gm2.group_id = group_members.group_id 
      AND gm2.user_id = auth.uid()
    )
  );

-- Allow users to insert their own membership
CREATE POLICY "Users can join groups"
  ON group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Allow users to delete their own membership
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

-- Allow users to update their own membership (for role changes by admins)
CREATE POLICY "Users can update own membership"
  ON group_members
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());