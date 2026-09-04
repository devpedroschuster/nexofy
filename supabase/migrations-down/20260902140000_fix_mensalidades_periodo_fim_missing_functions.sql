-- Reverte 20260902140000_fix_mensalidades_periodo_fim_missing_functions.sql:
-- volta matricular_aluno() e renovar_plano_aluno() a inserir em mensalidades
-- sem periodo_fim. CUIDADO: mensalidades.periodo_fim é NOT NULL desde
-- cobertura_pagamento_periodo (2026-08-22) — aplicar este down faz as duas
-- functions voltarem a violar essa constraint (todo INSERT falha com "null
-- value in column periodo_fim"), quebrando matrícula e renovação de plano
-- por completo. Só serve pra reverter isoladamente se periodo_fim também
-- deixar de ser NOT NULL nesse mesmo incidente.
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

CREATE OR REPLACE FUNCTION public.renovar_plano_aluno(p_aluno_id bigint, p_plano_id integer, p_data_inicio date, p_data_fim date, p_valor_pago numeric, p_estudio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
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

  update historico_planos
     set status = 'finalizado'
   where aluno_id = p_aluno_id and estudio_id = p_estudio_id and status = 'ativo' and data_fim < current_date;

  insert into historico_planos (aluno_id, plano_id, estudio_id, data_inicio, data_fim, valor_pago, status)
  values (
    p_aluno_id, p_plano_id, p_estudio_id, p_data_inicio, p_data_fim, p_valor_pago,
    case when p_data_inicio > current_date then 'agendado' else 'ativo' end
  );

  update alunos
     set plano_id = p_plano_id, data_fim_plano = p_data_fim
   where id = p_aluno_id and estudio_id = p_estudio_id;

  insert into mensalidades (aluno_id, plano_id, estudio_id, data_vencimento, status)
  values (p_aluno_id, p_plano_id, p_estudio_id, p_data_inicio, 'pendente');
end;
$function$
;
