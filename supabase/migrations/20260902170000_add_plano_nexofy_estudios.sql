-- supabase/migrations/20260902170000_add_plano_nexofy_estudios.sql
--
-- PED-115: colunas para cobrança automática pós-trial (plano pago
-- self-service com cartão). Puramente aditiva — todas as colunas nascem
-- NULL (ou 'nenhuma' pra assinatura_status), não afeta estúdio nenhum
-- existente. Sem down-migration: mesmo padrão de
-- 20260901120000_add_trial_ends_at_estudios.sql.

alter table public.estudios
  add column plano_nexofy text,
  add column ciclo_cobranca text,
  add column assinatura_status text not null default 'nenhuma',
  add column asaas_customer_id_nexofy text,
  add column asaas_subscription_id text;

alter table public.estudios
  add constraint estudios_plano_nexofy_check
  check (plano_nexofy is null or plano_nexofy = any (array['essencial', 'profissional']));

alter table public.estudios
  add constraint estudios_ciclo_cobranca_check
  check (ciclo_cobranca is null or ciclo_cobranca = any (array['mensal', 'anual']));

alter table public.estudios
  add constraint estudios_assinatura_status_check
  check (assinatura_status = any (array['nenhuma', 'ativa']));
