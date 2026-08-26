do $$
declare
  r record;
begin
  for r in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (
        (tablename = 'historico_planos' and policyname like 'Permitir gest%o de hist%rico%')
        or (tablename = 'historico_planos' and policyname like 'Permitir inser%')
        or (tablename = 'mensalidades' and policyname like 'Permitir gest%o de mensalidades%')
        or (tablename = 'despesas' and policyname like 'Leitura para autenticados%')
      )
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    raise notice 'dropped % on %', r.policyname, r.tablename;
  end loop;
end $$;
