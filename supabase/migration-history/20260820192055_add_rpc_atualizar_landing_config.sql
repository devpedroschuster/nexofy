-- PED-9/PED-10: landing_config é um jsonb único compartilhado por vários
-- campos (headline, subheadline, imagem_capa_url, sobre_texto). Um
-- read-then-write no client (buscar, mesclar em JS, salvar de volta) tem
-- risco de TOCTOU se dois saves ocorrerem em paralelo (ex: upload de capa
-- rodando enquanto o admin edita o headline em outra aba) — o último a
-- salvar apagaria a mudança do outro. Esta RPC faz o merge atomicamente
-- no Postgres via `||`, então cada chamada só toca a chave que enviou.
--
-- SECURITY INVOKER (não DEFINER): a autorização já é 100% coberta pela RLS
-- existente de UPDATE em estudios (tenant: update proprio estudio), então
-- não precisa nem deve rodar com privilégio elevado.
create or replace function public.atualizar_landing_config(p_estudio_id uuid, p_patch jsonb)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  update estudios
  set landing_config = landing_config || p_patch
  where id = p_estudio_id
  returning landing_config;
$$;

comment on function public.atualizar_landing_config(uuid, jsonb) is
  'Faz merge atômico (jsonb ||) de um patch parcial em estudios.landing_config, evitando race condition de read-then-write entre features que editam chaves diferentes do mesmo jsonb (upload de capa, formulário de headline/subheadline/sobre_texto). SECURITY INVOKER: autorização via RLS de estudios, sem elevação de privilégio.';

grant execute on function public.atualizar_landing_config(uuid, jsonb) to authenticated;
