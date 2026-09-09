-- supabase/migrations/20260908180000_index_fks_lgpd_tables.sql
-- Supabase performance advisor (rodado após aplicar as migrations de
-- PED-172/174 em staging) apontou FKs sem índice de cobertura nas tabelas
-- novas desta leva — adicionando antes de qualquer volume real de dado.
create index idx_audit_log_alterado_por on public.audit_log(alterado_por);
create index idx_solicitacoes_titular_solicitado_por on public.solicitacoes_titular(solicitado_por);
create index idx_solicitacoes_titular_atendido_por on public.solicitacoes_titular(atendido_por);
