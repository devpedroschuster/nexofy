-- Reverte 20260828164502_align_mensalidades_id_identity_column.sql:
-- volta mensalidades.id de identity column para o formato serial
-- clássico (sequence own + default nextval()), preservando a numeração
-- (nova sequence começa exatamente no próximo valor que o identity
-- entregaria — sem gap, sem colisão).
--
-- Estrutural, não recupera dado (não há dado a recuperar aqui: a coluna
-- nunca chega a ficar sem default, então não há janela sem geração de
-- id). Testar contra staging antes de aplicar de verdade num incidente,
-- conforme supabase/migrations-down/README.md.
do $$
declare
  v_next bigint;
begin
  if exists (
    select 1
    from pg_attribute
    where attrelid = 'public.mensalidades'::regclass
      and attname = 'id'
      and attidentity <> ''
  ) then
    select nextval(pg_get_serial_sequence('public.mensalidades', 'id')) into v_next;

    execute 'alter table public.mensalidades alter column id drop identity if exists';
    execute 'create sequence if not exists public.mensalidades_id_seq owned by public.mensalidades.id';
    execute format('select setval(''public.mensalidades_id_seq'', %s, false)', v_next);
    execute 'alter table public.mensalidades alter column id set default nextval(''public.mensalidades_id_seq'')';
  end if;
end $$;
