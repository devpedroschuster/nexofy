-- Reverte 20260831140000_fix_fake_functions_search_path.sql: volta as 8
-- functions de seed fake_* (só existem em staging) ao search_path mutável
-- de antes. Mesma checagem condicional da migration "up" (ALTER FUNCTION
-- não aceita IF EXISTS), pra rodar sem erro (no-op) em produção.
do $$
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fake_bairro') then
    alter function public.fake_bairro(bigint) reset search_path;
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fake_cep') then
    alter function public.fake_cep(bigint) reset search_path;
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fake_cidade') then
    alter function public.fake_cidade(bigint) reset search_path;
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fake_cnpj') then
    alter function public.fake_cnpj(bigint) reset search_path;
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fake_cpf') then
    alter function public.fake_cpf(bigint) reset search_path;
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fake_email') then
    alter function public.fake_email(bigint, text) reset search_path;
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fake_nome') then
    alter function public.fake_nome(bigint) reset search_path;
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'fake_telefone') then
    alter function public.fake_telefone(bigint) reset search_path;
  end if;
end;
$$;
