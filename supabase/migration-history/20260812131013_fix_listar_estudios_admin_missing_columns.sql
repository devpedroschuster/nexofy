create or replace function public.listar_estudios_admin(p_limit integer, p_offset integer, p_busca text default null::text)
returns table(id uuid, nome text, slug text, whatsapp text, instagram text, criado_em timestamp with time zone, status text, total_alunos bigint, total_professores bigint, total_count bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not eh_super_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  return query
  select
    e.id, e.nome, e.slug, e.whatsapp, e.instagram,
    e.created_at                     as criado_em,
    'ativo'::text                    as status,
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
$function$;
