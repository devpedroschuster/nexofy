-- Reverte 20260902160000_unifica_criterio_estudio_atual.sql: volta
-- estudio_id_atual() a escolher um vínculo não-bloqueado ARBITRÁRIO (sem
-- order by) e verificar_status_estudio() a sempre priorizar o vínculo mais
-- ANTIGO (ignorando se está bloqueado) — reintroduz a divergência entre RLS
-- e UI que esta migration corrigiu. Mesma assinatura nos dois casos, CREATE
-- OR REPLACE preserva os GRANTs existentes.
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
      limit 1
    )
  );
$function$
;

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
  order by em.created_at asc
  limit 1;
$function$
;
