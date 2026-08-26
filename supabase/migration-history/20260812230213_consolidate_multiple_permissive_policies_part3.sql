-- leads: split leads_write_estudio (ALL) para não sobrepor leads_select_estudio (SELECT)
DROP POLICY IF EXISTS "leads_write_estudio" ON public.leads;
CREATE POLICY "leads_insert_estudio" ON public.leads
  FOR INSERT
  WITH CHECK (
    (estudio_id IN (SELECT em.estudio_id FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = ANY (ARRAY['admin'::text,'professor'::text]))))
    OR (EXISTS (SELECT 1 FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = 'super_admin'::text)))
  );
CREATE POLICY "leads_update_estudio" ON public.leads
  FOR UPDATE
  USING (
    (estudio_id IN (SELECT em.estudio_id FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = ANY (ARRAY['admin'::text,'professor'::text]))))
    OR (EXISTS (SELECT 1 FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = 'super_admin'::text)))
  )
  WITH CHECK (
    (estudio_id IN (SELECT em.estudio_id FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = ANY (ARRAY['admin'::text,'professor'::text]))))
    OR (EXISTS (SELECT 1 FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = 'super_admin'::text)))
  );
CREATE POLICY "leads_delete_estudio" ON public.leads
  FOR DELETE
  USING (
    (estudio_id IN (SELECT em.estudio_id FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = ANY (ARRAY['admin'::text,'professor'::text]))))
    OR (EXISTS (SELECT 1 FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = 'super_admin'::text)))
  );

-- mensalidades: merge aluno_select_mensalidades + tenant_select
DROP POLICY IF EXISTS "aluno_select_mensalidades" ON public.mensalidades;
DROP POLICY IF EXISTS "tenant_select" ON public.mensalidades;
CREATE POLICY "tenant_select" ON public.mensalidades
  FOR SELECT
  USING (
    (estudio_id = (select public.estudio_id_atual())) OR (select public.eh_super_admin())
    OR (aluno_id IN (SELECT alunos.id FROM alunos WHERE alunos.auth_id = (select auth.uid())))
  );

-- presencas: split presenca_write_estudio (ALL) para não sobrepor presenca_select_estudio (SELECT)
DROP POLICY IF EXISTS "presenca_write_estudio" ON public.presencas;
CREATE POLICY "presenca_insert_estudio" ON public.presencas
  FOR INSERT
  WITH CHECK (
    (estudio_id IN (SELECT em.estudio_id FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = ANY (ARRAY['admin'::text,'professor'::text]))))
    OR (EXISTS (SELECT 1 FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = 'super_admin'::text)))
  );
CREATE POLICY "presenca_update_estudio" ON public.presencas
  FOR UPDATE
  USING (
    (estudio_id IN (SELECT em.estudio_id FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = ANY (ARRAY['admin'::text,'professor'::text]))))
    OR (EXISTS (SELECT 1 FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = 'super_admin'::text)))
  )
  WITH CHECK (
    (estudio_id IN (SELECT em.estudio_id FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = ANY (ARRAY['admin'::text,'professor'::text]))))
    OR (EXISTS (SELECT 1 FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = 'super_admin'::text)))
  );
CREATE POLICY "presenca_delete_estudio" ON public.presencas
  FOR DELETE
  USING (
    (estudio_id IN (SELECT em.estudio_id FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = ANY (ARRAY['admin'::text,'professor'::text]))))
    OR (EXISTS (SELECT 1 FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = 'super_admin'::text)))
  );

-- professores: merge professor_self_select + tenant_select
DROP POLICY IF EXISTS "professor_self_select" ON public.professores;
DROP POLICY IF EXISTS "tenant_select" ON public.professores;
CREATE POLICY "tenant_select" ON public.professores
  FOR SELECT
  USING (
    (estudio_id = (select public.estudio_id_atual())) OR (select public.eh_super_admin())
    OR (auth_id = (select auth.uid()))
  );

-- repasses_lancamentos: merge professor_self_repasses + tenant_select
DROP POLICY IF EXISTS "professor_self_repasses" ON public.repasses_lancamentos;
DROP POLICY IF EXISTS "tenant_select" ON public.repasses_lancamentos;
CREATE POLICY "tenant_select" ON public.repasses_lancamentos
  FOR SELECT
  USING (
    (estudio_id = (select public.estudio_id_atual())) OR (select public.eh_super_admin())
    OR (professor_id IN (SELECT professores.id FROM professores WHERE professores.auth_id = (select auth.uid())))
  );
