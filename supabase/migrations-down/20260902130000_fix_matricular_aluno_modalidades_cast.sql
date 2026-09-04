-- Reverte 20260902130000_fix_matricular_aluno_modalidades_cast.sql: volta
-- matricular_aluno() ao corpo anterior ao fix de cast (reintroduz o bug
-- 42804 "column is of type uuid[] but expression is of type jsonb" — o
-- atribuição direta `modalidades_selecionadas = p_modalidades` volta a
-- quebrar toda matrícula manual de aluno). Só para reverter especificamente
-- este fix; não mexe no insert de mensalidades (esta migration não tocou
-- nisso).
CREATE OR REPLACE FUNCTION public.matricular_aluno(p_aluno_id bigint, p_plano_id integer, p_modalidades jsonb, p_data_inicio date, p_data_fim date, p_valor_pago numeric, p_vencimento date, p_descricao text, p_estudio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tipo_aula text;
  v_admin_ok boolean;
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

  if not exists (select 1 from planos where id = p_plano_id and estudio_id = p_estudio_id) then
    raise exception 'Plano não pertence a este estúdio.';
  end if;

  select case when is_plano_livre then 'plano_livre' else 'regular' end
    into v_tipo_aula
    from planos where id = p_plano_id;

  update alunos
     set plano_id = p_plano_id,
         modalidades_selecionadas = p_modalidades,
         ativo = true,
         data_inicio_plano = p_data_inicio,
         data_fim_plano = p_data_fim
   where id = p_aluno_id and estudio_id = p_estudio_id;

  update historico_planos
     set status = 'finalizado'
   where aluno_id = p_aluno_id and estudio_id = p_estudio_id and status = 'ativo';

  insert into historico_planos (aluno_id, plano_id, estudio_id, data_inicio, data_fim, status, valor_pago)
  values (p_aluno_id, p_plano_id, p_estudio_id, p_data_inicio, p_data_fim, 'ativo', p_valor_pago);

  insert into mensalidades (aluno_id, plano_id, estudio_id, data_vencimento, status, descricao, tipo_aula)
  values (p_aluno_id, p_plano_id, p_estudio_id, p_vencimento, 'pendente', p_descricao, v_tipo_aula);
end;
$function$
;
