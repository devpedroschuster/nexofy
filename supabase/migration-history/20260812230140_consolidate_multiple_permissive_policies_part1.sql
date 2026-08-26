-- agenda: merge tenant_select + professor_self_agenda em uma única policy de SELECT
DROP POLICY IF EXISTS "tenant_select" ON public.agenda;
DROP POLICY IF EXISTS "professor_self_agenda" ON public.agenda;
CREATE POLICY "tenant_select" ON public.agenda
  FOR SELECT
  USING (
    (estudio_id = (select public.estudio_id_atual())) OR (select public.eh_super_admin())
    OR (professor_id IN (SELECT professores.id FROM professores WHERE professores.auth_id = (select auth.uid())))
    OR (modalidade_id IN (SELECT modalidades.id FROM modalidades WHERE modalidades.professor_id IN (SELECT professores.id FROM professores WHERE professores.auth_id = (select auth.uid()))))
  );

-- agenda_excecoes: tenant_all_write (ALL) sobrepunha tenant_select (SELECT).
-- Split em INSERT/UPDATE/DELETE, mantendo tenant_select isolada.
DROP POLICY IF EXISTS "tenant_all_write" ON public.agenda_excecoes;
CREATE POLICY "tenant_insert" ON public.agenda_excecoes
  FOR INSERT
  WITH CHECK ((aula_id IN (SELECT agenda.id FROM agenda WHERE agenda.estudio_id = (select public.estudio_id_atual()))) AND (select public.eh_admin_do_estudio_atual()));
CREATE POLICY "tenant_update" ON public.agenda_excecoes
  FOR UPDATE
  USING ((aula_id IN (SELECT agenda.id FROM agenda WHERE agenda.estudio_id = (select public.estudio_id_atual()))) AND (select public.eh_admin_do_estudio_atual()))
  WITH CHECK ((aula_id IN (SELECT agenda.id FROM agenda WHERE agenda.estudio_id = (select public.estudio_id_atual()))) AND (select public.eh_admin_do_estudio_atual()));
CREATE POLICY "tenant_delete" ON public.agenda_excecoes
  FOR DELETE
  USING ((aula_id IN (SELECT agenda.id FROM agenda WHERE agenda.estudio_id = (select public.estudio_id_atual()))) AND (select public.eh_admin_do_estudio_atual()));
ALTER POLICY tenant_select ON public.agenda_excecoes
  USING ((aula_id IN (SELECT agenda.id FROM agenda WHERE agenda.estudio_id = (select public.estudio_id_atual()))) OR (select public.eh_super_admin()));

-- alunos: merge SELECT (aluno_self_select + tenant_select) e merge UPDATE (aluno_update_proprio + tenant_update)
DROP POLICY IF EXISTS "aluno_self_select" ON public.alunos;
DROP POLICY IF EXISTS "tenant_select" ON public.alunos;
CREATE POLICY "tenant_select" ON public.alunos
  FOR SELECT
  USING (
    (estudio_id = (select public.estudio_id_atual())) OR (select public.eh_super_admin())
    OR (auth_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "aluno_update_proprio" ON public.alunos;
DROP POLICY IF EXISTS "tenant_update" ON public.alunos;
CREATE POLICY "tenant_update" ON public.alunos
  FOR UPDATE
  USING (
    ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()))
    OR (auth_id = (select auth.uid()))
  )
  WITH CHECK (
    ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()))
    OR (auth_id = (select auth.uid()))
  );
-- (no_self_promotion continua RESTRICTIVE, então a trava de role permanece ativa independente dessa fusão)
