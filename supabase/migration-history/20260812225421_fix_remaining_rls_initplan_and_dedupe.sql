-- agenda
ALTER POLICY professor_self_agenda ON public.agenda
  USING (
    (professor_id IN (SELECT professores.id FROM professores WHERE professores.auth_id = (select auth.uid())))
    OR (modalidade_id IN (SELECT modalidades.id FROM modalidades WHERE modalidades.professor_id IN (SELECT professores.id FROM professores WHERE professores.auth_id = (select auth.uid()))))
  );

-- alunos
ALTER POLICY aluno_self_select ON public.alunos USING (auth_id = (select auth.uid()));

-- historico_planos
ALTER POLICY aluno_select_hist_planos ON public.historico_planos
  USING (aluno_id IN (SELECT alunos.id FROM alunos WHERE alunos.auth_id = (select auth.uid())));

-- mensalidades: dedupe (mantém aluno_select_mensalidades, remove a duplicata) + fix initplan
DROP POLICY IF EXISTS "aluno_self_mensalidades" ON public.mensalidades;
ALTER POLICY aluno_select_mensalidades ON public.mensalidades
  USING (aluno_id IN (SELECT alunos.id FROM alunos WHERE alunos.auth_id = (select auth.uid())));

-- repasses_lancamentos: dedupe (mantém professor_self_repasses, remove a duplicata) + fix initplan
DROP POLICY IF EXISTS "repasses_professor_select_proprio" ON public.repasses_lancamentos;
ALTER POLICY professor_self_repasses ON public.repasses_lancamentos
  USING (professor_id IN (SELECT professores.id FROM professores WHERE professores.auth_id = (select auth.uid())));
