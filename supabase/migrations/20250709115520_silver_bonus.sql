/*
  # Fix message RLS policy for offline messaging

  1. Policy Changes
    - Drop the existing restrictive INSERT policy that requires accepted connections
    - Create a new INSERT policy that allows authenticated users to send messages to any other user
    - This enables messaging even when users are offline or don't have formal connections

  2. Security
    - Still maintains authentication requirement
    - Users can only send messages as themselves (sender_id must match auth.uid())
    - Preserves existing SELECT and UPDATE policies
*/

-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Users can send messages to connected users" ON messages;

-- Create a new INSERT policy that allows messaging without connection requirements
CREATE POLICY "Users can send messages to any user"
  ON messages
  FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());