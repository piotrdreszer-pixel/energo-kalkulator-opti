-- Add RLS policy for email_verification_tokens
-- Users can only view their own verification tokens
CREATE POLICY "Users can view their own verification tokens"
ON public.email_verification_tokens
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);