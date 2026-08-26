
-- Subconta Asaas por estúdio (multi-tenant: cada estúdio recebe na própria conta)
alter table estudios
  add column asaas_account_id text,          -- id da subconta no Asaas
  add column asaas_wallet_id text,            -- walletId usado em splits (se o Nexofy cobrar taxa da plataforma no futuro)
  add column asaas_api_key text,              -- api key da subconta (recomendo mover para Supabase Vault depois; por ora coluna simples)
  add column asaas_status text default 'nao_configurado'
    check (asaas_status in ('nao_configurado', 'pendente_aprovacao', 'ativa', 'rejeitada'));

-- Cliente Asaas por aluno (customer é criado dentro da subconta do estúdio)
alter table alunos
  add column asaas_customer_id text,
  add column status_pagamento text default 'em_dia'
    check (status_pagamento in ('em_dia', 'inadimplente', 'isento')),
  add column dias_atraso int default 0;

-- Rastreio da cobrança/assinatura no Asaas
alter table mensalidades
  add column asaas_payment_id text,
  add column asaas_subscription_id text,
  add column asaas_status text,               -- PENDING, RECEIVED, CONFIRMED, OVERDUE, REFUNDED
  add column link_pagamento text,
  add column data_confirmacao timestamptz;

create index idx_mensalidades_asaas_payment_id on mensalidades(asaas_payment_id);
create index idx_mensalidades_asaas_subscription_id on mensalidades(asaas_subscription_id);
create index idx_alunos_asaas_customer_id on alunos(asaas_customer_id);
create index idx_alunos_status_pagamento on alunos(status_pagamento);

