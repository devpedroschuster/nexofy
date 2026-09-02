-- PED-116: estudio_id_atual() e verificar_status_estudio() podiam divergir
-- para um usuario com vinculo (estudio_membros) em mais de um estudio:
--
--   - estudio_id_atual() (usada por toda RLS policy) escolhia um vinculo
--     nao-bloqueado ARBITRARIO (limit 1 sem order by).
--   - verificar_status_estudio() (usada pelo frontend pra decidir se mostra
--     a tela de bloqueio) sempre escolhia o vinculo MAIS ANTIGO
--     (order by em.created_at asc), independente de estar bloqueado ou nao.
--
-- Resultado possivel: RLS liberava acesso via um estudio saudavel enquanto
-- a UI redirecionava pro bloqueio baseada em outro estudio (ou o inverso).
--
-- Fix: as duas functions agora usam o MESMO criterio de desempate --
-- preferir o vinculo nao-bloqueado mais antigo; so cair pro vinculo
-- bloqueado mais antigo quando NENHUM vinculo estiver saudavel (sem isso a
-- tela de bloqueio nao teria o que reportar). Como estudio_id_atual() so
-- retorna vinculos nao-bloqueados (o filtro `where` ja exige status ativo e
-- trial nao expirado), adicionar `order by em.created_at asc` a ela sozinho
-- ja a torna deterministica e alinhada com o mesmo desempate.

CREATE OR REPLACE FUNCTION public.estudio_id_atual()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    public.estudio_ativo_via_override(),
    (
      select em.estudio_id
      from estudio_membros em
      join estudios e on e.id = em.estudio_id
      where em.user_id = auth.uid()
        and e.status = 'ativo'
        and (e.trial_ends_at is null or e.trial_ends_at > now())
      order by em.created_at asc
      limit 1
    )
  );
$function$
;

-- verificar_status_estudio() muda de shape de retorno? Nao nesta migration
-- (mesma assinatura e mesmas colunas da versao anterior) -- so o ORDER BY
-- muda, entao CREATE OR REPLACE basta e preserva os GRANTs existentes.
CREATE OR REPLACE FUNCTION public.verificar_status_estudio()
 RETURNS TABLE(estudio_id uuid, nome text, status text, trial_ends_at timestamptz, motivo_bloqueio text, bloqueado boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    e.id,
    e.nome,
    e.status,
    e.trial_ends_at,
    case
      when e.status <> 'ativo' then 'status'
      when e.trial_ends_at is not null and e.trial_ends_at < now() then 'trial_expirado'
      else null
    end as motivo_bloqueio,
    (e.status <> 'ativo' or (e.trial_ends_at is not null and e.trial_ends_at < now())) as bloqueado
  from estudio_membros em
  join estudios e on e.id = em.estudio_id
  where em.user_id = auth.uid()
  order by
    (e.status = 'ativo' and (e.trial_ends_at is null or e.trial_ends_at > now())) desc,
    em.created_at asc
  limit 1;
$function$
;
