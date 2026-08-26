-- leads
ALTER POLICY leads_write_estudio ON public.leads
  USING (
    (estudio_id IN (SELECT em.estudio_id FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = ANY (ARRAY['admin'::text,'professor'::text]))))
    OR (EXISTS (SELECT 1 FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = 'super_admin'::text)))
  )
  WITH CHECK (
    (estudio_id IN (SELECT em.estudio_id FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = ANY (ARRAY['admin'::text,'professor'::text]))))
    OR (EXISTS (SELECT 1 FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = 'super_admin'::text)))
  );

ALTER POLICY leads_select_estudio ON public.leads
  USING (
    (estudio_id IN (SELECT em.estudio_id FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = ANY (ARRAY['admin'::text,'professor'::text]))))
    OR (EXISTS (SELECT 1 FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = 'super_admin'::text)))
  );

-- presencas
ALTER POLICY presenca_write_estudio ON public.presencas
  USING (
    (estudio_id IN (SELECT em.estudio_id FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = ANY (ARRAY['admin'::text,'professor'::text]))))
    OR (EXISTS (SELECT 1 FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = 'super_admin'::text)))
  )
  WITH CHECK (
    (estudio_id IN (SELECT em.estudio_id FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = ANY (ARRAY['admin'::text,'professor'::text]))))
    OR (EXISTS (SELECT 1 FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = 'super_admin'::text)))
  );

ALTER POLICY presenca_select_estudio ON public.presencas
  USING (
    (estudio_id IN (SELECT em.estudio_id FROM estudio_membros em WHERE (em.user_id = (select auth.uid()))))
    OR (EXISTS (SELECT 1 FROM estudio_membros em WHERE (em.user_id = (select auth.uid())) AND (em.role = 'super_admin'::text)))
  );
