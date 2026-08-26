
alter table mensalidades
  add column if not exists valor_cobranca numeric;

comment on column mensalidades.valor_cobranca is
  'Valor da cobrança gerada (Asaas ou manual), preenchido na criação/pendência. '
  'Distinto de valor_pago, que só é preenchido quando o pagamento é efetivamente '
  'confirmado (webhook Asaas ou confirmação manual). Ver criar-cobranca-asaas '
  'e webhook-pagamento.';

