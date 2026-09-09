-- supabase/migrations/20260908170000_create_solicitacoes_titular.sql
-- PED-172 (achado de auditoria LGPD): direito de acesso/portabilidade
-- (art. 18 V) era 100% manual (e-mail para contato@nexofy.com.br), sem
-- canal do próprio titular (aluno) nem trilha com SLA. Esta tabela é a
-- trilha/fila das solicitações — o self-service de EXPORTAÇÃO em si roda
-- síncrono na Edge Function `exportar-dados-aluno` (que grava aqui já como
-- 'atendida', só para deixar rastro de quando/por quem foi exportado);
-- EXCLUSÃO fica 'pendente' de propósito — apagar conta é irreversível e
-- pode exigir checar vínculo financeiro/fiscal em aberto, por isso exige
-- ação humana do admin do estúdio dentro do SLA documentado (ver
-- PoliticaPrivacidade.jsx).
create table public.solicitacoes_titular (
  id             uuid primary key default gen_random_uuid(),
  aluno_id       bigint not null references public.alunos(id) on delete cascade,
  estudio_id     uuid not null references public.estudios(id),
  tipo           text not null check (tipo in ('exportacao', 'exclusao')),
  status         text not null default 'pendente' check (status in ('pendente', 'atendida', 'recusada')),
  observacao     text,
  solicitado_por uuid references auth.users(id),
  solicitado_em  timestamptz not null default now(),
  atendido_por   uuid references auth.users(id),
  atendido_em    timestamptz
);

create index idx_solicitacoes_titular_aluno_id on public.solicitacoes_titular(aluno_id);
create index idx_solicitacoes_titular_estudio_status on public.solicitacoes_titular(estudio_id, status);

alter table public.solicitacoes_titular enable row level security;

-- O próprio aluno vê e cria suas solicitações (self-service, art. 18) —
-- checagem via join em alunos.auth_id, já que solicitacoes_titular não tem
-- auth_id direto. Admin/super_admin do estúdio veem e atualizam (marcar
-- atendida/recusada) as do próprio tenant.
create policy aluno_ve_propria_solicitacao on public.solicitacoes_titular
  as permissive for select to public
  using (
    exists (
      select 1 from public.alunos a
      where a.id = solicitacoes_titular.aluno_id
        and a.auth_id = (select auth.uid())
    )
    or (estudio_id = (select public.estudio_id_atual()))
    or (select public.eh_super_admin())
  );

create policy aluno_cria_propria_solicitacao on public.solicitacoes_titular
  as permissive for insert to public
  with check (
    exists (
      select 1 from public.alunos a
      where a.id = solicitacoes_titular.aluno_id
        and a.auth_id = (select auth.uid())
        and a.estudio_id = solicitacoes_titular.estudio_id
    )
    and solicitado_por = (select auth.uid())
  );

create policy admin_atende_solicitacao on public.solicitacoes_titular
  as permissive for update to public
  using (
    (estudio_id = (select public.estudio_id_atual()) and (select public.eh_admin_do_estudio_atual()))
    or (select public.eh_super_admin())
  )
  with check (
    (estudio_id = (select public.estudio_id_atual()) and (select public.eh_admin_do_estudio_atual()))
    or (select public.eh_super_admin())
  );
