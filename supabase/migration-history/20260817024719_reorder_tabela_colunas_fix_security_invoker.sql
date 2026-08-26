-- Corrige vulnerabilidade: a versão anterior usava SECURITY DEFINER com
-- dono 'postgres' (rolbypassrls=true), o que ignorava completamente a
-- RLS/policy de UPDATE da tabela (que exige eh_admin_do_estudio_atual()
-- OR eh_super_admin()). Qualquer usuário autenticado conseguia reordenar
-- colunas de qualquer estúdio, mesmo sem ser admin.
--
-- SECURITY INVOKER (comportamento padrão, explicitado aqui por clareza)
-- faz a função rodar com os privilégios de quem chama via supabase.rpc,
-- então a RLS volta a ser aplicada normalmente: só admin/super_admin do
-- estúdio corrente conseguem de fato alterar display_order.
create or replace function reorder_tabela_colunas(
  p_estudio_id uuid,
  p_ids uuid[]
) returns void
language plpgsql
security invoker
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

-- Restringe quem pode executar a função (RLS ainda é a barreira real de
-- autorização, isso é só reduzir superfície: anon não deveria nem tentar).
revoke execute on function reorder_tabela_colunas(uuid, uuid[]) from public;
grant execute on function reorder_tabela_colunas(uuid, uuid[]) to authenticated;
