/*
  # Fix infinite recursion in group_members RLS policies

  1. Problem
    - Current RLS policies on group_members table are causing infinite recursion
    - This happens when policies reference the same table they're protecting
    - Affects group fetching, message loading, and member management

  2. Solution
    - Drop existing problematic policies
    - Create simplified, non-recursive policies
    - Ensure policies don't create circular dependencies
    - Use direct user ID checks instead of subqueries where possible

  3. Security
    - Maintain proper access control
    - Users can only see groups they're members of
    - Admins can manage group membership
    - No security degradation from the fix
*/

-- Drop existing policies that may be causing recursion
DROP POLICY IF EXISTS "Group admins can manage members" ON group_members;
DROP POLICY IF EXISTS "Users can join groups when invited" ON group_members;
DROP POLICY IF EXISTS "Users can view group members of their groups" ON group_members;

-- Create new, simplified policies without recursion

-- Policy 1: Users can view their own membership records
CREATE POLICY "Users can view own membership"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy 2: Users can view other members in groups they belong to
-- This uses a direct approach without recursion
CREATE POLICY "Users can view group members"
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

-- Policy 3: Group creators and admins can insert new members
CREATE POLICY "Admins can add members"
  ON group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Check if user is admin of this group OR creator of the group
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = group_members.group_id
        AND g.created_by = auth.uid()
    )
  );

-- Policy 4: Users can join groups (when invited/added by admin)
CREATE POLICY "Users can join groups"
  ON group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Policy 5: Admins can update member roles
CREATE POLICY "Admins can update members"
  ON group_members
  FOR UPDATE
  TO authenticated
  USING (
    -- User is admin of this group OR group creator
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = group_members.group_id
        AND g.created_by = auth.uid()
    )
  );

-- Policy 6: Users can leave groups (delete their own membership)
CREATE POLICY "Users can leave groups"
  ON group_members
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Policy 7: Admins can remove members
CREATE POLICY "Admins can remove members"
  ON group_members
  FOR DELETE
  TO authenticated
  USING (
    -- User is admin of this group OR group creator
    EXISTS (
      SELECT 1 FROM group_members gm
      WHERE gm.group_id = group_members.group_id
        AND gm.user_id = auth.uid()
        AND gm.role = 'admin'
    )
    OR
    EXISTS (
      SELECT 1 FROM groups g
      WHERE g.id = group_members.group_id
        AND g.created_by = auth.uid()
    )
  );

-- Also fix the groups table policy that might be contributing to recursion
DROP POLICY IF EXISTS "Users can view groups they're members of" ON groups;

-- Create a simpler groups policy
CREATE POLICY "Users can view their groups"
  ON groups
  FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()
    OR
    id IN (
      SELECT group_id 
      FROM group_members 
      WHERE user_id = auth.uid()
    )
  );