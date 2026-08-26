-- CRÍTICO: excluir_aula_cascata era SECURITY DEFINER sem NENHUMA checagem de que o
-- chamador pertence ao estudio_id informado. Qualquer usuário autenticado podia apagar
-- aula/presencas/leads/agenda_fixa de QUALQUER estúdio só passando o p_estudio_id de outro.
CREATE OR REPLACE FUNCTION public.excluir_aula_cascata(p_aula_id bigint, p_estudio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (
    (select public.estudio_id_atual()) = p_estudio_id
    and public.eh_admin_do_estudio_atual()
  ) and not (select public.eh_super_admin()) then
    raise exception 'Acesso negado: usuário não é admin deste estúdio.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from agenda where id = p_aula_id and estudio_id = p_estudio_id
  ) then
    raise exception 'Aula não encontrada neste estúdio.';
  end if;

  delete from agenda_fixa
    where aula_id = p_aula_id;

  delete from presencas
    where aula_id = p_aula_id
      and estudio_id = p_estudio_id;

  delete from leads
    where aula_id = p_aula_id
      and estudio_id = p_estudio_id;

  delete from agenda
    where id = p_aula_id
      and estudio_id = p_estudio_id;
end;
$function$;
