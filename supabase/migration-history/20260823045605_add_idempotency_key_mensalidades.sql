
alter table mensalidades
  add column if not exists idempotency_key text,
  add column if not exists tipo_cobranca text not null default 'mensalidade'
    check (tipo_cobranca in ('mensalidade', 'avulso'));

create unique index if not exists mensalidades_idempotency_key_uidx
  on mensalidades (idempotency_key)
  where idempotency_key is not null;

comment on column mensalidades.idempotency_key is
  'Chave de idempotência para criar-cobranca-asaas. Preferencialmente gerada pelo frontend (UUID) e reenviada em retries; se ausente, function usa fallback determinístico (aluno+plano+mes para mensalidade, aluno+descricao+data para avulso).';

