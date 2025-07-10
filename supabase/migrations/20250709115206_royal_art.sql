/*
  # Fix messages RLS policy for sending messages

  1. Security Updates
    - Update the INSERT policy for messages table to properly allow authenticated users to send messages
    - Ensure users can only send messages as themselves and to users they have accepted connections with

  2. Changes
    - Modify the existing INSERT policy to fix the RLS violation issue
    - The policy now properly validates that the sender is the authenticated user
    - Maintains the connection requirement for security
*/

-- Drop the existing problematic INSERT policy
DROP POLICY IF EXISTS "Users can send messages to connected users" ON messages;

-- Create a new, properly working INSERT policy
CREATE POLICY "Users can send messages to connected users"
  ON messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM connections
      WHERE (
        (requester_id = auth.uid() AND receiver_id = messages.receiver_id) OR
        (receiver_id = auth.uid() AND requester_id = messages.receiver_id)
      ) AND status = 'accepted'
    )
  );