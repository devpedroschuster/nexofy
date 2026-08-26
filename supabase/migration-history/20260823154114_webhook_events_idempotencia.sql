-- PED-12: idempotência do webhook Asaas.
-- O Asaas não envia um event_id único no payload (só `event` tipo + `payment.id`).
-- A chave de dedup é o par (event, asaas_payment_id): reenvio do mesmo evento
-- para o mesmo pagamento é tratado como retry e ignorado (200, sem reprocessar).
create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  origem text not null default 'asaas',
  asaas_event text not null,
  asaas_payment_id text not null,
  payload jsonb,
  recebido_em timestamptz not null default now(),
  constraint webhook_events_dedup_unique unique (origem, asaas_event, asaas_payment_id)
);

comment on table public.webhook_events is
  'Log de eventos de webhook recebidos, usado para dedup/idempotência (PED-12). Insert com ON CONFLICT DO NOTHING antes de processar o evento.';

-- Só o service role (edge functions) grava/lê aqui; não é dado de tenant.
alter table public.webhook_events enable row level security;

revoke all on public.webhook_events from anon, authenticated;

