REVOKE EXECUTE ON FUNCTION public.eh_admin_do_estudio_atual() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.eh_super_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.estudio_ativo_via_override() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.estudio_id_atual() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.meu_estudio_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.listar_estudios_admin(integer, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.receita_total_paga() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verificar_disponibilidade_v2(bigint, date, uuid, bigint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.verificar_status_estudio() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_role_change() FROM PUBLIC;

-- Restaura para quem realmente precisa (app logado). prevent_role_change fica sem grant nenhum
-- (é função de TRIGGER, dispara via before update, não precisa ser chamável via RPC).
GRANT EXECUTE ON FUNCTION public.eh_admin_do_estudio_atual() TO authenticated;
GRANT EXECUTE ON FUNCTION public.eh_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.estudio_ativo_via_override() TO authenticated;
GRANT EXECUTE ON FUNCTION public.estudio_id_atual() TO authenticated;
GRANT EXECUTE ON FUNCTION public.meu_estudio_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.listar_estudios_admin(integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receita_total_paga() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_disponibilidade_v2(bigint, date, uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_status_estudio() TO authenticated;
