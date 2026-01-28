import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_DOMAIN = '@optienergia.pl';

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, password, name } = await req.json();

    // Server-side email domain validation
    if (!email || typeof email !== 'string') {
      console.error('Invalid email provided');
      return new Response(
        JSON.stringify({ 
          error: 'Nieprawidłowy adres email',
          code: 'INVALID_EMAIL' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    
    // Validate email domain - SERVER SIDE ENFORCEMENT
    if (!normalizedEmail.endsWith(ALLOWED_DOMAIN)) {
      console.warn(`Registration attempt with unauthorized domain: ${normalizedEmail}`);
      return new Response(
        JSON.stringify({ 
          error: `Rejestracja dozwolona tylko dla adresów ${ALLOWED_DOMAIN}`,
          code: 'DOMAIN_NOT_ALLOWED' 
        }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate password
    if (!password || typeof password !== 'string' || password.length < 6) {
      return new Response(
        JSON.stringify({ 
          error: 'Hasło musi mieć minimum 6 znaków',
          code: 'WEAK_PASSWORD' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate name
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return new Response(
        JSON.stringify({ 
          error: 'Imię musi mieć minimum 2 znaki',
          code: 'INVALID_NAME' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Create Supabase client with service role for admin operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Get the origin for redirect URL
    const origin = req.headers.get('origin') || 'https://energo-kalkulator-opti.lovable.app';

    // Create the user with signUp (requires email confirmation)
    const { data, error } = await supabaseAdmin.auth.signUp({
      email: normalizedEmail,
      password: password,
      options: {
        emailRedirectTo: `${origin}/verify-email`,
        data: {
          name: name.trim()
        }
      }
    });

    if (error) {
      console.error('Signup error:', error.message);
      
      // Handle specific errors
      if (error.message.includes('already registered') || error.message.includes('already exists')) {
        return new Response(
          JSON.stringify({ 
            error: 'Użytkownik z tym adresem email już istnieje',
            code: 'USER_EXISTS' 
          }),
          { 
            status: 409, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      return new Response(
        JSON.stringify({ 
          error: error.message,
          code: 'SIGNUP_ERROR' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`User registered successfully: ${normalizedEmail}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Konto zostało utworzone. Sprawdź swoją skrzynkę e-mail i kliknij link aktywacyjny, aby móc się zalogować.',
        requiresEmailConfirmation: true,
        user: {
          id: data.user?.id,
          email: data.user?.email
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Wystąpił nieoczekiwany błąd',
        code: 'INTERNAL_ERROR' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
