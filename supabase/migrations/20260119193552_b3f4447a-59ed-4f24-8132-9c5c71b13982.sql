-- Secure email_verification_tokens table
-- These tokens should ONLY be accessed via service role (server-side)
-- Block all client-side access

-- Enable RLS (should already be enabled, but ensure it is)
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;

-- Create restrictive policies that deny all access to regular users
-- Only service role can access this table

CREATE POLICY "Deny all SELECT access"
ON public.email_verification_tokens
FOR SELECT
TO authenticated, anon
USING (false);

CREATE POLICY "Deny all INSERT access"
ON public.email_verification_tokens
FOR INSERT
TO authenticated, anon
WITH CHECK (false);

CREATE POLICY "Deny all UPDATE access"
ON public.email_verification_tokens
FOR UPDATE
TO authenticated, anon
USING (false);

CREATE POLICY "Deny all DELETE access"
ON public.email_verification_tokens
FOR DELETE
TO authenticated, anon
USING (false);