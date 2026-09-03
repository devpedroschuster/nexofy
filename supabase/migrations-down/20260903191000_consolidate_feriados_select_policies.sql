-- ATENÇÃO: este "down" recria a policy "Leitura pública feriados"
-- (qual=true), que é o vazamento cross-tenant descrito em
-- 20260903191000_consolidate_feriados_select_policies.sql — qualquer
-- usuário autenticado volta a poder ler feriados de outros estúdios. Só
-- rodar isso se a migration "up" causar uma quebra funcional inesperada e
-- não houver tempo de investigar a causa raiz antes; reverter a origem do
-- problema é sempre preferível a restaurar esta policy.
create policy "Leitura pública feriados" on public.feriados
  for select
  to authenticated
  using (true);
