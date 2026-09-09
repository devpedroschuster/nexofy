-- supabase/migrations/20260908150000_create_audit_log.sql
--
-- PED-174 (achado de auditoria LGPD): não existia nenhuma tabela de audit
-- trail genérica. O único registro histórico de acesso era
-- `impersonation_sessions` (quem, qual estúdio, período) — mas não logava
-- O QUE foi lido/alterado durante a sessão. Isso compromete a capacidade
-- de responder a um incidente de segurança (art. 48) e de comprovar
-- accountability (art. 6º X), em especial quando um super_admin acessa
-- dados de um tenant via impersonation (`set_estudio_override`).
--
-- Escopo mínimo pedido pelo achado: trilha (quem, o quê, quando) nas
-- tabelas que guardam dado pessoal sensível/financeiro — `alunos` e
-- `mensalidades` — mais o sinalizador de que a alteração ocorreu durante
-- impersonation.
--
-- Guarda o snapshot da linha inteira (to_jsonb(old)/to_jsonb(new)) em vez
-- de só um diff de campos — mais simples, e essas duas tabelas não têm
-- volume de escrita alto o suficiente pra o custo de armazenamento
-- justificar um diff computado. Trade-off aceito: `dados_antigos`/
-- `dados_novos` guardam PII em texto — por isso a rotina de expurgo
-- (20260908160000_extend_expurgo_auth_storage_cleanup.sql) também redige
-- essas colunas quando o estúdio é anonimizado, não só as tabelas de
-- origem.
create table public.audit_log (
  id                bigint generated always as identity primary key,
  estudio_id        uuid references public.estudios(id),
  tabela            text not null,
  operacao          text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  registro_id       text not null,
  dados_antigos     jsonb,
  dados_novos       jsonb,
  alterado_por      uuid references auth.users(id),
  via_impersonation boolean not null default false,
  criado_em         timestamptz not null default now()
);

create index idx_audit_log_estudio_id on public.audit_log(estudio_id);
create index idx_audit_log_tabela_registro on public.audit_log(tabela, registro_id);
create index idx_audit_log_criado_em on public.audit_log(criado_em);

alter table public.audit_log enable row level security;

-- Só super_admin lê (é trilha de accountability interna, não dado que o
-- próprio estúdio precisa ver). Sem policy de insert/update/delete para
-- authenticated/anon — a única via de escrita é a trigger abaixo, que roda
-- SECURITY DEFINER (contorna RLS via privilégio do dono da função, mesmo
-- padrão já usado em set_cancelado_em_estudios/bloquear_dados_sensiveis_
-- menor_sem_consentimento).
create policy super_admin_le_audit_log on public.audit_log
  as permissive for select to public
  using ((select public.eh_super_admin()));

-- Função de trigger genérica, reaproveitada por alunos e mensalidades via
-- TG_TABLE_NAME/TG_OP. `via_impersonation` é true quando quem está
-- alterando (auth.uid(), que continua sendo o ID real do super_admin
-- durante impersonation — set_estudio_override nunca troca o JWT) tem uma
-- sessão de impersonation ativa para o MESMO estudio_id da linha alterada.
create or replace function public.registrar_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estudio_id uuid;
  v_registro_id text;
  v_via_impersonation boolean;
begin
  if tg_op = 'DELETE' then
    v_estudio_id := old.estudio_id;
    v_registro_id := old.id::text;
  else
    v_estudio_id := new.estudio_id;
    v_registro_id := new.id::text;
  end if;

  select exists (
    select 1 from public.impersonation_sessions s
    where s.user_id = auth.uid()
      and s.estudio_id = v_estudio_id
      and s.expira_em > now()
  ) into v_via_impersonation;

  insert into public.audit_log (
    estudio_id, tabela, operacao, registro_id,
    dados_antigos, dados_novos, alterado_por, via_impersonation
  ) values (
    v_estudio_id,
    tg_table_name,
    tg_op,
    v_registro_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end,
    auth.uid(),
    coalesce(v_via_impersonation, false)
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.registrar_audit_log()
  from public, anon, authenticated;

drop trigger if exists trg_audit_log_alunos on public.alunos;
create trigger trg_audit_log_alunos
  after insert or update or delete on public.alunos
  for each row execute function public.registrar_audit_log();

drop trigger if exists trg_audit_log_mensalidades on public.mensalidades;
create trigger trg_audit_log_mensalidades
  after insert or update or delete on public.mensalidades
  for each row execute function public.registrar_audit_log();
