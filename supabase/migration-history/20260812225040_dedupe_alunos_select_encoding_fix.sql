DO $$
DECLARE
  pname text;
BEGIN
  SELECT policyname INTO pname
  FROM pg_policies
  WHERE schemaname='public' AND tablename='alunos' AND cmd='SELECT'
    AND policyname NOT IN ('tenant_select','aluno_self_select');

  IF pname IS NOT NULL THEN
    EXECUTE format('DROP POLICY %I ON public.alunos', pname);
  END IF;
END $$;
