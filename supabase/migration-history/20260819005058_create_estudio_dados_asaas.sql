
create table estudio_dados_asaas (
  id uuid primary key default gen_random_uuid(),
  estudio_id uuid not null references estudios(id),

  -- Titular da subconta (responsável legal pelo estúdio)
  nome_responsavel text not null,
  email_responsavel text not null,
  telefone_celular text not null,
  telefone_fixo text,

  -- Dados da empresa
  cnpj text not null,
  company_type text not null
    check (company_type in ('MEI', 'LIMITED', 'INDIVIDUAL', 'ASSOCIATION')),
  faturamento_mensal numeric not null,
  site text,

  -- Endereço (obrigatório pela API Asaas)
  cep text not null,
  endereco text not null,
  numero text not null,
  complemento text,
  bairro text not null,

  -- Status do preenchimento/aprovação
  status_cadastro text not null default 'incompleto'
    check (status_cadastro in ('incompleto', 'enviado', 'aprovado', 'rejeitado')),
  enviado_em timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (estudio_id)
);

alter table estudio_dados_asaas enable row level security;

comment on table estudio_dados_asaas is 'Dados cadastrais exigidos pela Asaas (POST /v3/accounts) para criação da subconta do estúdio. Separado de estudios pois é opcional até o estúdio ativar cobrança automática.';

