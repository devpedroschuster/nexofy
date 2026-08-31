-- PED-88: o advisor de segurança (get_advisors, lint
-- 0011_function_search_path_mutable) aponta as 8 functions de seed
-- fake_* (public.fake_cpf, fake_cnpj, fake_nome, fake_email, fake_telefone,
-- fake_bairro, fake_cidade, fake_cep) sem SET search_path — diferente das
-- demais functions capturadas no mesmo lote (20260827141042), que quase
-- todas já têm `SET search_path TO 'public'`.
--
-- Nenhuma delas é SECURITY DEFINER e nenhuma referencia tabela ou função de
-- `public` (só literais, arrays e built-ins de pg_catalog como lpad/
-- substring, sempre resolvidos independente do search_path) — por isso
-- `search_path = ''` é suficiente e mais restritivo que `= public`.
--
-- Confirmado nesta sessão: essas 8 functions só existem em staging
-- (qjmybxkfjkxttggdjxga), não em produção (tciiepqmnrrcjnqhspvw) — são
-- helpers do dump anonimizado de produção→staging (supabase/seed-staging/
-- README.md), nunca usadas em produção. `ALTER FUNCTION` não aceita
-- `IF EXISTS`, então o bloco abaixo confere a existência em pg_proc antes
-- de alterar, pra rodar sem erro (no-op) em produção, seguindo a mesma
-- disciplina de migration idempotente entre os dois ambientes já usada em
-- 20260831120000_align_rpc_execute_grants_staging_prod.sql.
do $$
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fake_bairro') then
    alter function public.fake_bairro(bigint) set search_path = '';
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fake_cep') then
    alter function public.fake_cep(bigint) set search_path = '';
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fake_cidade') then
    alter function public.fake_cidade(bigint) set search_path = '';
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fake_cnpj') then
    alter function public.fake_cnpj(bigint) set search_path = '';
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fake_cpf') then
    alter function public.fake_cpf(bigint) set search_path = '';
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fake_email') then
    alter function public.fake_email(bigint, text) set search_path = '';
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fake_nome') then
    alter function public.fake_nome(bigint) set search_path = '';
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fake_telefone') then
    alter function public.fake_telefone(bigint) set search_path = '';
  end if;
end;
$$;
