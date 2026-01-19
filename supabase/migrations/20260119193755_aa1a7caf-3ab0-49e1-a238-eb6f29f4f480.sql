-- Add explicit deny policy for anonymous users on profiles table
CREATE POLICY "Deny anonymous access"
ON public.profiles
FOR SELECT
TO anon
USING (false);