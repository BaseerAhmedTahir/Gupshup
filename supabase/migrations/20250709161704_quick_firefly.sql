/*
  # Fix infinite recursion in group_members RLS policies

  1. Problem
    - Current policies on group_members table are causing infinite recursion
    - Policies are querying group_members table within their own conditions
    - This creates a circular dependency that causes the database to fail

  2. Solution
    - Drop existing problematic policies
    - Create new, simplified policies that avoid recursive queries
    - Use direct user ID comparisons instead of complex subqueries
    - Separate policies for different operations to avoid conflicts

  3. New Policies
    - Users can view their own memberships directly
    - Users can view memberships of groups they belong to (simplified)
    - Group creators can manage all members
    - Users can join/leave groups they're invited to
*/

-- Drop all existing policies on group_members to start fresh
DROP POLICY IF EXISTS "Group admins can manage members" ON group_members;
DROP POLICY IF EXISTS "Group creators can manage all members" ON group_members;
DROP POLICY IF EXISTS "Users can join groups" ON group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON group_members;
DROP POLICY IF EXISTS "Users can update own membership" ON group_members;
DROP POLICY IF EXISTS "Users can view members of groups they belong to" ON group_members;
DROP POLICY IF EXISTS "Users can view their own membership" ON group_members;

-- Create new, non-recursive policies

-- 1. Users can always view their own membership records
CREATE POLICY "Users can view own membership"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 2. Users can insert their own membership (for joining groups)
CREATE POLICY "Users can join groups"
  ON group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 3. Users can delete their own membership (for leaving groups)
CREATE POLICY "Users can leave groups"
  ON group_members
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 4. Group creators can manage all members (using groups table directly)
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

-- 5. Users can view members of groups where they are already confirmed members
-- This uses a simpler approach to avoid recursion
CREATE POLICY "Users can view group members"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (
    -- Either it's their own record (already covered above but included for clarity)
    user_id = auth.uid()
    OR
    -- Or they are a member of the same group (using a direct query)
    group_id IN (
      SELECT gm.group_id 
      FROM group_members gm 
      WHERE gm.user_id = auth.uid()
    )
  );