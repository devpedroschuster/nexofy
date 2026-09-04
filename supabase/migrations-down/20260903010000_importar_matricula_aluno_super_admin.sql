-- Reverte 20260903010000_importar_matricula_aluno_super_admin.sql: volta
-- importar_matricula_aluno() a checar só uma linha literal role='admin' em
-- estudio_membros, sem o bypass de eh_super_admin() — reintroduz o bug do
-- PED-122 (super_admin impersonando um estúdio recebe "Acesso negado" ao
-- importar matrículas em lote).
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
