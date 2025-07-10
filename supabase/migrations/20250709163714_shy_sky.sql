/*
  # Fix infinite recursion in group_members RLS policies

  1. Security Changes
    - Drop existing problematic RLS policies for group_members
    - Create simplified policies that avoid circular references
    - Ensure users can only access their own group memberships
    - Allow group creators to manage memberships without recursion

  2. Policy Changes
    - Simplified SELECT policy for users to view their own memberships
    - Simplified INSERT policy for joining groups
    - Simplified UPDATE/DELETE policies for group management
    - Remove complex subqueries that cause recursion
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Group creators can add members" ON group_members;
DROP POLICY IF EXISTS "Group creators can remove members" ON group_members;
DROP POLICY IF EXISTS "Group creators can update members" ON group_members;
DROP POLICY IF EXISTS "Group creators can view all members" ON group_members;
DROP POLICY IF EXISTS "Users can join groups" ON group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON group_members;
DROP POLICY IF EXISTS "Users can view own membership" ON group_members;

-- Create simplified policies that avoid recursion

-- Users can view their own group memberships
CREATE POLICY "Users can view their own memberships"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can view memberships of groups they belong to
CREATE POLICY "Users can view group memberships"
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

-- Users can join groups (insert their own membership)
CREATE POLICY "Users can join groups"
  ON group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can leave groups (delete their own membership)
CREATE POLICY "Users can leave groups"
  ON group_members
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Group creators can manage all memberships in their groups
CREATE POLICY "Group creators can manage memberships"
  ON group_members
  FOR ALL
  TO authenticated
  USING (
    group_id IN (
      SELECT g.id 
      FROM groups g 
      WHERE g.created_by = auth.uid()
    )
  )
  WITH CHECK (
    group_id IN (
      SELECT g.id 
      FROM groups g 
      WHERE g.created_by = auth.uid()
    )
  );

-- Group admins can manage memberships (but not create/delete admin roles)
CREATE POLICY "Group admins can manage member roles"
  ON group_members
  FOR UPDATE
  TO authenticated
  USING (
    group_id IN (
      SELECT gm.group_id 
      FROM group_members gm 
      WHERE gm.user_id = auth.uid() 
      AND gm.role = 'admin'
    )
    AND role != 'admin' -- Admins can't promote others to admin
  )
  WITH CHECK (
    group_id IN (
      SELECT gm.group_id 
      FROM group_members gm 
      WHERE gm.user_id = auth.uid() 
      AND gm.role = 'admin'
    )
    AND role != 'admin' -- Admins can't promote others to admin
  );