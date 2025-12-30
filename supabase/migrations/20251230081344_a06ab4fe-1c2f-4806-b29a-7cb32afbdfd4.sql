-- Create a separate table for verification tokens with restrictive RLS
CREATE TABLE public.email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  token text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;

-- No SELECT policy for regular users - tokens should only be accessed server-side
-- Only allow the system to manage these tokens via service role

-- Migrate existing tokens from profiles to the new table
INSERT INTO public.email_verification_tokens (user_id, token, expires_at)
SELECT user_id, verification_token, verification_token_expires_at
FROM public.profiles
WHERE verification_token IS NOT NULL AND verification_token_expires_at IS NOT NULL;

-- Remove verification token columns from profiles table
ALTER TABLE public.profiles DROP COLUMN IF EXISTS verification_token;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS verification_token_expires_at;

-- Add explicit restrictive policies to user_roles to prevent privilege escalation
CREATE POLICY "Prevent users from inserting roles"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY "Prevent users from updating roles"
ON public.user_roles FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "Prevent users from deleting roles"
ON public.user_roles FOR DELETE
TO authenticated
USING (false);