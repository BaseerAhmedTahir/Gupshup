/*
  # Fix messages insert RLS policy

  1. Security Changes
    - Drop the existing complex insert policy for messages
    - Create a simpler, more reliable insert policy that allows users to send messages to connected users
    - Ensure the policy properly validates the connection exists and is accepted

  The new policy will:
  - Allow authenticated users to insert messages where they are the sender
  - Verify that an accepted connection exists between sender and receiver
  - Use a more straightforward EXISTS query for better performance and reliability
*/

-- Drop the existing insert policy
DROP POLICY IF EXISTS "Users can send messages to connected users" ON messages;

-- Create a new, more reliable insert policy
CREATE POLICY "Users can send messages to connected users"
  ON messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM connections
      WHERE status = 'accepted'
      AND (
        (requester_id = auth.uid() AND receiver_id = messages.receiver_id) OR
        (receiver_id = auth.uid() AND requester_id = messages.receiver_id)
      )
    )
  );