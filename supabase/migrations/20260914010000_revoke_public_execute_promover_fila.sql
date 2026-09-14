-- Fix de segurança achado pelo get_advisors logo depois de aplicar a
-- migration da lista de espera em produção (mesmo padrão do
-- 20260909191800_revoke_public_execute_agendar_avulso.sql): toda function
-- nova recebe EXECUTE para PUBLIC por padrão no Postgres. Isso expunha
-- promover_fila_apos_liberar_vaga (trigger function, SECURITY DEFINER)
-- como uma RPC chamável via /rest/v1/rpc/promover_fila_apos_liberar_vaga
-- por anon/authenticated — não deveria ser invocável fora do próprio
-- trigger (que dispara independente de EXECUTE grant, pois é o mecanismo
-- interno de trigger do Postgres, não uma chamada de função via role).

revoke execute on function public.promover_fila_apos_liberar_vaga() from public;
