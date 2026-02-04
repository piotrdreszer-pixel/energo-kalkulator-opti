import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Profile } from '@/types/database';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Defer profile fetch
        if (session?.user) {
          setTimeout(() => {
            fetchProfile(session.user.id);
          }, 0);
        } else {
          setProfile(null);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        return;
      }

      setProfile(data as Profile | null);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Check if email is not verified
        if (error.message.includes('Email not confirmed')) {
          return { 
            error: new Error('Twoje konto nie zostało jeszcze aktywowane. Sprawdź skrzynkę e-mail i kliknij link aktywacyjny (ważny 7 dni).') 
          };
        }
        return { error };
      }

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    // Client-side validation (first line of defense, but not trusted)
    if (!email.toLowerCase().endsWith('@optienergia.pl')) {
      return { 
        error: new Error('Rejestracja dostępna wyłącznie dla adresów e-mail w domenie @optienergia.pl.') 
      };
    }

    try {
      // Use server-side Edge Function for signup with domain validation
      const { data, error } = await supabase.functions.invoke('auth-signup', {
        body: {
          email: email.toLowerCase().trim(),
          password,
          name: name.trim(),
        },
      });

      if (error) {
        console.error('Signup edge function error:', error);
        return { error: new Error('Wystąpił błąd podczas rejestracji. Spróbuj ponownie.') };
      }

      if (data?.error) {
        // Handle specific error codes
        if (data.code === 'DOMAIN_NOT_ALLOWED') {
          return { error: new Error('Rejestracja dostępna wyłącznie dla adresów e-mail w domenie @optienergia.pl.') };
        }
        if (data.code === 'USER_EXISTS') {
          return { error: new Error('Ten adres e-mail jest już zarejestrowany.') };
        }
        if (data.code === 'RATE_LIMIT_EXCEEDED') {
          return { error: new Error('Przekroczono limit rejestracji. Spróbuj ponownie za kilka minut.') };
        }
        return { error: new Error(data.error) };
      }

      return { error: null };
    } catch (error) {
      console.error('Signup error:', error);
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
