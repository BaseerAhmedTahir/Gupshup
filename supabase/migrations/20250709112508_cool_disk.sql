/*
  # Create missing profiles for existing auth users

  This migration ensures that all existing auth users have corresponding profiles
  in the profiles table, and fixes the trigger function for future users.

  1. Create profiles for existing auth users who don't have them
  2. Fix the trigger function to work properly
  3. Ensure proper RLS policies are in place
*/

-- First, let's create profiles for any existing auth users who don't have them
-- This uses a DO block to safely handle the operation
DO $$
DECLARE
    auth_user RECORD;
BEGIN
    -- Loop through all auth users and create profiles if they don't exist
    FOR auth_user IN 
        SELECT 
            au.id,
            au.email,
            au.raw_user_meta_data->>'display_name' as display_name,
            au.created_at
        FROM auth.users au
        LEFT JOIN public.profiles p ON au.id = p.id
        WHERE p.id IS NULL
    LOOP
        BEGIN
            INSERT INTO public.profiles (id, email, display_name, status, last_active, created_at)
            VALUES (
                auth_user.id,
                auth_user.email,
                COALESCE(auth_user.display_name, ''),
                'offline',
                now(),
                COALESCE(auth_user.created_at, now())
            );
            
            RAISE LOG 'Created profile for user: %', auth_user.email;
        EXCEPTION
            WHEN unique_violation THEN
                -- Profile already exists, skip
                RAISE LOG 'Profile already exists for user: %', auth_user.email;
            WHEN others THEN
                -- Log other errors but continue
                RAISE LOG 'Error creating profile for user %: %', auth_user.email, SQLERRM;
        END;
    END LOOP;
END $$;

-- Drop and recreate the trigger function with better error handling
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Insert profile with proper error handling
    INSERT INTO public.profiles (id, email, display_name, status, last_active, created_at)
    VALUES (
        NEW.id, 
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', ''),
        'offline',
        now(),
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        display_name = CASE 
            WHEN EXCLUDED.display_name != '' THEN EXCLUDED.display_name 
            ELSE profiles.display_name 
        END,
        last_active = EXCLUDED.last_active;
        
    RETURN NEW;
EXCEPTION
    WHEN others THEN
        -- Log the error but don't fail the user creation
        RAISE LOG 'Error creating profile for user %: %', NEW.id, SQLERRM;
        RETURN NEW;
END;
$$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW 
    EXECUTE FUNCTION public.handle_new_user();

-- Ensure RLS policies are correct
DROP POLICY IF EXISTS "Users can view profiles of connected users" ON public.profiles;
DROP POLICY IF EXISTS "Anyone can view profiles for connection requests" ON public.profiles;

-- Allow users to view profiles for connection purposes (needed for adding contacts)
CREATE POLICY "Anyone can view profiles for connection requests"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (true);

-- Update the connections policies to be more permissive for connection requests
DROP POLICY IF EXISTS "Users can send messages to connected users" ON public.messages;

CREATE POLICY "Users can send messages to connected users"
    ON public.messages
    FOR INSERT
    TO authenticated
    WITH CHECK (
        sender_id = auth.uid() AND
        EXISTS (
            SELECT 1 FROM public.connections
            WHERE ((requester_id = auth.uid() AND receiver_id = messages.receiver_id)
                OR (receiver_id = auth.uid() AND requester_id = messages.receiver_id))
            AND status = 'accepted'
        )
    );