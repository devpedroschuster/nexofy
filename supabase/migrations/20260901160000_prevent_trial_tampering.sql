-- PED-105 (final review fix): estudios.trial_ends_at é uma coluna comum
-- numa tabela onde o admin do próprio estúdio já tem UPDATE via RLS
-- ("tenant: update proprio estudio") — sem esta trigger, o admin consegue
-- zerar o próprio trial via PATCH direto na API REST, o que anula o
-- enforcement real de banco que é o propósito desta feature (ver
-- estudio_id_atual()/20260901122000_trial_enforcement.sql). RLS é
-- granular por linha, não por coluna — a trigger é o mecanismo certo pra
-- restringir uma coluna específica sem tocar na policy existente.
--
-- service_role passa (automação futura de cobrança, PED-115, e qualquer
-- job/edge function interno). super_admin passa (ação "Remover trial" no
-- painel, superAdminService.removerTrialEstudio). Qualquer outro
-- authenticated (admin do próprio estúdio, professor, etc) é bloqueado
-- se tentar alterar especificamente trial_ends_at — outras colunas de
-- estudios continuam livres, a trigger só olha essa uma coluna.
CREATE OR REPLACE FUNCTION public.prevent_trial_tampering()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.trial_ends_at is distinct from old.trial_ends_at
     and not eh_super_admin()
     and auth.role() <> 'service_role' then
    raise exception 'Alteração de trial_ends_at não permitida' using errcode = '42501';
  end if;
  return new;
end;
$function$
;

GRANT EXECUTE ON FUNCTION public.prevent_trial_tampering() TO service_role;
-- Function usada só como trigger (ninguém deve chamá-la via RPC direto) —
-- mesma convenção já aplicada a prevent_role_change() em
-- 20260831120000_align_rpc_execute_grants_staging_prod.sql. Sem este
-- REVOKE explícito, o ACL default do Postgres (EXECUTE liberado pra
-- PUBLIC) deixaria a function chamável via /rest/v1/rpc/prevent_trial_tampering
-- por anon/authenticated (get_advisors confirma isso como
-- anon_security_definer_function_executable /
-- authenticated_security_definer_function_executable se este REVOKE
-- faltar). Não é explorável — RETURNS trigger só funciona em contexto de
-- trigger real (NEW/OLD), uma chamada RPC direta falha — mas é o mesmo
-- padrão de defesa em profundidade do resto do arquivo.
REVOKE EXECUTE ON FUNCTION public.prevent_trial_tampering() FROM public, anon, authenticated;

CREATE TRIGGER trg_prevent_trial_tampering BEFORE UPDATE ON public.estudios FOR EACH ROW EXECUTE FUNCTION prevent_trial_tampering();
