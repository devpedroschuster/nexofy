# Dump anonimizado de produção → staging

Este processo popula o projeto de staging (`qjmybxkfjkxttggdjxga`) com uma cópia
anonimizada dos dados de produção (`tciiepqmnrrcjnqhspvw`), pra dar pra testar contra
dados realistas sem nunca expor PII real (nome, email, telefone, CPF, endereço,
observações médicas, chaves/ids de gateway de pagamento).

## Como funciona

1. **Funções de dado fake** já existem no schema do staging (`fake_cpf`, `fake_cnpj`,
   `fake_nome`, `fake_email`, `fake_telefone`, `fake_cep`, `fake_bairro`,
   `fake_cidade` — todas em `public`, determinísticas por seed). `fake_cpf`/`fake_cnpj`
   geram dígito verificador válido (formato aceito por validações de UI), mas não são
   documentos reais.
2. Para cada tabela, em ordem de dependência de FK (`estudios` → `professores` →
   `modalidades`/`planos`/`espacos` → `alunos` → `agenda*` → `leads` → `presencas` →
   `historico_planos`/`mensalidades` → `repasses_lancamentos`/`configuracoes_repasse`/
   `fechamento_comissoes` → `despesas`/`feriados`/`campos_dinamicos`/
   `tabela_colunas_config` → `estudio_dados_asaas`):
   - Colunas estruturais/financeiras (ids, FKs, datas, valores, status) são copiadas
     como estão.
   - Colunas de PII nunca são lidas de produção — são geradas do zero no staging a
     partir do `id` da linha (`fake_nome(id)`, etc.), então o valor real nunca sai do
     banco de produção nem passa por nenhuma ferramenta intermediária.
   - Campos de identificação externa (`asaas_customer_id`, `asaas_payment_id`,
     `push_token`, `link_anamnese`, `comprovante_url` etc.) viram `NULL` — nunca deve
     existir um id de gateway de pagamento real apontando pra staging.
3. `estudio_membros`, `webhook_events` e `impersonation_sessions` **não** são
   copiadas — a primeira depende de usuários reais em `auth.users`, que
   propositalmente não são replicados (ver seção abaixo); as outras duas são dado
   transacional sem valor pra teste.

## Usuários de teste (login)

Staging não tem nenhum usuário em `auth.users` — copiar os reais exporia emails e
hashes de senha de gente real num ambiente de teste. Pra conseguir logar e testar RLS
de admin/professor/aluno, crie manualmente pelo Supabase Studio do projeto de
staging (Authentication → Users → Add user), um e-mail tipo
`admin@staging.nexofy.test`, e depois insira a linha correspondente em
`estudio_membros` (ou atualize `auth_id` em `alunos`/`professores`) apontando pro
`id` do usuário criado.

## Re-rodar (refresh periódico)

O processo é idempotente por tabela (mesmo `id` → mesmo dado fake, pela função
determinística), mas não há um script único — foi feito via queries diretas nas
tools do Supabase. Pra atualizar o staging com dados mais recentes de produção,
repita o processo tabela a tabela, ou trunque as tabelas de staging (exceto schema)
e rode de novo do zero.
