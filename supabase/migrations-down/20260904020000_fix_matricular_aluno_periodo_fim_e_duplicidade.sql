-- Reverte 20260904020000_fix_matricular_aluno_periodo_fim_e_duplicidade.sql.
--
-- Restaura exatamente o corpo confirmado via pg_get_functiondef() como
-- REALMENTE em execução em staging e produção antes desta migration —
-- ou seja, reintroduz os dois bugs corrigidos por ela: o INSERT em
-- mensalidades sem periodo_fim (volta a falhar com "null value in column
-- periodo_fim", NOT NULL desde cobertura_pagamento_periodo) e a falta de
-- guard contra reassinatura no mesmo mês gerando mensalidade duplicada
-- (PED-160). Só use isto para reverter um incidente causado pela "up" —
-- o estado restaurado aqui já era o bug, não um estado saudável.
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

  select
    public.eh_super_admin()
    or exists (
      select 1 from estudio_membros
      where user_id = auth.uid() and estudio_id = p_estudio_id and role = 'admin'
    )
  into v_admin_ok;

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
         modalidades_selecionadas = (
           select coalesce(array_agg(m::uuid), '{}'::uuid[])
           from jsonb_array_elements_text(coalesce(p_modalidades, '[]'::jsonb)) as m
         ),
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
