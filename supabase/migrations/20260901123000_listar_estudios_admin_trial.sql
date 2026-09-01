-- PED-105: expõe trial_ends_at na listagem de estúdios do super_admin,
-- pra alimentar a badge de "dias restantes" em TabelaEstudios.jsx. Muda
-- o shape de RETURNS TABLE -> exige DROP + CREATE (ver
-- RLS_MIGRATION_CHECKLIST.md sobre reaplicar GRANT/REVOKE).
DROP FUNCTION public.listar_estudios_admin(integer, integer, text);

CREATE FUNCTION public.listar_estudios_admin(p_limit integer, p_offset integer, p_busca text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, nome text, slug text, whatsapp text, instagram text, criado_em timestamp with time zone, status text, trial_ends_at timestamp with time zone, total_alunos bigint, total_professores bigint, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not eh_super_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  return query
  select
    e.id, e.nome, e.slug, e.whatsapp, e.instagram,
    e.created_at                     as criado_em,
    e.status,
    e.trial_ends_at,
    coalesce(a.total_alunos, 0)      as total_alunos,
    coalesce(p.total_professores, 0) as total_professores,
    count(*) over ()                 as total_count
  from estudios e
  left join (select estudio_id, count(*) as total_alunos from alunos group by estudio_id) a
    on a.estudio_id = e.id
  left join (select estudio_id, count(*) as total_professores from professores group by estudio_id) p
    on p.estudio_id = e.id
  where p_busca is null
     or e.nome ilike '%' || p_busca || '%'
     or e.slug ilike '%' || p_busca || '%'
  order by e.created_at desc
  limit p_limit offset p_offset;
end;
$function$
;

GRANT EXECUTE ON FUNCTION public.listar_estudios_admin(p_limit integer, p_offset integer, p_busca text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_estudios_admin(p_limit integer, p_offset integer, p_busca text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.listar_estudios_admin(p_limit integer, p_offset integer, p_busca text) FROM public, anon;
