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
4. **Sequences precisam ser corrigidas depois da cópia (PED-48).** Como o `id`
   é copiado explícito de produção (pra preservar as referências de FK), a
   sequence de cada tabela com PK `bigint`/`integer` gerado por identity (não
   uuid) nunca é chamada via `nextval()` — fica presa no valor default (1).
   Sem corrigir, o primeiro INSERT novo depois do dump colide com um id já
   existente (`duplicate key value violates unique constraint`). Rode, pra
   cada tabela afetada, logo após o dump:
   ```sql
   select setval('public.<tabela>_id_seq', (select max(id) from public.<tabela>), true);
   ```
   Tabelas com PK uuid (`estudios`, `professores`, `modalidades`, `espacos`,
   `historico_planos`, `repasses_lancamentos`, `configuracoes_repasse`,
   `fechamento_comissoes`, `despesas`, `feriados`, `campos_dinamicos`,
   `tabela_colunas_config`, `estudio_dados_asaas`) não têm esse problema —
   `gen_random_uuid()` não depende de sequence.

## Usuários de teste (login)

Staging não tem nenhum usuário real em `auth.users` — copiar os reais exporia emails
e hashes de senha de gente real num ambiente de teste. Em vez disso, foram criados
manualmente pelo Supabase Studio do projeto de staging (Authentication → Users →
Add user) 3 usuários sintéticos, já vinculados ao estúdio principal
(`d151fb3f-9435-4d18-a6ea-f26d805b9459`, slug `iluminus`, o mesmo que
`VITE_DEV_SLUG` aponta):

| Role | Email | user_id | Vínculo extra |
|---|---|---|---|
| admin | `admin@staging.nexofy.test` | `a6f32ff3-875d-4d2c-b74c-acae447a6187` | `estudio_membros` (role `admin`) |
| professor | `professor@staging.nexofy.test` | `74984292-de4b-4f29-94ba-1cf00430154b` | `estudio_membros` (role `professor`) + `professores.auth_id` (Elisa Lima, id `eae6bbda-b3e4-44f5-ad98-6695541f6874`) |
| aluno | `aluno@staging.nexofy.test` | `a6991ff1-5c31-4d0d-b091-14c800d01bd0` | `estudio_membros` (role `aluno`) + `alunos.auth_id` (Olivia Almeida, id `54`) |

As senhas foram definidas na hora da criação no Studio (não ficam registradas aqui).
Pra adicionar mais usuários de teste depois, repita o processo e rode um `insert`
em `estudio_membros` e/ou `update` em `alunos`/`professores.auth_id` apontando pro
novo `id`.

## Re-rodar (refresh periódico)

O processo é idempotente por tabela (mesmo `id` → mesmo dado fake, pela função
determinística), mas não há um script único — foi feito via queries diretas nas
tools do Supabase. Pra atualizar o staging com dados mais recentes de produção,
repita o processo tabela a tabela, ou trunque as tabelas de staging (exceto schema)
e rode de novo do zero.
