/*
  # Fix infinite recursion in group_members RLS policies

  1. Problem
    - Current RLS policies on group_members table create infinite recursion
    - The SELECT policy checks group membership by querying the same table it's protecting
    - This creates a circular dependency during policy evaluation

  2. Solution
    - Simplify the SELECT policies to avoid self-referential queries
    - Use direct user ID comparisons instead of subqueries to the same table
    - Maintain security while eliminating recursion

  3. Changes
    - Drop existing problematic policies
    - Create new non-recursive policies
    - Ensure users can still view appropriate group membership data
*/

-- Drop existing policies that cause recursion
DROP POLICY IF EXISTS "Users can view group members" ON group_members;
DROP POLICY IF EXISTS "Users can view own membership" ON group_members;

-- Create new non-recursive SELECT policies
CREATE POLICY "Users can view group members of their groups"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (
    -- Users can view members of groups they created
    EXISTS (
      SELECT 1 FROM groups g 
      WHERE g.id = group_members.group_id 
      AND g.created_by = auth.uid()
    )
    OR
    -- Users can view their own membership records
    user_id = auth.uid()
  );

-- Alternative approach: Create a simpler policy that allows viewing based on group ownership or self
CREATE POLICY "Group creators and members can view memberships"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (
    -- Allow if user is the member being viewed
    user_id = auth.uid()
    OR
    -- Allow if user created the group
    group_id IN (
      SELECT id FROM groups WHERE created_by = auth.uid()
    )
  );

-- Drop the duplicate policy we just created (keep the simpler one)
DROP POLICY IF EXISTS "Users can view group members of their groups" ON group_members;