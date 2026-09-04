-- Reverte 20260904040000_fix_alunos_no_self_promotion_recursao.sql.
--
-- Restaura a WITH CHECK original de no_self_promotion (subquery inline
-- referenciando a própria tabela alunos) e remove a função auxiliar —
-- reintroduz a recursão de RLS (42P17) em qualquer UPDATE de alunos feito
-- por um usuário authenticated normal.
ALTER POLICY no_self_promotion ON public.alunos
  WITH CHECK (
    (role = 'aluno'::user_role)
    OR (
      (SELECT alunos_1.role FROM alunos alunos_1 WHERE alunos_1.auth_id = auth.uid()) = 'admin'::user_role
    )
  );

DROP FUNCTION IF EXISTS public.role_aluno_atual();
