-- Reverte 20260902170000_add_plano_nexofy_estudios.sql: remove as 5 colunas
-- de assinatura Nexofy e seus checks. Estrutural, perde dado de qualquer
-- estúdio com assinatura já registrada — confirmar que não há dependência
-- viva (trigger trg_prevent_assinatura_nexofy_tampering,
-- 20260903000000_prevent_assinatura_nexofy_tampering.sql, e as edge
-- functions assinar-plano-nexofy/webhook-assinatura-nexofy) antes de
-- aplicar num incidente — reverter esta migration sozinha sem reverter a
-- trigger quebra a function da trigger (coluna referenciada não existe
-- mais).
ALTER TABLE public.estudios DROP CONSTRAINT IF EXISTS estudios_plano_nexofy_check;
ALTER TABLE public.estudios DROP CONSTRAINT IF EXISTS estudios_ciclo_cobranca_check;
ALTER TABLE public.estudios DROP CONSTRAINT IF EXISTS estudios_assinatura_status_check;

ALTER TABLE public.estudios
  DROP COLUMN IF EXISTS plano_nexofy,
  DROP COLUMN IF EXISTS ciclo_cobranca,
  DROP COLUMN IF EXISTS assinatura_status,
  DROP COLUMN IF EXISTS asaas_customer_id_nexofy,
  DROP COLUMN IF EXISTS asaas_subscription_id;
