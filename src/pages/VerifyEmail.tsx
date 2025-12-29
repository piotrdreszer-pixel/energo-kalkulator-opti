import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Loader2, Zap } from 'lucide-react';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const verifyEmail = async () => {
      // Get token from URL - Supabase sends token_hash and type
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type');

      if (!tokenHash || type !== 'email') {
        // Check if this is an error from Supabase
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');
        
        if (error) {
          setErrorMessage(errorDescription || 'Link aktywacyjny jest nieprawidłowy lub wygasł.');
          setStatus('error');
          return;
        }

        setErrorMessage('Link aktywacyjny jest nieprawidłowy.');
        setStatus('error');
        return;
      }

      try {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'email',
        });

        if (error) {
          setErrorMessage('Link aktywacyjny jest nieprawidłowy lub wygasł.');
          setStatus('error');
          return;
        }

        // Update profile to mark email as verified
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase
            .from('profiles')
            .update({ email_verified: true, verification_token: null, verification_token_expires_at: null })
            .eq('user_id', user.id);
        }

        setStatus('success');
      } catch (err) {
        setErrorMessage('Wystąpił błąd podczas weryfikacji. Spróbuj ponownie później.');
        setStatus('error');
      }
    };

    verifyEmail();
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6 animate-slide-up">
        {/* Logo */}
        <div className="text-center">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary shadow-lg">
              <Zap className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="font-display text-2xl font-bold text-foreground">
              Optienergia
            </span>
          </div>
        </div>

        <Card>
          <CardHeader className="text-center">
            {status === 'loading' && (
              <>
                <div className="mx-auto mb-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                </div>
                <CardTitle className="text-xl font-display">Weryfikacja adresu e-mail</CardTitle>
                <CardDescription>Proszę czekać...</CardDescription>
              </>
            )}

            {status === 'success' && (
              <>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
                  <CheckCircle className="h-8 w-8 text-success" />
                </div>
                <CardTitle className="text-xl font-display">Adres e-mail potwierdzony</CardTitle>
                <CardDescription className="text-base">
                  Adres e-mail został potwierdzony. Możesz się teraz zalogować.
                </CardDescription>
              </>
            )}

            {status === 'error' && (
              <>
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                  <XCircle className="h-8 w-8 text-destructive" />
                </div>
                <CardTitle className="text-xl font-display">Błąd weryfikacji</CardTitle>
                <CardDescription className="text-base text-destructive">
                  {errorMessage}
                </CardDescription>
              </>
            )}
          </CardHeader>

          {(status === 'success' || status === 'error') && (
            <CardContent>
              <Button asChild className="w-full">
                <Link to="/auth">
                  {status === 'success' ? 'Przejdź do logowania' : 'Wróć do strony logowania'}
                </Link>
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
