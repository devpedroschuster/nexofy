-- supabase/migrations/20260928130000_fix_rls_recursao_agenda_modalidades.sql
--
-- HOTFIX — regressão introduzida por 20260923150000 (PED-296).
--
-- As policies tenant_select de `agenda` e `modalidades` passaram a se
-- referenciar mutuamente por subquery: agenda → modalidades (modalidade_id
-- IN (SELECT ... FROM modalidades)) e modalidades → agenda (id IN (SELECT
-- ... FROM agenda)). Com RLS ativo, cada subquery reaplica a policy da
-- outra tabela e o Postgres aborta com
--   ERROR 42P17: infinite recursion detected in policy for relation "modalidades"
-- em QUALQUER leitura dessas tabelas por usuário autenticado — inclusive
-- admin, porque a recursão é detectada ao expandir a policy, antes de
-- avaliar qual ramo do OR é verdadeiro. Por tabela:
--   - agenda, modalidades: SELECT falha.
--   - alunos: a policy consulta modalidades/agenda → falha no SELECT e em
--     todo UPDATE/DELETE (que também aplicam a policy de SELECT).
--   - presencas, agenda_fixa, agenda_excecoes: as policies consultam agenda
--     → falham.
--
-- A validação do PED-296 avaliou os predicados como role `postgres`, que
-- ignora RLS, por isso o ciclo passou despercebido. Esta migration foi
-- validada com `set local role authenticated` (RLS real).
--
-- Correção: os ramos "professor" leem os IDs por funções SECURITY DEFINER
-- (sem RLS), que devolvem somente IDs ligados ao próprio usuário logado
-- (professores.auth_id = auth.uid()) — padrão recomendado pelo Supabase para
-- quebrar recursão de RLS. A semântica de acesso é a mesma do PED-296.

create or replace function public.professor_ids_do_usuario_atual()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.professores p where p.auth_id = auth.uid()
$$;

create or replace function public.modalidade_ids_do_professor_atual()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.id from public.modalidades m
  where m.professor_id in (select p.id from public.professores p where p.auth_id = auth.uid())
$$;

create or replace function public.modalidade_ids_em_aulas_do_professor_atual()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.modalidade_id from public.agenda a
  where a.modalidade_id is not null
    and a.professor_id in (select p.id from public.professores p where p.auth_id = auth.uid())
$$;

revoke execute on function public.professor_ids_do_usuario_atual() from public, anon;
revoke execute on function public.modalidade_ids_do_professor_atual() from public, anon;
revoke execute on function public.modalidade_ids_em_aulas_do_professor_atual() from public, anon;
grant execute on function public.professor_ids_do_usuario_atual() to authenticated;
grant execute on function public.modalidade_ids_do_professor_atual() to authenticated;
grant execute on function public.modalidade_ids_em_aulas_do_professor_atual() to authenticated;

drop policy tenant_select on public.agenda;
create policy tenant_select on public.agenda
  as permissive for select to public
  using (
    ((estudio_id = public.estudio_id_atual()) and public.eh_admin_do_estudio_atual())
    or (public.eh_super_admin() and estudio_id = public.estudio_ativo_via_override())
    or professor_id in (select public.professor_ids_do_usuario_atual())
    or modalidade_id in (select public.modalidade_ids_do_professor_atual())
  );

drop policy tenant_select on public.modalidades;
create policy tenant_select on public.modalidades
  as permissive for select to public
  using (
    ((estudio_id = public.estudio_id_atual()) and public.eh_admin_do_estudio_atual())
    or (public.eh_super_admin() and estudio_id = public.estudio_ativo_via_override())
    or professor_id in (select public.professor_ids_do_usuario_atual())
    or id in (select public.modalidade_ids_em_aulas_do_professor_atual())
  );

drop policy tenant_select on public.alunos;
create policy tenant_select on public.alunos
  as permissive for select to public
  using (
    ((estudio_id = public.estudio_id_atual()) and public.eh_admin_do_estudio_atual())
    or public.eh_super_admin()
    or auth_id = auth.uid()
    or modalidades_selecionadas && array(
      select public.modalidade_ids_do_professor_atual()
      union
      select public.modalidade_ids_em_aulas_do_professor_atual()
    )
  );
