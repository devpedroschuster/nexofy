create or replace function reorder_tabela_colunas(
  p_estudio_id uuid,
  p_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update tabela_colunas_config t
  set display_order = x.ordem
  from unnest(p_ids) with ordinality as x(id, ordem)
  where t.id = x.id
    and t.estudio_id = p_estudio_id;
end;
$$;
