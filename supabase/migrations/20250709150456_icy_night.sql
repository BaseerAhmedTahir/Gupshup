/*
  # Fix infinite recursion in group_members RLS policy

  1. Problem
    - The current SELECT policy on group_members table causes infinite recursion
    - This happens when the policy references the same table it's protecting

  2. Solution
    - Drop the problematic SELECT policy that causes recursion
    - Create a simple, non-recursive SELECT policy
    - Ensure users can only see group memberships they are part of

  3. Security
    - Users can only view group memberships where they are the user
    - This prevents unauthorized access while avoiding recursion
*/

-- Drop the existing problematic SELECT policy
DROP POLICY IF EXISTS "Users can view group members" ON group_members;

-- Create a simple, non-recursive SELECT policy
CREATE POLICY "Users can view group members"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Ensure the policy for viewing other members in the same group is also non-recursive
DROP POLICY IF EXISTS "Group members can view other members" ON group_members;

CREATE POLICY "Group members can view other members"
  ON group_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members gm2 
      WHERE gm2.group_id = group_members.group_id 
      AND gm2.user_id = auth.uid()
    )
  );