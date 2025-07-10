/*
  # Fix user signup trigger function

  This migration fixes the database error that occurs when new users try to sign up. The issue is with the trigger function that should automatically create a profile entry when a new user is created in the auth.users table.

  ## Changes Made

  1. Updated trigger function: Fixed the handle_new_user() function to properly handle new user creation
  2. Recreated trigger: Ensured the trigger is properly set up to call the function on new user signup
  3. Updated RLS policies: Made sure the policies allow the trigger function to insert new profiles

  ## Security

  - Row Level Security remains enabled on the profiles table
  - Policies are updated to ensure proper access control while allowing the trigger to function
*/

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Create or replace the function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, status, last_active, created_at)
  VALUES (
    NEW.id, 
    NEW.email,
    'offline',
    now(),
    now()
  );
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log the error but don't fail the user creation
    RAISE LOG 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();

-- Update RLS policies to ensure the trigger can insert profiles
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "System can create profiles" ON public.profiles;

-- Allow authenticated users to insert their own profile
CREATE POLICY "Users can insert their own profile"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Allow the system (trigger function) to create profiles
CREATE POLICY "System can create profiles"
  ON public.profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);