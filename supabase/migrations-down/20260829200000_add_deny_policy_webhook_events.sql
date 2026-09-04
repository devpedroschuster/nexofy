-- Reverte 20260829200000_add_deny_policy_webhook_events.sql: remove a policy
-- restritiva explícita. webhook_events continua fail-closed pra
-- anon/authenticated de qualquer forma (revoke all já existe desde
-- 20260823154114_webhook_events_idempotencia.sql) — este down só volta a
-- depender do default implícito em vez da policy explícita.
DROP POLICY IF EXISTS "Sem acesso para anon/authenticated (somente service_role)"
ON public.webhook_events;
