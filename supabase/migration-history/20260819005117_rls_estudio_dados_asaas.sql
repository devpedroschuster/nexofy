
create policy tenant_select on estudio_dados_asaas
  for select using (estudio_id = estudio_id_atual() or eh_super_admin());

create policy tenant_insert on estudio_dados_asaas
  for insert with check (estudio_id = estudio_id_atual() and eh_admin_do_estudio_atual());

create policy tenant_update on estudio_dados_asaas
  for update
  using (estudio_id = estudio_id_atual() and eh_admin_do_estudio_atual())
  with check (estudio_id = estudio_id_atual() and eh_admin_do_estudio_atual());

create policy tenant_delete on estudio_dados_asaas
  for delete using (estudio_id = estudio_id_atual() and eh_admin_do_estudio_atual());

