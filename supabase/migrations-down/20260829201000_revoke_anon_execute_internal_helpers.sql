-- Reverte 20260829201000_revoke_anon_execute_internal_helpers.sql: restaura
-- EXECUTE para PUBLIC (cobre anon por herança) nos 5 helpers internos. Uso
-- de emergência apenas — reintroduz a superfície que a migration "up"
-- corrigiu (get_advisors: anon_security_definer_function_executable).
-- Testar contra staging antes de aplicar de verdade num incidente.
GRANT EXECUTE ON FUNCTION public.eh_admin_do_estudio_atual() TO public;
GRANT EXECUTE ON FUNCTION public.eh_super_admin() TO public;
GRANT EXECUTE ON FUNCTION public.estudio_ativo_via_override() TO public;
GRANT EXECUTE ON FUNCTION public.estudio_id_atual() TO public;
GRANT EXECUTE ON FUNCTION public.meu_estudio_id() TO public;
