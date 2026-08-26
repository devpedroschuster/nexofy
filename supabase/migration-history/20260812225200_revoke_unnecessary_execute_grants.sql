-- Funções de negócio não devem ser chamáveis por usuário anônimo (anon).
-- Mantém authenticated pois o app depende delas logado.
REVOKE EXECUTE ON FUNCTION public.excluir_aula_cascata(bigint, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.verificar_disponibilidade_v2(bigint, date, uuid, bigint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.agendar_avulso FROM anon;
REVOKE EXECUTE ON FUNCTION public.listar_estudios_admin(integer, integer, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.receita_total_paga FROM anon;
REVOKE EXECUTE ON FUNCTION public.verificar_status_estudio() FROM anon;

-- Funções auxiliares internas (usadas por RLS/outras funções): sem uso legítimo via RPC direto por anon.
REVOKE EXECUTE ON FUNCTION public.eh_admin_do_estudio_atual() FROM anon;
REVOKE EXECUTE ON FUNCTION public.eh_super_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.estudio_ativo_via_override() FROM anon;
REVOKE EXECUTE ON FUNCTION public.estudio_id_atual() FROM anon;
REVOKE EXECUTE ON FUNCTION public.meu_estudio_id() FROM anon;

-- prevent_role_change é uma função de TRIGGER (não deveria estar exposta como RPC nem para anon nem authenticated).
REVOKE EXECUTE ON FUNCTION public.prevent_role_change() FROM anon, authenticated;
