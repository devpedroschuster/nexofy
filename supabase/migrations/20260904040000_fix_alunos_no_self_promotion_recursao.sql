-- Achado investigando o PED-160 (não é o bug do ticket, é um problema
-- estrutural separado, registrado em PED-166): a policy RESTRICTIVE
-- `no_self_promotion` em public.alunos (UPDATE) tem uma subquery que
-- consulta a PRÓPRIA tabela alunos de dentro da sua própria policy:
--
--   with check ((role = 'aluno') OR (
--     (SELECT alunos_1.role FROM alunos alunos_1 WHERE alunos_1.auth_id = auth.uid()) = 'admin'
--   ))
--
-- Isso é o anti-padrão clássico de recursão de RLS: o Postgres detecta
-- que avaliar essa policy exige reabrir a mesma relação (alunos) que já
-- está no meio de ser reescrita pela política do UPDATE em curso, e
-- recusa com "42P17: infinite recursion detected in policy for relation
-- alunos" — independente dos dados da linha (confirmado: acontece mesmo
-- quando o aluno mantém role='aluno', que deveria satisfazer o lado
-- esquerdo do OR sozinho).
--
-- Impacto real: TODO UPDATE em alunos feito por um usuário authenticated
-- normal (não via RPC SECURITY DEFINER) quebra com esse erro —
-- alunosService.alterarStatus (botão Desativar/Reativar) e
-- alunosService.atualizar (editar aluno) fazem exatamente esse tipo de
-- UPDATE direto. Confirmado por dois caminhos independentes: simulação
-- via SQL com JWT de admin faked, e o teste E2E real
-- (reassinatura-sem-duplicidade.spec.js) clicando "Desativar" pela UI de
-- verdade — os dois travam do mesmo jeito.
--
-- Fix: mesmo padrão já usado em eh_admin_do_estudio_atual() (e em toda
-- policy deste repo que precisa checar dado de outra tabela) — mover a
-- subquery pra uma função SECURITY DEFINER. Uma chamada de função não é
-- inlined pelo rewriter de RLS do Postgres do mesmo jeito que uma
-- subquery correlacionada embutida na própria expressão da policy, então
-- não aciona o guard de recursão.
CREATE OR REPLACE FUNCTION public.role_aluno_atual()
 RETURNS user_role
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role FROM alunos WHERE auth_id = auth.uid()
$function$
;

GRANT EXECUTE ON FUNCTION public.role_aluno_atual() TO authenticated;
GRANT EXECUTE ON FUNCTION public.role_aluno_atual() TO service_role;

ALTER POLICY no_self_promotion ON public.alunos
  WITH CHECK ((role = 'aluno'::user_role) OR (public.role_aluno_atual() = 'admin'::user_role));
