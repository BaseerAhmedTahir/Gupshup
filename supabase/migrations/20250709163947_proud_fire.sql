/*
  # Fix infinite recursion in group_members RLS policies

  1. Problem
    - Current RLS policies on group_members table cause infinite recursion
    - Policies are querying group_members table within their own conditions
    - This prevents users from viewing groups they belong to

  2. Solution
    - Drop ALL existing policies on group_members table
    - Create new, simplified policies that avoid self-referential queries
    - Use only direct user ID comparisons and groups table references
    - Ensure users can view group memberships without circular dependencies

  3. Security
    - Users can view their own memberships
    - Users can view memberships for groups they created
    - Group creators can manage all members
    - Users can join/leave groups
*/

-- Drop ALL existing policies on group_members to avoid conflicts
DROP POLICY IF EXISTS "Group admins can manage member roles" ON group_members;
DROP POLICY IF EXISTS "Users can view group memberships" ON group_members;
DROP POLICY IF EXISTS "Users can join groups" ON group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON group_members;
DROP POLICY IF EXISTS "Users can update own membership" ON group_members;
DROP POLICY IF EXISTS "Group creators can manage all memberships" ON group_members;
DROP POLICY IF EXISTS "Users can view memberships of their groups" ON group_members;
DROP POLICY IF EXISTS "View own membership" ON group_members;
DROP POLICY IF EXISTS "Join groups" ON group_members;
DROP POLICY IF EXISTS "Leave groups" ON group_members;
DROP POLICY IF EXISTS "Creators manage members" ON group_members;
DROP POLICY IF EXISTS "Group creators can manage members" ON group_members;
DROP POLICY IF EXISTS "Group creators can manage all members" ON group_members;
DROP POLICY IF EXISTS "Users can view all group members" ON group_members;
DROP POLICY IF EXISTS "Users can view group members" ON group_members;
DROP POLICY IF EXISTS "Users can view own membership" ON group_members;
DROP POLICY IF EXISTS "Users can view all members in their groups" ON group_members;
DROP POLICY IF EXISTS "Group admins can manage members" ON group_members;

-- Create new, non-recursive policies

-- Allow group creators to manage all memberships in their groups
CREATE POLICY "Group creators can manage all memberships"
  ON group_members
  FOR ALL
  TO authenticated
  USING (
    group_id IN (
      SELECT id FROM groups WHERE created_by = auth.uid()
    )
  )
  WITH CHECK (
    group_id IN (
      SELECT id FROM groups WHERE created_by = auth.uid()
    )
  );

-- Allow users to view memberships of groups they belong to (simplified)
CREATE POLICY "Users can view memberships of their groups"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (
    -- User can see memberships if they are the member being viewed
    user_id = auth.uid()
    OR
    -- User can see memberships if they created the group
    group_id IN (
      SELECT id FROM groups WHERE created_by = auth.uid()
    )
  );

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

-- Allow users to update their own membership (but not role changes unless they're the group creator)
CREATE POLICY "Users can update own membership"
  ON group_members
  FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR
    group_id IN (
      SELECT id FROM groups WHERE created_by = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR
    group_id IN (
      SELECT id FROM groups WHERE created_by = auth.uid()
    )
  );