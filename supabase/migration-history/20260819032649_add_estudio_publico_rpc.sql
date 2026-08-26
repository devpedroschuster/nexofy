-- `estudios` não tem (e não deve ter) uma policy RLS pública de SELECT —
-- a tabela guarda credenciais sensíveis (asaas_api_key, asaas_account_id
-- etc). Em vez de abrir a tabela toda, esta função expõe só as colunas
-- necessárias pra Landing pública, e só de estúdios ativos.
create or replace function public.estudio_publico(p_slug text)
returns table (
  id uuid,
  nome text,
  slug text,
  whatsapp text,
  instagram text,
  maps_url text,
  maps_embed_url text,
  segmento text,
  cor_primaria text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.nome, e.slug, e.whatsapp, e.instagram,
         e.maps_url, e.maps_embed_url, e.segmento, e.cor_primaria
  from estudios e
  where e.slug = p_slug
    and e.status = 'ativo';
$$;

revoke all on function public.estudio_publico(text) from public;
grant execute on function public.estudio_publico(text) to anon, authenticated;

