
-- Estúdio isolado só para testar o fluxo de ativação Asaas em sandbox.
-- Não usa dados do Espaço Iluminus (produção) de propósito.
insert into estudios (id, slug, nome, email, timezone, segmento)
values (
  'a0000000-0000-4000-8000-000000000001',
  'teste-qa-asaas',
  'Estúdio Teste QA (Asaas Sandbox)',
  'qa-asaas@nexofy.test',
  'America/Sao_Paulo',
  'danca_fitness'
);

-- Vincula o super_admin como admin deste estúdio específico, para que o
-- edge function criar-subconta-asaas (que checa estudio_membros.role por
-- estudio_id explícito) autorize a chamada durante o teste via impersonation.
insert into estudio_membros (estudio_id, user_id, role)
values (
  'a0000000-0000-4000-8000-000000000001',
  'a41944ea-d522-4a54-8829-7bff4022897b',
  'admin'
);

-- Dados fictícios válidos para POST /v3/accounts (CNPJ de teste, 14 dígitos —
-- não corresponde a uma empresa real; a Asaas sandbox não valida a Receita).
insert into estudio_dados_asaas (
  estudio_id, nome_responsavel, email_responsavel, telefone_celular, telefone_fixo,
  cnpj, company_type, faturamento_mensal, site,
  cep, endereco, numero, complemento, bairro, status_cadastro
) values (
  'a0000000-0000-4000-8000-000000000001',
  'Pedro Regus Schuster (Teste)',
  'qa-asaas@nexofy.test',
  '51999998888',
  null,
  '12345678000195',
  'MEI',
  5000.00,
  null,
  '90010000',
  'Rua dos Andradas',
  '100',
  null,
  'Centro Histórico',
  'incompleto'
);

