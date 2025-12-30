import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Lock, User, CheckCircle, AlertCircle, Zap, Shield, TrendingDown } from 'lucide-react';
import { z } from 'zod';
import logo from '@/assets/logo.png';

const loginSchema = z.object({
  email: z.string().email('Nieprawidłowy format adresu e-mail'),
  password: z.string().min(6, 'Hasło musi mieć minimum 6 znaków'),
});

const registerSchema = z.object({
  name: z.string().min(2, 'Imię i nazwisko musi mieć minimum 2 znaki').max(100, 'Imię i nazwisko może mieć maksimum 100 znaków'),
  email: z.string().email('Nieprawidłowy format adresu e-mail').refine(
    (email) => email.endsWith('@optienergia.pl'),
    'Rejestracja dostępna wyłącznie dla adresów e-mail w domenie @optienergia.pl.'
  ),
  password: z.string().min(6, 'Hasło musi mieć minimum 6 znaków'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Hasła muszą być identyczne',
  path: ['confirmPassword'],
});

export default function Auth() {
  const [activeTab, setActiveTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  
  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // Register form
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirmPassword, setRegisterConfirmPassword] = useState('');
  
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Redirect if already logged in
  if (user) {
    return <Navigate to="/projects" replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    
    try {
      loginSchema.parse({ email: loginEmail, password: loginPassword });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            errors[err.path[0].toString()] = err.message;
          }
        });
        setFormErrors(errors);
        return;
      }
    }
    
    setLoading(true);
    
    const { error } = await signIn(loginEmail, loginPassword);
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Błąd logowania',
        description: error.message,
      });
    } else {
      navigate('/projects');
    }
    
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    
    try {
      registerSchema.parse({
        name: registerName,
        email: registerEmail,
        password: registerPassword,
        confirmPassword: registerConfirmPassword,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            errors[err.path[0].toString()] = err.message;
          }
        });
        setFormErrors(errors);
        return;
      }
    }
    
    setLoading(true);
    
    const { error } = await signUp(registerEmail, registerPassword, registerName);
    
    if (error) {
      toast({
        variant: 'destructive',
        title: 'Błąd rejestracji',
        description: error.message,
      });
    } else {
      setRegistrationSuccess(true);
    }
    
    setLoading(false);
  };

  if (registrationSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent/10 rounded-full blur-3xl" />
        </div>
        
        <Card className="w-full max-w-md animate-scale-in relative backdrop-blur-sm bg-card/95 border-border/50 shadow-xl">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-success/20 to-success/5 ring-4 ring-success/10">
              <CheckCircle className="h-10 w-10 text-success" />
            </div>
            <CardTitle className="text-2xl font-display bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
              Sprawdź swoją skrzynkę
            </CardTitle>
            <CardDescription className="text-base mt-2">
              Na podany adres e-mail wysłaliśmy link aktywacyjny. Link będzie ważny przez 7 dni. 
              Po potwierdzeniu adresu e-mail będziesz mógł/mogła się zalogować.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <Button 
              variant="outline" 
              className="w-full h-12 text-base font-medium hover:bg-primary hover:text-primary-foreground transition-all duration-300"
              onClick={() => {
                setRegistrationSuccess(false);
                setActiveTab('login');
              }}
            >
              Przejdź do logowania
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-gradient-to-br from-primary/5 via-background to-accent/5">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-primary/8 rounded-full blur-3xl animate-pulse" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-accent/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 right-1/3 w-72 h-72 bg-success/5 rounded-full blur-3xl" />
      </div>

      {/* Left side - Branding & Features (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative items-center justify-center p-12">
        <div className="max-w-lg space-y-8 animate-fade-in">
          <div className="space-y-4">
            <img src={logo} alt="Optienergia" className="h-16 w-auto" />
            <h1 className="text-4xl xl:text-5xl font-display font-bold text-foreground leading-tight">
              Optymalizuj koszty
              <span className="block bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                energii elektrycznej
              </span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Profesjonalne narzędzie do analizy i optymalizacji kosztów energii elektrycznej dla przedsiębiorstw.
            </p>
          </div>

          {/* Feature cards */}
          <div className="space-y-4 pt-4">
            <FeatureCard 
              icon={<TrendingDown className="h-5 w-5" />}
              title="Analiza oszczędności"
              description="Dokładne obliczenia potencjalnych oszczędności przy zmianie taryfy"
            />
            <FeatureCard 
              icon={<Zap className="h-5 w-5" />}
              title="Porównanie taryf"
              description="Kompleksowe porównanie kosztów przed i po optymalizacji"
            />
            <FeatureCard 
              icon={<Shield className="h-5 w-5" />}
              title="Bezpieczeństwo danych"
              description="Wszystkie dane są bezpiecznie przechowywane i chronione"
            />
          </div>
        </div>
      </div>

      {/* Right side - Auth form */}
      <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-4 sm:p-8 relative">
        <div className="w-full max-w-md space-y-6 animate-slide-up">
          {/* Mobile logo */}
          <div className="text-center lg:hidden">
            <div className="flex justify-center mb-3">
              <img src={logo} alt="Optienergia" className="h-12 w-auto" />
            </div>
            <p className="text-sm text-muted-foreground">
              Kalkulator oszczędności energii
            </p>
          </div>

          <Card className="backdrop-blur-sm bg-card/95 border-border/50 shadow-2xl">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <CardHeader className="pb-4 space-y-4">
                <div className="hidden lg:block text-center">
                  <CardTitle className="text-2xl font-display">Witaj ponownie</CardTitle>
                  <CardDescription className="mt-1">
                    {activeTab === 'login' 
                      ? 'Zaloguj się do swojego konta' 
                      : 'Utwórz nowe konto w systemie'}
                  </CardDescription>
                </div>
                <TabsList className="grid w-full grid-cols-2 h-12">
                  <TabsTrigger value="login" className="text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
                    Logowanie
                  </TabsTrigger>
                  <TabsTrigger value="register" className="text-sm font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">
                    Rejestracja
                  </TabsTrigger>
                </TabsList>
              </CardHeader>

              <CardContent className="pt-0">
                <TabsContent value="login" className="mt-0 space-y-4">
                  <form onSubmit={handleLogin} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="login-email" className="text-sm font-medium">
                        Adres e-mail
                      </Label>
                      <div className="relative group">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <Input
                          id="login-email"
                          type="email"
                          placeholder="jan.kowalski@optienergia.pl"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          className="pl-11 h-12 bg-background/50 border-border/60 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          required
                        />
                      </div>
                      {formErrors.email && (
                        <p className="text-sm text-destructive flex items-center gap-1.5 mt-1.5">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {formErrors.email}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="login-password" className="text-sm font-medium">
                        Hasło
                      </Label>
                      <div className="relative group">
                        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <Input
                          id="login-password"
                          type="password"
                          placeholder="••••••••"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          className="pl-11 h-12 bg-background/50 border-border/60 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          required
                        />
                      </div>
                      {formErrors.password && (
                        <p className="text-sm text-destructive flex items-center gap-1.5 mt-1.5">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {formErrors.password}
                        </p>
                      )}
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg hover:shadow-xl transition-all duration-300" 
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Logowanie...
                        </>
                      ) : (
                        'Zaloguj się'
                      )}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="register" className="mt-0 space-y-4">
                  <div className="p-4 rounded-xl bg-gradient-to-r from-secondary/50 to-secondary/30 border border-secondary/50">
                    <p className="font-medium text-sm text-foreground mb-1">Informacja o rejestracji</p>
                    <p className="text-sm text-muted-foreground">
                      Dostępna wyłącznie dla adresów e-mail w domenie <span className="font-medium text-primary">@optienergia.pl</span>
                    </p>
                  </div>

                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-name" className="text-sm font-medium">
                        Imię i nazwisko
                      </Label>
                      <div className="relative group">
                        <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <Input
                          id="register-name"
                          type="text"
                          placeholder="Jan Kowalski"
                          value={registerName}
                          onChange={(e) => setRegisterName(e.target.value)}
                          className="pl-11 h-12 bg-background/50 border-border/60 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          required
                        />
                      </div>
                      {formErrors.name && (
                        <p className="text-sm text-destructive flex items-center gap-1.5 mt-1.5">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {formErrors.name}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-email" className="text-sm font-medium">
                        Adres e-mail
                      </Label>
                      <div className="relative group">
                        <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <Input
                          id="register-email"
                          type="email"
                          placeholder="jan.kowalski@optienergia.pl"
                          value={registerEmail}
                          onChange={(e) => setRegisterEmail(e.target.value)}
                          className="pl-11 h-12 bg-background/50 border-border/60 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                          required
                        />
                      </div>
                      {formErrors.email && (
                        <p className="text-sm text-destructive flex items-center gap-1.5 mt-1.5">
                          <AlertCircle className="h-3.5 w-3.5" />
                          {formErrors.email}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="register-password" className="text-sm font-medium">
                          Hasło
                        </Label>
                        <div className="relative group">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                          <Input
                            id="register-password"
                            type="password"
                            placeholder="Min. 6 znaków"
                            value={registerPassword}
                            onChange={(e) => setRegisterPassword(e.target.value)}
                            className="pl-11 h-12 bg-background/50 border-border/60 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                            required
                          />
                        </div>
                        {formErrors.password && (
                          <p className="text-sm text-destructive flex items-center gap-1.5 mt-1.5">
                            <AlertCircle className="h-3.5 w-3.5" />
                            {formErrors.password}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="register-confirm" className="text-sm font-medium">
                          Powtórz hasło
                        </Label>
                        <div className="relative group">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                          <Input
                            id="register-confirm"
                            type="password"
                            placeholder="Powtórz"
                            value={registerConfirmPassword}
                            onChange={(e) => setRegisterConfirmPassword(e.target.value)}
                            className="pl-11 h-12 bg-background/50 border-border/60 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                            required
                          />
                        </div>
                        {formErrors.confirmPassword && (
                          <p className="text-sm text-destructive flex items-center gap-1.5 mt-1.5">
                            <AlertCircle className="h-3.5 w-3.5" />
                            {formErrors.confirmPassword}
                          </p>
                        )}
                      </div>
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full h-12 text-base font-semibold bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg hover:shadow-xl transition-all duration-300" 
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Rejestracja...
                        </>
                      ) : (
                        'Załóż konto'
                      )}
                    </Button>
                  </form>
                </TabsContent>
              </CardContent>
            </Tabs>
          </Card>

          {/* Footer */}
          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Optienergia. Wszelkie prawa zastrzeżone.
          </p>
        </div>
      </div>
    </div>
  );
}

// Feature card component
function FeatureCard({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl bg-card/50 border border-border/50 backdrop-blur-sm hover:bg-card/80 hover:border-primary/20 transition-all duration-300">
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-primary/20 to-accent/10 flex items-center justify-center text-primary">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
    </div>
  );
}
