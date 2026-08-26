-- 1. Corrige acesso público quebrado: anon precisa de EXECUTE nas funções
--    SECURITY DEFINER usadas pelas policies de SELECT em `estudios` (e por
--    tabelas cuja RLS as referencia). Sem isso, qualquer query anônima
--    contra `estudios` estourava "permission denied for function", em vez
--    de simplesmente retornar 0 linhas. As funções continuam retornando
--    null/false para auth.uid() nulo, então a RLS segue bloqueando linhas
--    normalmente — isto só remove o erro de permissão na chamada da função.
grant execute on function public.estudio_id_atual() to anon;
grant execute on function public.eh_super_admin() to anon;
grant execute on function public.eh_admin_do_estudio_atual() to anon;
grant execute on function public.estudio_ativo_via_override() to anon;

-- 2. RPC pública para a Landing por estúdio listar modalidades reais.
--    Evita abrir uma policy RLS de SELECT ampla em `modalidades`: os
--    grants de coluna nessa tabela já liberam SELECT em taxa_professor/
--    taxa_espaco/taxa_direcao (comissão) para anon, então uma policy por
--    estudio_id exporia esses valores a qualquer request anônimo direto
--    na REST API. Esta função expõe só id/nome/area, e só de estúdios
--    com status = 'ativo'.
create or replace function public.modalidades_publicas(p_estudio_id uuid)
returns table (id uuid, nome text, area text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.nome, m.area
  from modalidades m
  join estudios e on e.id = m.estudio_id
  where m.estudio_id = p_estudio_id
    and e.status = 'ativo'
  order by m.area nulls last, m.nome;
$$;

revoke all on function public.modalidades_publicas(uuid) from public;
grant execute on function public.modalidades_publicas(uuid) to anon, authenticated;

