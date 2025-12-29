-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_verified BOOLEAN DEFAULT false,
  verification_token TEXT,
  verification_token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);

-- Create project status enum
CREATE TYPE public.project_status AS ENUM ('roboczy', 'wysłany klientowi', 'zaakceptowany');

-- Create client_projects table
CREATE TABLE public.client_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name TEXT NOT NULL,
  client_nip TEXT NOT NULL,
  client_address TEXT,
  description TEXT,
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status project_status NOT NULL DEFAULT 'roboczy',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create energy_analyses table
CREATE TABLE public.energy_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_project_id UUID REFERENCES public.client_projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Nowa analiza',
  period_from DATE,
  period_to DATE,
  
  -- Tariff codes
  tariff_code_before TEXT NOT NULL DEFAULT 'C11',
  tariff_code_after TEXT NOT NULL DEFAULT 'C11',
  zones_count_before INTEGER NOT NULL DEFAULT 1,
  zones_count_after INTEGER NOT NULL DEFAULT 1,
  
  -- Contracted power
  contracted_power_before_kw NUMERIC(10,2) DEFAULT 0,
  contracted_power_after_kw NUMERIC(10,2) DEFAULT 0,
  
  -- Distribution BEFORE
  fixed_distribution_before_total NUMERIC(12,2) DEFAULT 0,
  variable_distribution_before_zone1_rate NUMERIC(10,6) DEFAULT 0,
  variable_distribution_before_zone2_rate NUMERIC(10,6) DEFAULT 0,
  variable_distribution_before_zone3_rate NUMERIC(10,6) DEFAULT 0,
  reactive_energy_cost_before NUMERIC(12,2) DEFAULT 0,
  capacity_charge_before NUMERIC(12,2) DEFAULT 0,
  contracted_power_charge_rate_before NUMERIC(10,2) DEFAULT 0,
  
  -- Distribution AFTER
  fixed_distribution_after_total NUMERIC(12,2) DEFAULT 0,
  variable_distribution_after_zone1_rate NUMERIC(10,6) DEFAULT 0,
  variable_distribution_after_zone2_rate NUMERIC(10,6) DEFAULT 0,
  variable_distribution_after_zone3_rate NUMERIC(10,6) DEFAULT 0,
  reactive_energy_cost_after NUMERIC(12,2) DEFAULT 0,
  capacity_charge_after NUMERIC(12,2) DEFAULT 0,
  contracted_power_charge_rate_after NUMERIC(10,2) DEFAULT 0,
  
  -- Active energy prices BEFORE
  active_energy_price_before_zone1 NUMERIC(10,2) DEFAULT 0,
  active_energy_price_before_zone2 NUMERIC(10,2) DEFAULT 0,
  active_energy_price_before_zone3 NUMERIC(10,2) DEFAULT 0,
  
  -- Consumption (shared for before/after)
  consumption_zone1_mwh NUMERIC(12,4) DEFAULT 0,
  consumption_zone2_mwh NUMERIC(12,4) DEFAULT 0,
  consumption_zone3_mwh NUMERIC(12,4) DEFAULT 0,
  
  -- Active energy prices AFTER
  active_energy_price_after_zone1 NUMERIC(10,2) DEFAULT 0,
  active_energy_price_after_zone2 NUMERIC(10,2) DEFAULT 0,
  active_energy_price_after_zone3 NUMERIC(10,2) DEFAULT 0,
  
  -- Handling fee
  handling_fee_before NUMERIC(12,2) DEFAULT 0,
  handling_fee_after NUMERIC(12,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.energy_analyses ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- RLS policies for profiles
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- RLS policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- RLS policies for client_projects - all authenticated users can access
CREATE POLICY "Authenticated users can view all projects"
ON public.client_projects FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create projects"
ON public.client_projects FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by_user_id);

CREATE POLICY "Authenticated users can update projects"
ON public.client_projects FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete their own projects"
ON public.client_projects FOR DELETE
TO authenticated
USING (auth.uid() = created_by_user_id);

-- RLS policies for energy_analyses
CREATE POLICY "Authenticated users can view all analyses"
ON public.energy_analyses FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can create analyses"
ON public.energy_analyses FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update analyses"
ON public.energy_analyses FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete analyses"
ON public.energy_analyses FOR DELETE
TO authenticated
USING (true);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_projects_updated_at
BEFORE UPDATE ON public.client_projects
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_energy_analyses_updated_at
BEFORE UPDATE ON public.energy_analyses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to handle new user signup - creates profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email, email_verified)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data ->> 'name', 'Użytkownik'),
    NEW.email,
    COALESCE(NEW.email_confirmed_at IS NOT NULL, false)
  );
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- Trigger for new user creation
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();