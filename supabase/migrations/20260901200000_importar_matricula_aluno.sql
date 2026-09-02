-- PED-106: matricula um aluno importado num plano SEM gerar mensalidade —
-- ao contrário de matricular_aluno (usado pelo cadastro manual), que
-- sempre insere uma linha em mensalidades. Function nova e isolada em vez
-- de alterar matricular_aluno: o cadastro manual continua exatamente como
-- está, sem nenhum risco de regressão por causa desta feature.
--
-- Alunos importados de uma planilha já têm histórico de pagamento próprio
-- fora do Nexofy — gerar uma cobrança pendente nova em massa no momento do
-- import seria enganoso. O plano fica vinculado ao aluno (alunos.plano_id,
-- historico_planos) e o ciclo de cobrança normal (gerar-mensalidades)
-- assume a partir do próximo mês.
--
-- Não mexe em modalidades_selecionadas (decisão do design: import não
-- mapeia modalidade) — a coluna fica no valor default ('{}').
CREATE OR REPLACE FUNCTION public.importar_matricula_aluno(p_aluno_id bigint, p_plano_id integer, p_data_inicio date, p_data_fim date, p_estudio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin_ok boolean;
  v_preco numeric;
begin
  if p_estudio_id is null then
    raise exception 'p_estudio_id é obrigatório.';
  end if;

  select exists (
    select 1 from estudio_membros
    where user_id = auth.uid() and estudio_id = p_estudio_id and role = 'admin'
  ) into v_admin_ok;

  if not v_admin_ok then
    raise exception 'Acesso negado: você não é admin deste estúdio.';
  end if;

  if not exists (select 1 from alunos where id = p_aluno_id and estudio_id = p_estudio_id) then
    raise exception 'Aluno não pertence a este estúdio.';
  end if;

  select preco into v_preco from planos where id = p_plano_id and estudio_id = p_estudio_id;

  if v_preco is null then
    raise exception 'Plano não pertence a este estúdio.';
  end if;

  update alunos
     set plano_id = p_plano_id,
         ativo = true,
         data_inicio_plano = p_data_inicio,
         data_fim_plano = p_data_fim
   where id = p_aluno_id and estudio_id = p_estudio_id;

  update historico_planos
     set status = 'finalizado'
   where aluno_id = p_aluno_id and estudio_id = p_estudio_id and status = 'ativo';

  insert into historico_planos (aluno_id, plano_id, estudio_id, data_inicio, data_fim, status, valor_pago)
  values (p_aluno_id, p_plano_id, p_estudio_id, p_data_inicio, p_data_fim, 'ativo', v_preco);
end;
$function$
;

GRANT EXECUTE ON FUNCTION public.importar_matricula_aluno(p_aluno_id bigint, p_plano_id integer, p_data_inicio date, p_data_fim date, p_estudio_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importar_matricula_aluno(p_aluno_id bigint, p_plano_id integer, p_data_inicio date, p_data_fim date, p_estudio_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.importar_matricula_aluno(p_aluno_id bigint, p_plano_id integer, p_data_inicio date, p_data_fim date, p_estudio_id uuid) FROM public, anon;
