-- supabase/migrations/20260903210000_create_consentimentos.sql
--
-- PED-136: registra o aceite de Termos de Uso / Política de Privacidade
-- no momento da criação da conta, com identificação do titular, timestamp
-- e versão do documento — hoje isso não existia em lugar nenhum (o
-- aceitaTermos do Cadastro.jsx era um useState que morria no unmount).
--
-- Append-only de propósito: sem policy de UPDATE/DELETE. É registro de
-- prova de consentimento (art. 8º §2º LGPD) — alterar ou apagar uma linha
-- depois de criada destruiria o próprio valor probatório do registro. Um
-- reaceite (ex: nova versão do texto) é sempre uma linha NOVA, nunca um
-- update na antiga.

create table if not exists public.consentimentos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  documento   text not null check (documento in ('termos', 'privacidade')),
  versao      text not null,
  aceito_em   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists idx_consentimentos_user_id on public.consentimentos(user_id);

alter table public.consentimentos enable row level security;

create policy "consentimentos_select_own"
  on public.consentimentos
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "consentimentos_insert_own"
  on public.consentimentos
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Caminho e-mail/senha (Cadastro.jsx signUp): a versão aceita viaja em
-- options.data (raw_user_meta_data) e esta trigger grava direto em
-- public.consentimentos no momento em que auth.users ganha a linha —
-- funciona mesmo com o e-mail ainda não confirmado, sem depender de sessão.
-- (Caminho Google: signInWithOAuth não aceita metadata customizada, por
-- isso aquele caminho é resolvido no client, em useAuth.jsx, não aqui.)
create or replace function public.handle_new_user_consentimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.raw_user_meta_data ? 'termos_versao')
     and (new.raw_user_meta_data->>'termos_versao' <> '') then
    insert into public.consentimentos (user_id, documento, versao)
    values (new.id, 'termos', new.raw_user_meta_data->>'termos_versao');
  end if;

  if (new.raw_user_meta_data ? 'privacidade_versao')
     and (new.raw_user_meta_data->>'privacidade_versao' <> '') then
    insert into public.consentimentos (user_id, documento, versao)
    values (new.id, 'privacidade', new.raw_user_meta_data->>'privacidade_versao');
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_consentimento on auth.users;

create trigger on_auth_user_created_consentimento
  after insert on auth.users
  for each row execute function public.handle_new_user_consentimento();

-- Funções em public são auto-expostas pelo PostgREST como RPC
-- (/rest/v1/rpc/handle_new_user_consentimento). Esta função só existe pra
-- ser chamada pelo trigger acima — revogar EXECUTE de public/anon/
-- authenticated não quebra o trigger (triggers rodam com o privilégio do
-- dono da função, não do role da transação que disparou o INSERT), só
-- fecha a superfície pública desnecessária. Mesmo padrão já usado em
-- 20260829201000_revoke_anon_execute_internal_helpers.sql.
revoke execute on function public.handle_new_user_consentimento() from public, anon, authenticated;
