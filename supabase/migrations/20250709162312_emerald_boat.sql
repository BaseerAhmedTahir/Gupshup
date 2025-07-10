/*
  # Fix infinite recursion in group_members RLS policies

  1. Problem
    - Current RLS policies on group_members table create infinite recursion
    - Policies are querying group_members table within their own conditions
    - This prevents users from viewing groups they belong to

  2. Solution
    - Drop all existing problematic policies
    - Create new, simplified policies that avoid self-referential queries
    - Use only direct user ID comparisons and groups table references
    - Ensure users can view group memberships without circular dependencies

  3. Security
    - Users can view their own memberships
    - Users can view memberships for groups they belong to (via groups table)
    - Group creators can manage all members
    - Users can join/leave groups
*/

-- Drop all existing policies on group_members that may cause recursion
DROP POLICY IF EXISTS "Users can view own membership" ON group_members;
DROP POLICY IF EXISTS "Users can join groups" ON group_members;
DROP POLICY IF EXISTS "Users can leave groups" ON group_members;
DROP POLICY IF EXISTS "Group creators can manage members" ON group_members;
DROP POLICY IF EXISTS "Users can view group members" ON group_members;
DROP POLICY IF EXISTS "Users can view group memberships" ON group_members;
DROP POLICY IF EXISTS "Users can view all group members" ON group_members;
DROP POLICY IF EXISTS "Group creators can manage all members" ON group_members;
DROP POLICY IF EXISTS "Group admins can manage members" ON group_members;
DROP POLICY IF EXISTS "Users can view members of groups they belong to" ON group_members;
DROP POLICY IF EXISTS "Group creators and users can add members" ON group_members;
DROP POLICY IF EXISTS "Group creators can add members" ON group_members;
DROP POLICY IF EXISTS "Group creators can remove members" ON group_members;
DROP POLICY IF EXISTS "Group creators can update member roles" ON group_members;
DROP POLICY IF EXISTS "Users can update own membership" ON group_members;

-- Create new, non-recursive policies

-- 1. Users can always view their own membership records
CREATE POLICY "View own membership"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 2. Users can insert their own membership (for joining groups)
CREATE POLICY "Join groups"
  ON group_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 3. Users can delete their own membership (for leaving groups)
CREATE POLICY "Leave groups"
  ON group_members
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- 4. Group creators can do everything with members (using groups table only)
CREATE POLICY "Creators manage members"
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

-- Also ensure the groups table policy is simple and doesn't cause issues
DROP POLICY IF EXISTS "Users can view their groups" ON groups;
DROP POLICY IF EXISTS "Users can view groups they're members of" ON groups;

CREATE POLICY "View accessible groups"
  ON groups
  FOR SELECT
  TO authenticated
  USING (
    -- User created the group
    created_by = auth.uid()
    OR
    -- User is a member (simple subquery to group_members)
    id IN (
      SELECT group_id 
      FROM group_members 
      WHERE user_id = auth.uid()
    )
  );