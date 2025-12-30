-- Remove the SELECT policy that exposes verification tokens
-- These tokens should only be accessed server-side via service role
DROP POLICY IF EXISTS "Users can view their own verification tokens" ON public.email_verification_tokens;