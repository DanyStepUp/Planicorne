-- ====================================================================
-- SCRIPT DE MIGRATION SUPABASE - SÉCURISATION RGPD & ACCÈS DIRECT TABLE
-- ====================================================================
-- INSTRUCTIONS :
-- 1. Rendez-vous sur votre console Supabase (https://supabase.com).
-- 2. Ouvrez l'éditeur SQL (SQL Editor) dans le menu latéral.
-- 3. Créez une nouvelle requête (New query).
-- 4. Collez l'intégralité de ce script et cliquez sur le bouton "RUN".
-- ====================================================================

-- 1. Activer l'extension pgcrypto pour le hachage sécurisé des mots de passe
create extension if not exists pgcrypto;

-- 2. Activer RLS (Row Level Security) sur la table app_users
alter table public.app_users enable row level security;

-- 3. Créer une politique RLS restrictive pour empêcher tout accès direct par défaut via l'API REST publique
drop policy if exists "Empêcher tout accès direct à app_users" on public.app_users;
create policy "Empêcher tout accès direct à app_users" on public.app_users
  for all to public using (false) with check (false);

-- 4. Hacher tous les mots de passe existants qui sont encore en clair
update public.app_users
set password = crypt(password, gen_salt('bf'))
where password not like '$2a$%'; -- Les hashes bcrypt/blowfish commencent par $2a$

-- 5. RPC : Authentification sécurisée (SECURITY DEFINER contourne RLS)
create or replace function public.rpc_authenticate_user(p_email text, p_password text)
returns json
language plpgsql
security definer -- Contourne RLS en s'exécutant avec les droits du créateur
as $$
declare
  v_user record;
begin
  select 
    id, email, name, role, client_id, stepup_user_id
  into v_user
  from public.app_users
  where lower(email) = lower(p_email)
    and password = crypt(p_password, password); -- Vérification du mot de passe haché

  if v_user.id is null then
    return null;
  end if;

  -- Récupérer également le company_id si c'est un client
  if v_user.client_id is not null then
    declare
      v_company_id text;
    begin
      select company_id into v_company_id from public.clients where id = v_user.client_id;
      return json_build_object(
        'id', v_user.id,
        'email', v_user.email,
        'name', v_user.name,
        'role', v_user.role,
        'client_id', v_user.client_id,
        'stepup_user_id', v_user.stepup_user_id,
        'company_id', v_company_id
      );
    end;
  else
    return json_build_object(
      'id', v_user.id,
      'email', v_user.email,
      'name', v_user.name,
      'role', v_user.role,
      'client_id', v_user.client_id,
      'stepup_user_id', v_user.stepup_user_id
    );
  end if;
end;
$$;

-- 6. RPC : Récupération sécurisée du profil utilisateur connecté
create or replace function public.rpc_refresh_user_session(p_user_id text)
returns json
language plpgsql
security definer
as $$
declare
  v_user record;
begin
  select 
    id, email, name, role, client_id, stepup_user_id
  into v_user
  from public.app_users
  where id = p_user_id;

  if v_user.id is null then
    return null;
  end if;

  if v_user.client_id is not null then
    declare
      v_company_id text;
    begin
      select company_id into v_company_id from public.clients where id = v_user.client_id;
      return json_build_object(
        'id', v_user.id,
        'email', v_user.email,
        'name', v_user.name,
        'role', v_user.role,
        'client_id', v_user.client_id,
        'stepup_user_id', v_user.stepup_user_id,
        'company_id', v_company_id
      );
    end;
  else
    return json_build_object(
      'id', v_user.id,
      'email', v_user.email,
      'name', v_user.name,
      'role', v_user.role,
      'client_id', v_user.client_id,
      'stepup_user_id', v_user.stepup_user_id
    );
  end if;
end;
$$;

-- 7. RPC : Création sécurisée d'un utilisateur avec mot de passe haché
create or replace function public.rpc_create_app_user(
  p_id text,
  p_email text,
  p_password text,
  p_name text,
  p_role text,
  p_client_id text default null,
  p_stepup_user_id text default null
)
returns json
language plpgsql
security definer
as $$
declare
  v_new_user record;
begin
  if exists (select 1 from public.app_users where lower(email) = lower(p_email)) then
    raise exception 'email_already_exists';
  end if;

  insert into public.app_users (id, email, password, name, role, client_id, stepup_user_id)
  values (
    p_id,
    lower(p_email),
    crypt(p_password, gen_salt('bf')), -- Hachage à la volée
    p_name,
    p_role,
    p_client_id,
    p_stepup_user_id
  )
  returning id, email, name, role, client_id, stepup_user_id into v_new_user;

  return json_build_object(
    'id', v_new_user.id,
    'email', v_new_user.email,
    'name', v_new_user.name,
    'role', v_new_user.role,
    'client_id', v_new_user.client_id,
    'stepup_user_id', v_new_user.stepup_user_id
  );
end;
$$;

-- 8. RPC : Mise à jour sécurisée d'un profil par l'administration (avec ou sans modification de mot de passe)
create or replace function public.rpc_update_app_user(
  p_target_column text, -- 'client_id' ou 'stepup_user_id'
  p_target_id text,
  p_name text,
  p_email text,
  p_password text default null,
  p_role text default null
)
returns boolean
language plpgsql
security definer
as $$
begin
  -- Vérifier l'unicité de l'email
  if p_target_column = 'client_id' then
    if exists (select 1 from public.app_users where lower(email) = lower(p_email) and client_id <> p_target_id) then
      raise exception 'email_already_exists';
    end if;
  else
    if exists (select 1 from public.app_users where lower(email) = lower(p_email) and stepup_user_id <> p_target_id) then
      raise exception 'email_already_exists';
    end if;
  end if;

  if p_target_column = 'client_id' then
    update public.app_users
    set name = p_name,
        email = lower(p_email),
        password = case when p_password is not null then crypt(p_password, gen_salt('bf')) else password end
    where client_id = p_target_id;
  else
    update public.app_users
    set name = p_name,
        email = lower(p_email),
        password = case when p_password is not null then crypt(p_password, gen_salt('bf')) else password end,
        role = case when p_role is not null then p_role else role end
    where stepup_user_id = p_target_id;
  end if;

  return true;
end;
$$;

-- 9. RPC : Suppression sécurisée d'un utilisateur par l'administration
create or replace function public.rpc_delete_app_user(
  p_target_column text,
  p_target_id text
)
returns boolean
language plpgsql
security definer
as $$
begin
  if p_target_column = 'client_id' then
    delete from public.app_users where client_id = p_target_id;
  else
    delete from public.app_users where stepup_user_id = p_target_id;
  end if;
  return true;
end;
$$;

-- 10. RPC : Changement du mot de passe par l'utilisateur lui-même (Settings profil)
create or replace function public.rpc_change_user_password(
  p_user_id text,
  p_old_password text,
  p_new_password text
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_current_pw text;
begin
  select password into v_current_pw from public.app_users where id = p_user_id;

  if v_current_pw is null then
    raise exception 'user_not_found';
  end if;

  -- Vérifier l'ancien mot de passe
  if v_current_pw <> crypt(p_old_password, v_current_pw) then
    raise exception 'invalid_current_password';
  end if;

  -- Mettre à jour avec le nouveau mot de passe haché
  update public.app_users
  set password = crypt(p_new_password, gen_salt('bf'))
  where id = p_user_id;

  return true;
end;
$$;

-- 11. RPC : Réinitialisation sécurisée du mot de passe par e-mail
create or replace function public.rpc_reset_password_by_email(
  p_email text,
  p_new_password text
)
returns boolean
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from public.app_users where lower(email) = lower(p_email)) then
    raise exception 'email_not_found';
  end if;

  update public.app_users
  set password = crypt(p_new_password, gen_salt('bf'))
  where lower(email) = lower(p_email);

  return true;
end;
$$;

-- 12. RPC : Extraction complète des utilisateurs pour sauvegarde
create or replace function public.rpc_fetch_all_app_users()
returns json
language plpgsql
security definer
as $$
begin
  return (
    select coalesce(json_agg(t), '[]'::json)
    from (
      select id, email, password, name, role, client_id, stepup_user_id
      from public.app_users
      order by name
    ) t
  );
end;
$$;

-- ====================================================================
-- AJOUT DU LOGICIEL DE RÉINITIALISATION DE MOT DE PASSE PAR LIEN EMAIL (RESEND)
-- ====================================================================

-- 13. Ajouter les colonnes pour stocker temporairement le token
alter table public.app_users add column if not exists reset_token text;
alter table public.app_users add column if not exists reset_token_expires_at timestamp with time zone;

-- 14. RPC : Enregistrer un token de réinitialisation pour un utilisateur
create or replace function public.rpc_set_reset_token(
  p_email text,
  p_token text,
  p_expires_in_hours integer default 1
)
returns boolean
language plpgsql
security definer
as $$
begin
  if not exists (select 1 from public.app_users where lower(email) = lower(p_email)) then
    raise exception 'email_not_found';
  end if;

  update public.app_users
  set reset_token = p_token,
      reset_token_expires_at = now() + (p_expires_in_hours * interval '1 hour')
  where lower(email) = lower(p_email);

  return true;
end;
$$;

-- 15. RPC : Réinitialiser le mot de passe en utilisant le token de vérification
create or replace function public.rpc_reset_password_by_token(
  p_token text,
  p_new_password text
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_email text;
begin
  select email into v_email
  from public.app_users
  where reset_token = p_token
    and reset_token_expires_at > now();

  if v_email is null then
    raise exception 'invalid_or_expired_token';
  end if;

  update public.app_users
  set password = crypt(p_new_password, gen_salt('bf')),
      reset_token = null,
      reset_token_expires_at = null
  where email = v_email;

  return true;
end;
$$;

-- 16. Activer l'extension pg_net pour les appels HTTP asynchrones (bypasser CORS)
create extension if not exists pg_net;

-- RPC : Envoyer l'e-mail de réinitialisation via Resend (exécuté côté serveur)
create or replace function public.rpc_send_reset_email(
  p_email text,
  p_token text,
  p_api_key text,
  p_origin text
)
returns boolean
language plpgsql
security definer
as $$
declare
  v_url text := 'https://api.resend.com/emails';
  v_body jsonb;
  v_headers jsonb;
  v_reset_link text;
begin
  v_reset_link := p_origin || '/?reset_token=' || p_token;

  v_body := jsonb_build_object(
    'from', 'Planicorne <onboarding@resend.dev>',
    'to', jsonb_build_array(p_email),
    'subject', 'Réinitialisation de votre mot de passe - Step Up Planicorne',
    'html', '
      <div style="font-family: sans-serif; padding: 24px; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #1579b0; margin-top: 0; font-size: 1.5rem; font-weight: 800;">Réinitialisation de mot de passe</h2>
        <p style="font-size: 0.95rem; line-height: 1.5; color: #4a5568;">Bonjour,</p>
        <p style="font-size: 0.95rem; line-height: 1.5; color: #4a5568;">Vous avez demandé la réinitialisation de votre mot de passe pour votre compte <strong>Step Up Planicorne</strong>.</p>
        <p style="font-size: 0.95rem; line-height: 1.5; color: #4a5568;">Veuillez cliquer sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="' || v_reset_link || '" style="background-color: #1579b0; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block; box-shadow: 0 4px 12px rgba(25, 140, 204, 0.25);">Réinitialiser mon mot de passe</a>
        </div>
        <p style="font-size: 0.85rem; line-height: 1.4; color: #718096; background: #f7fafc; padding: 12px; border-radius: 6px; border: 1px dashed #e2e8f0;">
          Si le bouton ne fonctionne pas, copiez-collez le lien suivant dans votre navigateur :<br/>
          <a href="' || v_reset_link || '" style="color: #1579b0; word-break: break-all;">' || v_reset_link || '</a>
        </p>
        <hr style="border: none; border-top: 1px solid #edf2f7; margin: 24px 0;" />
        <p style="font-size: 0.8rem; color: #a0aec0; margin-bottom: 0;">Ce lien expira dans 1 heure. Si vous n''êtes pas à l''origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité.</p>
      </div>
    '
  );

  v_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || p_api_key
  );

  perform net.http_post(
    url := v_url,
    body := v_body,
    headers := v_headers
  );

  return true;
end;
$$;

-- ====================================================================
-- 17. OPTIONNEL : Promouvoir un utilisateur existant au rôle de "super_manager"
-- ====================================================================
-- Si vous souhaitez promouvoir un utilisateur spécifique au rôle de Super Manager,
-- remplacez 'email@exemple.com' par l'adresse email de l'utilisateur concerné et exécutez ceci :
--
-- UPDATE public.app_users 
-- SET role = 'super_manager' 
-- WHERE lower(email) = lower('email@exemple.com');

