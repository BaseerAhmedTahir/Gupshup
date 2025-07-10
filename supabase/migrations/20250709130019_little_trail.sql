/*
  # Fix storage policies and add proper delete options

  1. Fix Issues
    - Remove problematic encode/decode functions from storage policies
    - Simplify file size checking
    - Add proper delete options for received messages

  2. Changes
    - Update storage policies to remove encode function usage
    - Ensure users can delete messages they received (delete for me only)
    - Maintain existing delete for everyone functionality for senders
*/

-- Drop existing problematic storage policies
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view uploaded files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own files" ON storage.objects;

-- Create simplified storage policies without problematic functions
CREATE POLICY "Authenticated users can upload files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'messages' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can view uploaded files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'messages');

CREATE POLICY "Users can delete their own files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'messages' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update the delete_message_for_user function to handle received messages properly
CREATE OR REPLACE FUNCTION delete_message_for_user(
  message_id uuid,
  user_id uuid,
  delete_for_everyone boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  message_record messages%ROWTYPE;
  can_delete_for_all boolean := false;
BEGIN
  -- Get the message
  SELECT * INTO message_record
  FROM messages
  WHERE id = message_id
    AND (sender_id = user_id OR receiver_id = user_id);

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Check if user can delete for everyone (within 2 minutes and is sender)
  can_delete_for_all := (
    message_record.sender_id = user_id AND
    message_record.timestamp > (now() - interval '2 minutes')
  );

  -- If deleting for everyone and user has permission
  IF delete_for_everyone AND can_delete_for_all THEN
    UPDATE messages
    SET deleted_for_everyone = true
    WHERE id = message_id;
    RETURN true;
  END IF;

  -- Delete for specific user (works for both sender and receiver)
  IF message_record.sender_id = user_id THEN
    -- User is the sender - delete for sender
    UPDATE messages
    SET deleted_for_sender = true
    WHERE id = message_id;
  ELSE
    -- User is the receiver - delete for receiver only
    UPDATE messages
    SET deleted_for_receiver = true
    WHERE id = message_id;
  END IF;

  RETURN true;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION delete_message_for_user(uuid, uuid, boolean) TO authenticated;

-- Update bucket configuration with proper size limit
UPDATE storage.buckets 
SET 
  file_size_limit = 15728640, -- 15MB
  allowed_mime_types = ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm', 'video/mkv',
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed',
    'application/x-tar', 'application/gzip'
  ]
WHERE id = 'messages';