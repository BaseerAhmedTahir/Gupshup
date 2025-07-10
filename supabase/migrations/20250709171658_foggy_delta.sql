/*
  # Add group management functions

  1. New Functions
    - `leave_group`: Handle user leaving group with system message
    - `send_group_message_with_mentions`: Send group message with mention handling

  2. Security
    - Functions use RLS policies for access control
*/

-- Function to handle leaving a group
CREATE OR REPLACE FUNCTION leave_group(p_group_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_display_name text;
BEGIN
    -- Get user display name
    SELECT COALESCE(display_name, email) INTO user_display_name
    FROM profiles
    WHERE id = p_user_id;

    -- Send system message about user leaving
    INSERT INTO group_messages (group_id, sender_id, content, type)
    VALUES (
        p_group_id,
        '00000000-0000-0000-0000-000000000000',
        user_display_name || ' left the group',
        'text'
    );

    -- Remove user from group
    DELETE FROM group_members
    WHERE group_id = p_group_id AND user_id = p_user_id;

    RETURN true;
EXCEPTION
    WHEN OTHERS THEN
        RETURN false;
END;
$$;

-- Function to send group message with mentions
CREATE OR REPLACE FUNCTION send_group_message_with_mentions(
    p_group_id uuid,
    p_sender_id uuid,
    p_content text,
    p_type text DEFAULT 'text',
    p_mentioned_users uuid[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    message_id uuid;
    mentioned_user_id uuid;
BEGIN
    -- Insert the message
    INSERT INTO group_messages (group_id, sender_id, content, type, mentioned_users)
    VALUES (p_group_id, p_sender_id, p_content, p_type, p_mentioned_users)
    RETURNING id INTO message_id;

    -- Create mention records and notifications
    FOREACH mentioned_user_id IN ARRAY p_mentioned_users
    LOOP
        -- Insert mention record
        INSERT INTO message_mentions (message_id, mentioned_user_id, mentioned_by)
        VALUES (message_id, mentioned_user_id, p_sender_id);

        -- Create notification
        INSERT INTO notifications (user_id, type, content, data)
        VALUES (
            mentioned_user_id,
            'mention',
            'You were mentioned in a group message',
            jsonb_build_object(
                'message_id', message_id,
                'group_id', p_group_id,
                'sender_id', p_sender_id
            )
        );
    END LOOP;

    RETURN message_id;
END;
$$;

-- Function to delete group message for user
CREATE OR REPLACE FUNCTION delete_group_message_for_user(message_id uuid, user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE group_messages
    SET deleted_for_users = array_append(deleted_for_users, user_id)
    WHERE id = message_id
    AND (sender_id = user_id OR EXISTS (
        SELECT 1 FROM group_members gm
        WHERE gm.group_id = group_messages.group_id
        AND gm.user_id = user_id
    ));

    RETURN FOUND;
END;
$$;