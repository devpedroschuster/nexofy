-- Fixture local-only: NUNCA versionar isto como migration
-- (supabase/migrations/). Motivo (PED-53): `supabase db dump` (que gerou
-- 00000000000000_baseline_current_schema.sql) não captura GRANTs de
-- tabela para roles reservadas (service_role/anon/authenticated) — a
-- plataforma hospedada da Supabase provisiona esses GRANTs na criação do
-- projeto, fora do schema `public` que o dump exporta. Um `supabase start`
-- local, rodando só as migrations deste repo do zero, não recebe esse
-- bootstrap — sem isto, toda Edge Function que usa o client service_role
-- (a maioria) falha com 42501 (permission denied) ao ler/gravar qualquer
-- tabela. Reproduzir só localmente evita sobrescrever grants
-- possivelmente mais restritivos que staging/produção já tenham.
--
-- Roda automaticamente após as migrations em `supabase start` / `db reset`
-- (config.toml: [db.seed] sql_paths = ["./seed.sql"]).

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Cobre tabelas criadas por migrations futuras sem precisar tocar neste
-- arquivo de novo.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
