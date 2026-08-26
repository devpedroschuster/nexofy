-- Mesmo problema de estudios/modalidades: `planos` tem colunas de comissão
-- (comissao_professor/espaco/diretor) que não podem ficar acessíveis via
-- policy RLS ampla por estudio_id. RPC expõe só o que a Landing pública
-- já usa hoje (mesmas colunas de usePlanosPublicos.js).
create or replace function public.planos_publicos(p_estudio_id uuid)
returns table (
  id integer,
  nome text,
  preco numeric,
  duracao_meses integer,
  frequencia_semanal text,
  regras_acesso jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nome, p.preco, p.duracao_meses, p.frequencia_semanal, p.regras_acesso
  from planos p
  join estudios e on e.id = p.estudio_id
  where p.estudio_id = p_estudio_id
    and e.status = 'ativo'
  order by p.preco asc;
$$;

revoke all on function public.planos_publicos(uuid) from public;
grant execute on function public.planos_publicos(uuid) to anon, authenticated;

