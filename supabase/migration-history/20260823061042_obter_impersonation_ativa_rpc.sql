-- Migration: obter_impersonation_ativa_rpc
--
-- Contexto (auditoria do módulo SuperAdmin/impersonation):
--   estudio_ativo_via_override() apenas checa `expira_em > now()` e retorna
--   NULL silenciosamente quando expira — sem erro algum. O client não tinha
--   como saber QUANDO a sessão de impersonation expira, então não conseguia
--   agir proativamente (avisar o usuário, encerrar a sessão local antes do
--   TTL estourar). Esta RPC expõe só o necessário (estudio_id, criado_em,
--   expira_em) para o ImpersonationContext controlar isso por timer no client.
--
-- Segurança: SECURITY DEFINER só para evitar depender de policy de SELECT
-- na tabela para esse caso específico, mas a query interna já filtra por
-- auth.uid() e por expira_em > now() — um usuário só pode obter sua própria
-- sessão ativa, nunca a de outro. Não precisa checar eh_super_admin() aqui:
-- se não houver override ativo (não é super_admin, ou não impersonou
-- ninguém), a query simplesmente não retorna linha.

CREATE OR REPLACE FUNCTION public.obter_impersonation_ativa()
 RETURNS TABLE (
   estudio_id uuid,
   criado_em  timestamptz,
   expira_em  timestamptz
 )
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.estudio_id, s.criado_em, s.expira_em
  FROM public.impersonation_sessions s
  WHERE s.user_id = auth.uid()
    AND s.expira_em > now()
  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.obter_impersonation_ativa() FROM public;
GRANT EXECUTE ON FUNCTION public.obter_impersonation_ativa() TO authenticated;

