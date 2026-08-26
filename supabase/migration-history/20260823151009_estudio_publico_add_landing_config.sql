DROP FUNCTION public.estudio_publico(text);

CREATE FUNCTION public.estudio_publico(p_slug text)
RETURNS TABLE(id uuid, nome text, slug text, whatsapp text, instagram text,
              maps_url text, maps_embed_url text, segmento text,
              cor_primaria text, cor_secundaria text, landing_config jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT e.id, e.nome, e.slug, e.whatsapp, e.instagram,
         e.maps_url, e.maps_embed_url, e.segmento, e.cor_primaria, e.cor_secundaria,
         e.landing_config
  FROM estudios e
  WHERE e.slug = p_slug AND e.status = 'ativo';
$$;

GRANT EXECUTE ON FUNCTION public.estudio_publico(text) TO anon, authenticated, PUBLIC;
