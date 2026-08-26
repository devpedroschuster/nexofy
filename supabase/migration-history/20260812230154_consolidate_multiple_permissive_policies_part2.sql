-- espacos: split espacos_admin_all (ALL) para não sobrepor espacos_select (SELECT)
DROP POLICY IF EXISTS "espacos_admin_all" ON public.espacos;
CREATE POLICY "espacos_insert" ON public.espacos
  FOR INSERT
  WITH CHECK ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()));
CREATE POLICY "espacos_update" ON public.espacos
  FOR UPDATE
  USING ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()))
  WITH CHECK ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()));
CREATE POLICY "espacos_delete" ON public.espacos
  FOR DELETE
  USING ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()));
ALTER POLICY espacos_select ON public.espacos
  USING (estudio_id = (select public.estudio_id_atual()));

-- estudios: split "super_admin: acesso total" (ALL) para não sobrepor SELECT/UPDATE
DROP POLICY IF EXISTS "super_admin: acesso total a estudios" ON public.estudios;
CREATE POLICY "super_admin_insert" ON public.estudios
  FOR INSERT
  WITH CHECK ((select public.eh_super_admin()));
CREATE POLICY "super_admin_delete" ON public.estudios
  FOR DELETE
  USING ((select public.eh_super_admin()));
ALTER POLICY "tenant: select proprio estudio" ON public.estudios
  USING ((id = (select public.estudio_id_atual())) OR (select public.eh_super_admin()));
ALTER POLICY "tenant: update proprio estudio" ON public.estudios
  USING ((id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()))
  ;
-- garante que super admin ainda pode dar update (mesclado na policy de tenant update)
DROP POLICY IF EXISTS "tenant: update proprio estudio" ON public.estudios;
CREATE POLICY "tenant: update proprio estudio" ON public.estudios
  FOR UPDATE
  USING (((id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual())) OR (select public.eh_super_admin()))
  WITH CHECK (((id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual())) OR (select public.eh_super_admin()));

-- fechamento_comissoes: merge professor_self_fechamento + tenant_select
DROP POLICY IF EXISTS "professor_self_fechamento" ON public.fechamento_comissoes;
DROP POLICY IF EXISTS "tenant_select" ON public.fechamento_comissoes;
CREATE POLICY "tenant_select" ON public.fechamento_comissoes
  FOR SELECT
  USING (
    (professor_id IN (SELECT professores.id FROM professores WHERE professores.estudio_id = (select public.estudio_id_atual())))
    OR (select public.eh_super_admin())
    OR (professor_id IN (SELECT professores.id FROM professores WHERE professores.auth_id = (select auth.uid())))
  );

-- historico_planos: merge aluno_select_hist_planos + tenant_select
DROP POLICY IF EXISTS "aluno_select_hist_planos" ON public.historico_planos;
DROP POLICY IF EXISTS "tenant_select" ON public.historico_planos;
CREATE POLICY "tenant_select" ON public.historico_planos
  FOR SELECT
  USING (
    (estudio_id = (select public.estudio_id_atual())) OR (select public.eh_super_admin())
    OR (aluno_id IN (SELECT alunos.id FROM alunos WHERE alunos.auth_id = (select auth.uid())))
  );
