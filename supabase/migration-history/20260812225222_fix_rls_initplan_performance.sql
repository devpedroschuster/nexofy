-- agenda
ALTER POLICY tenant_delete ON public.agenda USING ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()));
ALTER POLICY tenant_insert ON public.agenda WITH CHECK ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()));
ALTER POLICY tenant_update ON public.agenda USING ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual())) WITH CHECK ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()));
ALTER POLICY tenant_select ON public.agenda USING ((estudio_id = (select public.estudio_id_atual())) OR (select public.eh_super_admin()));

-- historico_planos
ALTER POLICY tenant_delete ON public.historico_planos USING ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()));
ALTER POLICY tenant_insert ON public.historico_planos WITH CHECK ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()));
ALTER POLICY tenant_update ON public.historico_planos USING ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual())) WITH CHECK ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()));
ALTER POLICY tenant_select ON public.historico_planos USING ((estudio_id = (select public.estudio_id_atual())) OR (select public.eh_super_admin()));

-- mensalidades
ALTER POLICY tenant_delete ON public.mensalidades USING ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()));
ALTER POLICY tenant_insert ON public.mensalidades WITH CHECK ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()));
ALTER POLICY tenant_update ON public.mensalidades USING ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual())) WITH CHECK ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()));
ALTER POLICY tenant_select ON public.mensalidades USING ((estudio_id = (select public.estudio_id_atual())) OR (select public.eh_super_admin()));

-- repasses_lancamentos
ALTER POLICY tenant_delete ON public.repasses_lancamentos USING ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()));
ALTER POLICY tenant_insert ON public.repasses_lancamentos WITH CHECK ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()));
ALTER POLICY tenant_update ON public.repasses_lancamentos USING ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual())) WITH CHECK ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()));
ALTER POLICY tenant_select ON public.repasses_lancamentos USING ((estudio_id = (select public.estudio_id_atual())) OR (select public.eh_super_admin()));

-- professores
ALTER POLICY tenant_delete ON public.professores USING ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()));
ALTER POLICY tenant_insert ON public.professores WITH CHECK ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()));
ALTER POLICY tenant_update ON public.professores USING ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual())) WITH CHECK ((estudio_id = (select public.estudio_id_atual())) AND (select public.eh_admin_do_estudio_atual()));
ALTER POLICY tenant_select ON public.professores USING ((estudio_id = (select public.estudio_id_atual())) OR (select public.eh_super_admin()));
ALTER POLICY professor_self_select ON public.professores USING (auth_id = (select auth.uid()));

-- fechamento_comissoes
ALTER POLICY tenant_delete ON public.fechamento_comissoes USING ((select public.eh_admin_do_estudio_atual()) AND (professor_id IN (SELECT professores.id FROM professores WHERE professores.estudio_id = (select public.estudio_id_atual()))));
ALTER POLICY tenant_insert ON public.fechamento_comissoes WITH CHECK ((select public.eh_admin_do_estudio_atual()) AND (professor_id IN (SELECT professores.id FROM professores WHERE professores.estudio_id = (select public.estudio_id_atual()))));
ALTER POLICY tenant_update ON public.fechamento_comissoes USING ((select public.eh_admin_do_estudio_atual()) AND (professor_id IN (SELECT professores.id FROM professores WHERE professores.estudio_id = (select public.estudio_id_atual())))) WITH CHECK ((select public.eh_admin_do_estudio_atual()) AND (professor_id IN (SELECT professores.id FROM professores WHERE professores.estudio_id = (select public.estudio_id_atual()))));
ALTER POLICY tenant_select ON public.fechamento_comissoes USING ((professor_id IN (SELECT professores.id FROM professores WHERE professores.estudio_id = (select public.estudio_id_atual()))) OR (select public.eh_super_admin()));
ALTER POLICY professor_self_fechamento ON public.fechamento_comissoes USING (professor_id IN (SELECT professores.id FROM professores WHERE professores.auth_id = (select auth.uid())));

-- estudio_membros
ALTER POLICY self_select ON public.estudio_membros USING ((user_id = (select auth.uid())) OR (select public.eh_super_admin()));

-- impersonation_sessions
ALTER POLICY usuario_ve_propria_impersonation ON public.impersonation_sessions USING (user_id = (select auth.uid()));
