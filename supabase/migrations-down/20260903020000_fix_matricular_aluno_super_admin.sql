-- Reverte 20260903020000_fix_matricular_aluno_super_admin.sql: volta
-- matricular_aluno() a checar só uma linha literal role='admin' em
-- estudio_membros, sem o bypass de eh_super_admin() — reintroduz o bug do
-- PED-126 (super_admin impersonando um estúdio recebe "Acesso negado" ao
-- matricular manualmente). Preserva o fix de periodo_fim
-- (20260902140000), que é anterior e independente deste.
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

  insert into mensalidades (aluno_id, plano_id, estudio_id, data_vencimento, periodo_fim, status, descricao, tipo_aula)
  values (p_aluno_id, p_plano_id, p_estudio_id, p_vencimento, p_vencimento, 'pendente', p_descricao, v_tipo_aula);
end;
$function$
;
