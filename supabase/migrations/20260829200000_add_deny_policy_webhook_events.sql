-- PED-80: public.webhook_events tem RLS habilitado mas nenhuma policy, o que o
-- Supabase security advisor aponta (rls_enabled_no_policy). Já é fail-closed
-- hoje (revoke all from anon, authenticated já existe desde a migration
-- 20260823154114_webhook_events_idempotencia.sql) — só service_role (edge
-- function webhook-pagamento) acessa esta tabela, não é dado de tenant.
-- Esta policy não muda comportamento nenhum; só documenta a intenção
-- explicitamente em vez de depender do default implícito, como o próprio
-- advisor recomenda.
create policy "Sem acesso para anon/authenticated (somente service_role)"
on public.webhook_events
as restrictive
for all
to anon, authenticated
using (false);
