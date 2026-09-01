-- Reverte 20260901122000_trial_enforcement.sql: restaura
-- estudio_id_atual() e verificar_status_estudio() às suas definições
-- anteriores à PED-105 (sem nenhuma checagem de trial_ends_at). Testar
-- contra staging antes de aplicar de verdade num incidente, conforme
-- supabase/migrations-down/README.md.
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
      limit 1
    )
  );
$function$
;

DROP FUNCTION IF EXISTS public.verificar_status_estudio();

CREATE FUNCTION public.verificar_status_estudio()
 RETURNS TABLE(estudio_id uuid, nome text, status text, bloqueado boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.nome, e.status, (e.status <> 'ativo') as bloqueado
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
