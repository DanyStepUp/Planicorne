-- Script de migration SQL pour Supabase - Bases Relationnelles & Commentaires
-- Exécutez ce script dans l'éditeur SQL (SQL Editor) de votre tableau de bord Supabase

-- 1. Création de la table des posts (déjà existante si migrée précédemment, sinon créée ici)
CREATE TABLE IF NOT EXISTS public.posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  platform TEXT,
  status TEXT,
  attachments JSONB DEFAULT '[]'::jsonb,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  "scheduledAt" TIMESTAMP WITH TIME ZONE
);

-- 2. Table des Entreprises
CREATE TABLE IF NOT EXISTS public.companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo_drive_id TEXT,
  contract_linkedin INTEGER DEFAULT 0,
  contract_facebook INTEGER DEFAULT 0,
  contract_instagram INTEGER DEFAULT 0,
  contract_google INTEGER DEFAULT 0,
  contract_blog INTEGER DEFAULT 0,
  contract_newsletter INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 3. Table des Clients (liés à une entreprise)
CREATE TABLE IF NOT EXISTS public.clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  company_id TEXT REFERENCES public.companies(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. Table des Utilisateurs Step Up (membres de l'équipe interne)
CREATE TABLE IF NOT EXISTS public.stepup_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'editor',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Mettre à jour la table des posts existante avec des clés étrangères
ALTER TABLE public.posts 
ADD COLUMN IF NOT EXISTS client_id TEXT REFERENCES public.clients(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS company_id TEXT REFERENCES public.companies(id) ON DELETE SET NULL;

-- 5. Table des Commentaires sur les posts
CREATE TABLE IF NOT EXISTS public.comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  client_author_id TEXT REFERENCES public.clients(id) ON DELETE CASCADE,
  stepup_author_id TEXT REFERENCES public.stepup_users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  
  -- S'assurer qu'au moins l'un des deux types d'auteur est renseigné
  CONSTRAINT check_author CHECK (
    (client_author_id IS NOT NULL AND stepup_author_id IS NULL) OR
    (client_author_id IS NULL AND stepup_author_id IS NOT NULL)
  )
);

-- 6. Activation de la sécurité au niveau des lignes (Row Level Security)
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stepup_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- 7. Création des politiques pour l'accès public (Select, Insert, Update, Delete) avec la clé anon
DROP POLICY IF EXISTS "Allow public read and write access for posts" ON public.posts;
CREATE POLICY "Allow public read and write access for posts" ON public.posts FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read and write access for companies" ON public.companies;
CREATE POLICY "Allow public read and write access for companies" ON public.companies FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read and write access for clients" ON public.clients;
CREATE POLICY "Allow public read and write access for clients" ON public.clients FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read and write access for stepup_users" ON public.stepup_users;
CREATE POLICY "Allow public read and write access for stepup_users" ON public.stepup_users FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read and write access for comments" ON public.comments;
CREATE POLICY "Allow public read and write access for comments" ON public.comments FOR ALL TO anon USING (true) WITH CHECK (true);

-- 8. Insertion de données d'exemple (seeding)
INSERT INTO public.companies (id, name) VALUES 
  ('comp-1', 'Acapela Corp'),
  ('comp-2', 'Planète Tech')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clients (id, name, email, company_id) VALUES 
  ('client-1', 'Thomas Anderson', 'thomas@acapela.com', 'comp-1'),
  ('client-2', 'Sarah Connor', 'sarah@planetetech.io', 'comp-2')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.stepup_users (id, name, email, role) VALUES 
  ('user-1', 'Alexandre StepUp', 'alexandre@stepup.fr', 'Administrateur'),
  ('user-2', 'Chloé StepUp', 'chloe@stepup.fr', 'Rédactrice'),
  ('user-3', 'Lucas StepUp', 'lucas@stepup.fr', 'Graphiste')
ON CONFLICT (id) DO NOTHING;

-- 9. Table des Comptes Utilisateurs (Authentification)
CREATE TABLE IF NOT EXISTS public.app_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL, -- 'admin', 'stepup_user', 'client'
  client_id TEXT REFERENCES public.clients(id) ON DELETE SET NULL,
  stepup_user_id TEXT REFERENCES public.stepup_users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 10. Table des Logs de Connexion
CREATE TABLE IF NOT EXISTS public.connection_logs (
  id SERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  user_role TEXT NOT NULL,
  logged_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 11. Activation RLS
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_logs ENABLE ROW LEVEL SECURITY;

-- 12. Politiques RLS
DROP POLICY IF EXISTS "Allow public read access for app_users" ON public.app_users;
CREATE POLICY "Allow public read access for app_users" ON public.app_users FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow public insert and read for connection_logs" ON public.connection_logs;
CREATE POLICY "Allow public insert and read for connection_logs" ON public.connection_logs FOR ALL TO anon USING (true) WITH CHECK (true);

-- 13. Seeding des utilisateurs d'authentification
-- Administrateur : Dany R (dany.r@stepupdigital.net / dany2026)
INSERT INTO public.stepup_users (id, name, email, role) VALUES 
  ('user-dany', 'Dany R', 'dany.r@stepupdigital.net', 'Super Administrateur')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.app_users (id, email, password, name, role, stepup_user_id) VALUES
  ('app-user-1', 'dany.r@stepupdigital.net', 'dany2026', 'Dany R', 'admin', 'user-dany')
ON CONFLICT (id) DO NOTHING;

-- Utilisateur interne : Chloé (chloe@stepup.fr / chloe123)
INSERT INTO public.app_users (id, email, password, name, role, stepup_user_id) VALUES
  ('app-user-2', 'chloe@stepup.fr', 'chloe123', 'Chloé StepUp', 'stepup_user', 'user-2')
ON CONFLICT (id) DO NOTHING;

-- Utilisateur Client : Thomas Anderson (thomas@acapela.com / thomas123)
INSERT INTO public.app_users (id, email, password, name, role, client_id) VALUES
  ('app-user-3', 'thomas@acapela.com', 'thomas123', 'Thomas Anderson', 'client', 'client-1')
ON CONFLICT (id) DO NOTHING;


-- 14. Scripts d'altération de sécurité pour les bases de données existantes
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_drive_id TEXT;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS contract_linkedin INTEGER DEFAULT 0;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS contract_facebook INTEGER DEFAULT 0;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS contract_instagram INTEGER DEFAULT 0;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS contract_google INTEGER DEFAULT 0;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS contract_blog INTEGER DEFAULT 0;
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS contract_newsletter INTEGER DEFAULT 0;


