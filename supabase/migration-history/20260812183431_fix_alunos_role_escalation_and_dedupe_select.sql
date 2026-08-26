-- Problema: aluno_update_proprio (PERMISSIVE) não tem WITH CHECK próprio, então herda o USING
-- (auth_id = auth.uid()) como WITH CHECK. Como políticas PERMISSIVE se combinam com OR,
-- isso permite que o aluno satisfaça o WITH CHECK sem passar pela regra de no_self_promotion,
-- possibilitando auto-promoção de role.

-- 1) Remove as 3 policies de UPDATE problemáticas
DROP POLICY IF EXISTS "aluno_update_proprio" ON public.alunos;
DROP POLICY IF EXISTS "no_self_promotion" ON public.alunos;
DROP POLICY IF EXISTS "tenant_update" ON public.alunos;

-- 2) Recria como UMA policy permissiva de self-update (com o mesmo escopo de admin/tenant)
--    e UMA policy RESTRICTIVE que se aplica sempre (AND, não OR) bloqueando troca de role
--    exceto por admin do estúdio.
CREATE POLICY "tenant_update" ON public.alunos
  FOR UPDATE
  USING ((estudio_id = (select public.estudio_id_atual())) AND public.eh_admin_do_estudio_atual())
  WITH CHECK ((estudio_id = (select public.estudio_id_atual())) AND public.eh_admin_do_estudio_atual());

CREATE POLICY "aluno_update_proprio" ON public.alunos
  FOR UPDATE
  USING (auth_id = (select auth.uid()))
  WITH CHECK (auth_id = (select auth.uid()));

CREATE POLICY "no_self_promotion" ON public.alunos
  AS RESTRICTIVE
  FOR UPDATE
  USING (true)
  WITH CHECK (
    (role = 'aluno'::user_role)
    OR (
      (select alunos_1.role from public.alunos alunos_1 where alunos_1.auth_id = (select auth.uid())) = 'admin'::user_role
    )
  );

-- 3) Dedupe: 3 policies de SELECT idênticas (auth_id = auth.uid()) -> mantém 1
DROP POLICY IF EXISTS "Alunos veem apenas próprio perfil" ON public.alunos;
DROP POLICY IF EXISTS "aluno_select_proprio" ON public.alunos;
-- mantém "aluno_self_select"

