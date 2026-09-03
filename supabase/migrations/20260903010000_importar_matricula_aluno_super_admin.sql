-- PED-122: um super_admin impersonando um estúdio já consegue criar os
-- alunos durante o import (a RLS de INSERT em alunos usa
-- eh_admin_do_estudio_atual(), que aceita eh_super_admin()), mas a
-- matrícula em plano falhava com "Acesso negado" pra cada linha —
-- importar_matricula_aluno só aceitava uma linha literal role='admin' em
-- estudio_membros pro estúdio impersonado, sem o mesmo bypass de
-- super_admin já usado no resto do app. Sem limite de linhas nem
-- cancelamento (achado separado), isso amplificava de "1 toast de erro"
-- pra "N linhas reportadas como puladas" no resumo do import.
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
