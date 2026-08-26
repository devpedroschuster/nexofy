-- PED-7: precisa alterar o RETURNS TABLE (novo campo cor_secundaria),
-- o que exige DROP + CREATE (Postgres não permite mudar o shape de saída
-- via CREATE OR REPLACE). Grants são perdidos no DROP — reaplicados abaixo
-- explicitamente para anon/authenticated (mesmo padrão do audit anterior
-- de RPCs SECURITY DEFINER expostas para visitantes não autenticados).

DROP FUNCTION public.estudio_publico(text);

CREATE FUNCTION public.estudio_publico(p_slug text)
 RETURNS TABLE(id uuid, nome text, slug text, whatsapp text, instagram text, maps_url text, maps_embed_url text, segmento text, cor_primaria text, cor_secundaria text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.nome, e.slug, e.whatsapp, e.instagram,
         e.maps_url, e.maps_embed_url, e.segmento, e.cor_primaria, e.cor_secundaria
  from estudios e
  where e.slug = p_slug
    and e.status = 'ativo';
$function$;

grant execute on function public.estudio_publico(text) to anon;
grant execute on function public.estudio_publico(text) to authenticated;
grant execute on function public.estudio_publico(text) to service_role;
