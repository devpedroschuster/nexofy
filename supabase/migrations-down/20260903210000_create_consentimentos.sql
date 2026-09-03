-- supabase/migrations-down/20260903210000_create_consentimentos.sql
drop trigger if exists on_auth_user_created_consentimento on auth.users;
drop function if exists public.handle_new_user_consentimento();
drop table if exists public.consentimentos;
