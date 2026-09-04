-- Reverte 20260903030000_fix_renovar_plano_aluno_super_admin.sql: volta
-- renovar_plano_aluno() a checar só uma linha literal role='admin' em
-- estudio_membros, sem o bypass de eh_super_admin() — reintroduz o bug do
-- PED-127 (super_admin impersonando um estúdio recebe "Acesso negado" ao
-- confirmar renovação de plano). Preserva o fix de periodo_fim
-- (20260902140000), que é anterior e independente deste.
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

  insert into mensalidades (aluno_id, plano_id, estudio_id, data_vencimento, periodo_fim, status)
  values (p_aluno_id, p_plano_id, p_estudio_id, p_data_inicio, p_data_inicio, 'pendente');
end;
$function$
;
