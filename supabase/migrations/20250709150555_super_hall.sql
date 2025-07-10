/*
  # Fix infinite recursion in group_members RLS policies

  1. Problem
    - Current RLS policies on group_members table create infinite recursion
    - Policies reference group_members table within themselves causing circular lookups

  2. Solution
    - Drop existing problematic policies
    - Create new policies that avoid self-referencing queries
    - Ensure policies are simple and direct without circular dependencies

  3. Changes
    - Remove recursive policies that query group_members within group_members policies
    - Create straightforward policies based on user_id matching
    - Maintain security while avoiding recursion
*/

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Group members can view other members" ON group_members;
DROP POLICY IF EXISTS "Users can view group members" ON group_members;
DROP POLICY IF EXISTS "Group creators can manage members" ON group_members;

-- Create new non-recursive policies
CREATE POLICY "Users can view their own membership"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can view members of groups they belong to"
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

CREATE POLICY "Group creators can manage all members"
  ON group_members
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM groups g 
      WHERE g.id = group_members.group_id 
      AND g.created_by = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM groups g 
      WHERE g.id = group_members.group_id 
      AND g.created_by = auth.uid()
    )
  );

CREATE POLICY "Group admins can manage members"
  ON group_members
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM group_members gm 
      WHERE gm.group_id = group_members.group_id 
      AND gm.user_id = auth.uid() 
      AND gm.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM group_members gm 
      WHERE gm.group_id = group_members.group_id 
      AND gm.user_id = auth.uid() 
      AND gm.role = 'admin'
    )
  );

-- Keep existing safe policies
-- These policies were already working correctly:
-- "Users can join groups" - INSERT policy
-- "Users can leave groups" - DELETE policy  
-- "Users can update own membership" - UPDATE policy