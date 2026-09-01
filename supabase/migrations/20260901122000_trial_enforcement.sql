-- PED-105: enforcement do trial de 14 dias.
--
-- estudio_id_atual() ganha uma condição extra: um estúdio com trial
-- expirado deixa de resolver como "estúdio atual" pro membro comum
-- (não-impersonado), igual já acontece hoje pra status <> 'ativo'. Como é
-- CREATE OR REPLACE com a MESMA assinatura (sem parâmetro novo, sem
-- mudança de retorno), o OID e os GRANTs existentes são preservados —
-- toda RLS policy que depende desta function herda o filtro
-- automaticamente, sem precisar tocar em policy nenhuma.
--
-- status continua obrigatoriamente 'ativo' durante o trial (a própria
-- condição de baixo já exige isso) — a expiração do trial é rastreada só
-- por trial_ends_at, nunca mudando o enum de status.
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

-- verificar_status_estudio() muda de shape de retorno (colunas novas
-- trial_ends_at/motivo_bloqueio) — RETURNS TABLE diferente exige DROP +
-- CREATE (CREATE OR REPLACE não permite mudar tipo de retorno). Por isso
-- os GRANTs são reaplicados explicitamente logo abaixo (ver
-- RLS_MIGRATION_CHECKLIST.md, seção "DROP FUNCTION + CREATE FUNCTION
-- apaga os GRANT/REVOKE" — foi exatamente esse o incidente da PED-83).
DROP FUNCTION public.verificar_status_estudio();

CREATE FUNCTION public.verificar_status_estudio()
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

GRANT EXECUTE ON FUNCTION public.verificar_status_estudio() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_status_estudio() TO service_role;
REVOKE EXECUTE ON FUNCTION public.verificar_status_estudio() FROM public, anon;
