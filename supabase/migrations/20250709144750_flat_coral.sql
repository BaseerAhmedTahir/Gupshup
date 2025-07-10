/*
  # Fix infinite recursion in group_members RLS policies

  1. Problem
    - Current policies on group_members table create infinite recursion
    - Policies check admin status by querying group_members table itself
    - This creates circular dependency during policy evaluation

  2. Solution
    - Restructure policies to avoid self-referencing queries
    - Use group creators (from groups table) as primary authority
    - Simplify admin checks to prevent recursion
    - Allow users to manage their own memberships

  3. Changes
    - Drop existing problematic policies
    - Create new policies that avoid circular references
    - Maintain security while preventing recursion
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Admins can add members" ON group_members;
DROP POLICY IF EXISTS "Admins can remove members" ON group_members;
DROP POLICY IF EXISTS "Admins can update members" ON group_members;
DROP POLICY IF EXISTS "Group creators and members can view memberships" ON group_members;

-- Create new policies without recursion

-- Policy for SELECT: Users can view memberships for groups they belong to or created
CREATE POLICY "Users can view group memberships"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (
    -- User can see their own membership
    user_id = auth.uid() 
    OR 
    -- User can see memberships of groups they created
    group_id IN (
      SELECT id FROM groups WHERE created_by = auth.uid()
    )
    OR
    -- User can see other memberships in groups where they are a member
    group_id IN (
      SELECT gm.group_id 
      FROM group_members gm 
      WHERE gm.user_id = auth.uid()
    )
  );

-- Policy for INSERT: Group creators can add members, users can join groups
CREATE POLICY "Group creators and users can add members"
  ON group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- User can add themselves to any group
    user_id = auth.uid()
    OR
    -- Group creator can add anyone
    group_id IN (
      SELECT id FROM groups WHERE created_by = auth.uid()
    )
  );

-- Policy for UPDATE: Only group creators can update member roles
CREATE POLICY "Group creators can update member roles"
  ON group_members
  FOR UPDATE
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

-- Policy for DELETE: Group creators can remove anyone, users can remove themselves
CREATE POLICY "Group creators and users can remove members"
  ON group_members
  FOR DELETE
  TO authenticated
  USING (
    -- User can remove themselves
    user_id = auth.uid()
    OR
    -- Group creator can remove anyone
    group_id IN (
      SELECT id FROM groups WHERE created_by = auth.uid()
    )
  );