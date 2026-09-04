-- Reverte 20260829150000_align_despesas_feriados_planos_id_identity_column.sql:
-- volta despesas.id, feriados.id e planos.id de identity column para o
-- formato serial clássico (sequence own + default nextval()), preservando a
-- numeração (nova sequence começa exatamente no próximo valor que o
-- identity entregaria — sem gap, sem colisão).
--
-- Estrutural, não recupera dado. Testar contra staging antes de aplicar de
-- verdade num incidente, conforme supabase/migrations-down/README.md.
do $$
declare
  v_next bigint;
begin
  if exists (
    select 1 from pg_attribute
    where attrelid = 'public.despesas'::regclass
      and attname = 'id' and attidentity <> ''
  ) then
    select nextval(pg_get_serial_sequence('public.despesas', 'id')) into v_next;
    execute 'alter table public.despesas alter column id drop identity if exists';
    execute 'create sequence if not exists public.despesas_id_seq owned by public.despesas.id';
    execute format('select setval(''public.despesas_id_seq'', %s, false)', v_next);
    execute 'alter table public.despesas alter column id set default nextval(''public.despesas_id_seq'')';
  end if;
end $$;

do $$
declare
  v_next bigint;
begin
  if exists (
    select 1 from pg_attribute
    where attrelid = 'public.feriados'::regclass
      and attname = 'id' and attidentity <> ''
  ) then
    select nextval(pg_get_serial_sequence('public.feriados', 'id')) into v_next;
    execute 'alter table public.feriados alter column id drop identity if exists';
    execute 'create sequence if not exists public.feriados_id_seq owned by public.feriados.id';
    execute format('select setval(''public.feriados_id_seq'', %s, false)', v_next);
    execute 'alter table public.feriados alter column id set default nextval(''public.feriados_id_seq'')';
  end if;
end $$;

do $$
declare
  v_next bigint;
begin
  if exists (
    select 1 from pg_attribute
    where attrelid = 'public.planos'::regclass
      and attname = 'id' and attidentity <> ''
  ) then
    select nextval(pg_get_serial_sequence('public.planos', 'id')) into v_next;
    execute 'alter table public.planos alter column id drop identity if exists';
    execute 'create sequence if not exists public.planos_id_seq owned by public.planos.id';
    execute format('select setval(''public.planos_id_seq'', %s, false)', v_next);
    execute 'alter table public.planos alter column id set default nextval(''public.planos_id_seq'')';
  end if;
end $$;
