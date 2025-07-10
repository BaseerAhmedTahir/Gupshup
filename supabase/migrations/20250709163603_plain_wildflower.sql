/*
  # Fix infinite recursion in group_members RLS policies

  1. Security Changes
    - Drop existing problematic policies that cause infinite recursion
    - Create simplified, non-recursive policies for group_members table
    - Ensure users can view their own memberships without circular dependencies
    - Allow group creators to manage members through direct ownership checks

  2. Policy Updates
    - Simplified SELECT policy for users to view their own memberships
    - Simplified SELECT policy for group creators to view all members
    - Updated INSERT/UPDATE/DELETE policies to avoid recursion
*/

-- Drop all existing policies for group_members to start fresh
DROP POLICY IF EXISTS "Group creators can add members" ON group_members;
DROP POLICY IF EXISTS "Group creators can remove members" ON group_members;
DROP POLICY IF EXISTS "Group creators can update members" ON group_members;
DROP POLICY IF EXISTS "Group creators can view all members" ON group_members;
DROP POLICY IF EXISTS "Users can join groups" ON group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON group_members;
DROP POLICY IF EXISTS "Users can view own membership" ON group_members;

-- Create simplified, non-recursive policies

-- Allow users to view their own memberships (no recursion)
CREATE POLICY "Users can view own membership"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Allow group creators to view all members of their groups (direct ownership check)
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

-- Allow users to join groups (insert their own membership)
CREATE POLICY "Users can join groups"
  ON group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Allow group creators to add members to their groups
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

-- Allow users to leave groups (delete their own membership)
CREATE POLICY "Users can leave groups"
  ON group_members
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Allow group creators to remove members from their groups
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

-- Allow group creators to update member roles in their groups
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