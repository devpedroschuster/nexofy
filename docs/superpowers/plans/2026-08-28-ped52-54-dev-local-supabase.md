# Correções de tooling de dev local — Supabase (PED-52/53/54)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar este plano task por task (documentação de processo + um fix local pequeno via `seed.sql`, sem lógica de produto nova — mesmo padrão do PED-18/PED-40-43, sem necessidade de subagentes por task). Steps usam checkbox (`- [ ]`) para tracking.

**Goal:** Resolver os três achados de tooling reportados durante a validação manual local do PED-34 (`supabase start` falhando ao subir `logflare`/`realtime`, `service_role` sem GRANT nas tabelas `public`, e `functions serve` retornando 401 mesmo com `verify_jwt = false`) — nenhum dos três afeta staging/produção, todos bloqueiam silenciosamente o loop de teste local de Edge Functions.

**Architecture:** Sem mudança de lógica de negócio. Um fix funcional local-only (`supabase/seed.sql`, já habilitado em `config.toml` mas inexistente) para o PED-53; os outros dois (PED-52, PED-54) são investigação de causa raiz + documentação do workaround, já que ambos são comportamento conhecido/limitação da Supabase CLI (não bug deste repositório). Consolida tudo num novo `docs/DEV_LOCAL.md`, referenciado a partir do `README.md`, em vez de espalhar a documentação.

**Tech Stack:** Supabase CLI 2.115.0 (Docker Desktop local), PostgreSQL 17, Markdown. Nenhuma dependência nova.

**Spec:** Tickets Linear [PED-52](https://linear.app/pedro-schuster/issue/PED-52/dev-local-supabase-start-falha-ao-subir-o-container-logflare), [PED-53](https://linear.app/pedro-schuster/issue/PED-53/dev-local-service-role-sem-grant-de-selectinsertupdatedelete-nas), [PED-54](https://linear.app/pedro-schuster/issue/PED-54/dev-local-supabase-functions-serve-nome-env-file-nao-respeita-verify) — todos achados "[Dev local]" adjacentes ao PED-34, sem impacto em produção/staging.

## Global Constraints

- **Tudo aqui é local-only.** Nunca rodar `supabase db push`/`functions deploy` contra staging (`qjmybxkfjkxttggdjxga`) ou produção (`tciiepqmnrrcjnqhspvw`) como parte deste trabalho — são achados exclusivos do stack local (`supabase start`).
- GRANTs de `service_role` vão em `supabase/seed.sql` (só roda local via `supabase start`/`db reset`, nunca é aplicado remoto pela CLI) — **nunca** em `supabase/migrations/`. Motivo (PED-53): a baseline não capturou esses GRANTs porque a plataforma hospedada os provisiona fora do dump de schema; reproduzir via migration versionada arriscaria sobrescrever grants possivelmente mais restritivos que staging/produção já tenham.
- Sem framework de teste automatizado pra tooling local — verificação é reprodução manual real (stack local rodando) + releitura humana dos docs, mesmo padrão do PED-18/PED-40-43.
- Não alterar `webhook-pagamento/index.ts` nem nenhum código de função — os três achados são de tooling/config/docs, não de lógica de aplicação.

---

## File Structure

- **Create** `supabase/seed.sql` — GRANTs de `service_role` nas tabelas `public` (PED-53). Já habilitado em `supabase/config.toml` (`[db.seed] sql_paths = ["./seed.sql"]`), só falta o arquivo existir.
- **Create** `docs/DEV_LOCAL.md` — guia único de setup do stack local completo (`supabase start`), com as três seções: containers que podem falhar no primeiro boot (PED-52), por que `service_role` precisa do seed (PED-53), e o header extra necessário ao testar functions com `verify_jwt=false` localmente (PED-54).
- **Modify** `README.md` — adiciona um link pra `docs/DEV_LOCAL.md` na seção "⚙️ Como rodar localmente" (que hoje só cobre o front-end contra staging, não o stack Supabase completo).
- **Modify** `docs/superpowers/plans/2026-08-26-ped14-webhook-ack-async.md` — nota sobre o header `Authorization` no Step 3 de validação manual (linha ~897-907).
- **Modify** `docs/superpowers/plans/2026-08-27-ped34-35-observabilidade-dashboard-slo.md` — mesma nota no Step 3 (linha ~273-284).
- **Test:** sem lógica de código pra testar com framework. Verificação é reprodução manual contra o stack local real (`supabase start` de fato rodando) — cada task tem seu próprio passo de verificação abaixo.

---

### Task 1: PED-52 — `supabase start` falha ao subir `logflare`/`realtime`

**Files:**
- Create: `docs/DEV_LOCAL.md` (seção "Containers que podem falhar no primeiro boot")

**Interfaces:**
- Produces: `docs/DEV_LOCAL.md` com um H1 e a primeira seção (`## Pré-requisitos`, `## Subindo o stack completo`) — Task 2 e Task 3 adicionam seções a este mesmo arquivo.

- [x] **Step 1: Reproduzir e capturar evidência real**

Rodar (Docker Desktop já precisa estar de pé):

```bash
supabase stop
supabase start
```

Se `logflare` e/ou `realtime` falharem: capturar o erro exato de `docker logs supabase_logflare_Nexofy_Admin` (ou nome equivalente de container reportado pelo CLI). Se **não** falhar (o issue original já registra que um retry costuma resolver — é uma race condition conhecida da própria CLI, [issue supabase/cli#1177](https://github.com/supabase/cli/issues/1177): Logflare tenta conectar no schema `_analytics` antes dele existir), rodar `supabase stop && supabase start` de novo do zero (volume limpo) pra confirmar se falha consistentemente na primeira tentativa.

**Resultado real:** falha determinística nesta máquina (2 tentativas seguidas, mesmo erro nas duas — não é a race condition intermitente do issue supabase/cli#1177):
```
supabase_analytics_Nexofy_Admin container logs:
./logflare: 27: .: cannot open /opt/app/rel/logflare/releases//env.sh: No such file
supabase_realtime_Nexofy_Admin container logs:
{"_tag":"Error","error":{"code":"LegacyHealthCheckTimeoutError","message":"supabase_analytics_Nexofy_Admin container is not ready: unhealthy\nsupabase_realtime_Nexofy_Admin container is not ready: unhealthy"}}
```
Imagem confirmada: `public.ecr.aws/supabase/logflare:1.50.2` — bug no script de boot do release Elixir (`$RELEASE_VSN` vazio → `releases//env.sh`), bug da imagem, não deste repositório. Detalhes registrados em `docs/DEV_LOCAL.md`.

- [x] **Step 2: Confirmar se `--exclude` ou retry simples resolve**

Testar as duas saídas documentadas no issue original:

```bash
supabase start --exclude logflare,realtime
```

Confirmar que os serviços restantes (Postgres, PostgREST, Auth, Storage, Kong, edge-runtime) sobem normalmente e respondem — `supabase status` deve listar todos como rodando.

- [x] **Step 3: Criar `docs/DEV_LOCAL.md` com as seções iniciais**

(Conteúdo final ajustado com o erro real capturado no Step 1 acima — ver arquivo.)

```markdown
# Rodando o stack Supabase completo localmente

Guia para quem precisa testar **migrations ou Edge Functions localmente**
(não apenas rodar o front-end contra staging — para isso, veja a seção
"Como rodar localmente" do [`README.md`](../README.md)).

## Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) rodando
- Supabase CLI (`npm install -g supabase` ou `scoop`/`brew` conforme o SO)

## Subindo o stack completo

```bash
supabase start
```

Sobe Postgres, PostgREST, Auth, Storage, Kong (gateway), edge-runtime,
Studio, Realtime e Analytics (Logflare) em containers Docker locais,
aplicando todas as migrations de `supabase/migrations/` do zero.

### Containers que podem falhar no primeiro boot (`logflare` / `realtime`)

Descoberto durante a validação manual do PED-34 ([PED-52](https://linear.app/pedro-schuster/issue/PED-52/dev-local-supabase-start-falha-ao-subir-o-container-logflare)).
`supabase start` pode falhar ao subir os containers `logflare` (analytics)
e `realtime` na primeira tentativa contra um volume novo — é uma race
condition conhecida da própria Supabase CLI, não deste repositório
([supabase/cli#1177](https://github.com/supabase/cli/issues/1177)):
o Logflare tenta se conectar ao schema `_analytics` antes dele terminar
de ser criado.

**Se acontecer, na ordem:**
1. Tente `supabase stop && supabase start` de novo — no fluxo relatado, a
   segunda tentativa normalmente sobe sem problema.
2. Se persistir, suba sem esses dois serviços (suficiente para testar
   migrations/Edge Functions — só perde os logs agregados do Studio e
   realtime de tabelas):
   ```bash
   supabase start --exclude logflare,realtime
   ```

Nenhum impacto em staging/produção — ambos já rodam a infraestrutura
gerenciada da Supabase, não o stack local via Docker.
```

- [x] **Step 4: Verificar**

Confirmado: `docs/DEV_LOCAL.md` renderiza corretamente, links conferidos.

- [x] **Step 5: Commit**

Ajuste vs. plano original: `docs/DEV_LOCAL.md` foi escrito de uma vez só, já com as 3 seções (o conteúdo de cada seção só ficou definitivo depois da verificação ao vivo de cada task, então não fazia sentido commitar 3 vezes o mesmo arquivo em fatias artificiais). Commitado junto com o link do `README.md` (que também não é específico de nenhuma task):

```bash
git add docs/DEV_LOCAL.md README.md
git commit -m "docs(dev-local): adiciona guia de setup do stack Supabase local (PED-52/53/54)"
```

---

### Task 2: PED-53 — `service_role` sem GRANT nas tabelas `public`

**Files:**
- Create: `supabase/seed.sql`
- Modify: `docs/DEV_LOCAL.md` (adiciona seção após a criada na Task 1)

**Interfaces:**
- Consumes: `docs/DEV_LOCAL.md` criado na Task 1 (adiciona uma seção nova ao final).

- [x] **Step 1: Confirmar a causa raiz no schema atual**

Já confirmado por leitura estática de `supabase/migrations/00000000000000_baseline_current_schema.sql`: existem 30 `grant EXECUTE on function ... to service_role` (linhas 1802-1831), mas **nenhum** `grant select/insert/update/delete ... to service_role` em nenhuma tabela, e nenhum `alter default privileges` para `service_role` em lugar nenhum do arquivo. Isso bate com o achado do PED-53 (`service_role` só tem `TRUNCATE`, `REFERENCES`, `TRIGGER` via `information_schema.role_table_grants`) — esses GRANTs de tabela são provisionados pela plataforma hospedada da Supabase na criação do projeto (fora do que um dump de schema `public` captura), não pelas migrations do usuário.

Confirmar ao vivo (stack local rodando, sem o seed ainda):

```bash
supabase db reset
```

```sql
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'service_role' and table_schema = 'public'
order by table_name, privilege_type;
```

Esperado (reproduzindo o achado do issue): só `TRUNCATE`/`REFERENCES`/`TRIGGER` por tabela, sem `SELECT`/`INSERT`/`UPDATE`/`DELETE`.

**Resultado real:** confirmado por leitura estática da baseline (sem precisar de `db reset` pra provar a ausência — zero ocorrências de `grant select/insert/update/delete` ou `alter default privileges` pra `service_role` no arquivo inteiro). A verificação ao vivo do estado corrigido aconteceu direto no Step 3, depois do `seed.sql` já existir.

- [x] **Step 2: Criar `supabase/seed.sql`**

```sql
-- supabase/seed.sql
--
-- Fixture local-only: NUNCA versionar isto como migration
-- (supabase/migrations/). Motivo (PED-53): `supabase db dump` (que gerou
-- 00000000000000_baseline_current_schema.sql) não captura GRANTs de
-- tabela para roles reservadas (service_role/anon/authenticated) — a
-- plataforma hospedada da Supabase provisiona esses GRANTs na criação do
-- projeto, fora do schema `public` que o dump exporta. Um `supabase start`
-- local, rodando só as migrations deste repo do zero, não recebe esse
-- bootstrap — sem isto, toda Edge Function que usa o client service_role
-- (a maioria) falha com 42501 (permission denied) ao ler/gravar qualquer
-- tabela. Reproduzir só localmente evita sobrescrever grants
-- possivelmente mais restritivos que staging/produção já tenham.
--
-- Roda automaticamente após as migrations em `supabase start` / `db reset`
-- (config.toml: [db.seed] sql_paths = ["./seed.sql"]).

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Cobre tabelas criadas por migrations futuras sem precisar tocar neste
-- arquivo de novo.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
```

- [x] **Step 3: Verificar**

```bash
supabase db reset
```

Repetir a query do Step 1 — esperado agora `SELECT`, `INSERT`, `UPDATE`, `DELETE` (além de `TRUNCATE`/`REFERENCES`/`TRIGGER`) para `service_role` em `webhook_events`, `mensalidades`, `alunos`, `estudios` (e demais tabelas de `public`).

**Resultado real, via `docker exec supabase_db_Nexofy_Admin psql -U postgres`:**
```
   table_name   |                          privileges
----------------+---------------------------------------------------------------
 alunos         | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
 estudios       | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
 mensalidades   | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
 webhook_events | DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
(4 rows)
```
Confirmado: as 4 tabelas citadas no PED-53 agora têm `SELECT`/`INSERT`/`UPDATE`/`DELETE` para `service_role`. Fix funcionando.

- [x] **Step 4: Adicionar seção ao `docs/DEV_LOCAL.md`**

(Já incluído no arquivo único escrito na Task 1, Step 3 — ver seção "`service_role` sem acesso às tabelas — resolvido automaticamente".)

- [x] **Step 5: Commit**

```bash
git add supabase/seed.sql
git commit -m "fix(dev-local): concede GRANTs de tabela a service_role via seed.sql local (PED-53)"
```

---

### Task 3: PED-54 — `functions serve` não respeita `verify_jwt = false` per-function

**Files:**
- Modify: `docs/superpowers/plans/2026-08-26-ped14-webhook-ack-async.md:897-907`
- Modify: `docs/superpowers/plans/2026-08-27-ped34-35-observabilidade-dashboard-slo.md:275-283`
- Modify: `docs/DEV_LOCAL.md` (adiciona seção final)
- Modify: `README.md` (link pro guia novo)

**Interfaces:**
- Consumes: `docs/DEV_LOCAL.md` (Task 1 + Task 2).

- [x] **Step 1: Isolar a causa raiz — comparar function declarada só via config.toml próprio vs. declarada também no config.toml raiz**

`supabase/config.toml` (raiz) só declara `[functions.lembretes-aula]` e
`[functions.criar-subconta-asaas]`. `webhook-pagamento`,
`gerar-mensalidades`, `gerar-repasses-mensais` e
`relatorio-reconciliacao-financeira` só têm `verify_jwt = false` no
`config.toml` **dentro da própria pasta da function**
(`supabase/functions/<nome>/config.toml`) — `lembretes-aula` tem os dois,
redundantemente. A documentação oficial da Supabase, até a versão da CLI
usada aqui (2.115.0), só descreve blocos `[functions.<nome>]` no
`config.toml` raiz como mecanismo suportado — não há confirmação de que
`config.toml` por-function seja lido pelo `functions serve`/`start` desta
versão.

Testar isso diretamente (stack local rodando, sem `Authorization` header em nenhum dos dois):

```bash
supabase start
```

```bash
# 1) lembretes-aula: declarada TAMBÉM no config.toml raiz
curl -i -X POST http://127.0.0.1:54321/functions/v1/lembretes-aula \
  -H "Content-Type: application/json" -d '{}'

# 2) webhook-pagamento: só tem verify_jwt=false no config.toml da própria pasta
curl -i -X POST http://127.0.0.1:54321/functions/v1/webhook-pagamento \
  -H "Content-Type: application/json" -d '{}'
```

- Se (1) passar do gate (não devolve `UNAUTHORIZED_NO_AUTH_HEADER`) e (2)
  devolver 401 do gateway: confirma que **`config.toml` por-function não é
  lido** por este CLI — só o bloco no `config.toml` raiz vale, e isso
  afeta as 4 functions que só têm config por-function, não só
  `webhook-pagamento`, e afeta `supabase start` também (não só
  `functions serve <nome>` como o issue original testou).
- Se ambas devolverem 401: a causa é outra (ex.: regressão específica de
  versão) — não documentar a hipótese acima, investigar o log do
  container `supabase-kong`/`edge-runtime` (`docker logs`) antes de
  escrever a Step 3.

Anotar o resultado real aqui antes de prosseguir para a Step 2.

**Resultado real: a hipótese foi refutada.** As duas functions devolveram o **mesmo** 401 `UNAUTHORIZED_NO_AUTH_HEADER` — incluindo `lembretes-aula`, que já está declarada com `verify_jwt = false` no `config.toml` raiz. Repeti o teste de duas formas adicionais pra isolar de vez: (a) via `supabase functions serve` (todas as functions, servidor dev separado do `edge-runtime` do `start`) — mesmo resultado nas duas functions; (b) adicionando `-H "Authorization: Bearer <ANON_KEY local>"` — aí sim ambas passam do gate e chegam no código (`lembretes-aula` devolveu 400 de validação própria da function, não mais 401 do gateway).

Conclusão: **não é sobre `config.toml` por-function vs. raiz, nem sobre `functions serve` vs. `start`.** É um comportamento uniforme do gateway local (Kong + edge-runtime deste stack): toda invocação de function exige um `Authorization`/`apikey` válido, independente do `verify_jwt` declarado em qualquer lugar. `verify_jwt = false` parece só ter efeito no gateway da plataforma hospedada (via `supabase functions deploy`), não no stack local. Isso é mais abrangente do que o issue original registrou (que só testou `webhook-pagamento` via `functions serve <nome>`) — afeta **toda** function testada localmente, não só as que usam `config.toml` por-function.

- [x] ~~**Step 2: Confirmar o fix — declarar `webhook-pagamento` também no `config.toml` raiz**~~ — **pulado**, conforme a condição já prevista abaixo: a Step 1 não confirmou a hipótese (já que `lembretes-aula`, declarada no `config.toml` raiz, falha do mesmo jeito), então declarar as 4 functions lá não teria corrigido nada. Indo direto para a Step 3 (documentar o workaround).

(Instruções originais desta Step — declarar as 4 functions no `config.toml` raiz — omitidas aqui porque a Step 1 já refutou a premissa: `lembretes-aula` já está declarada lá e falha do mesmo jeito. Nenhuma edição de `config.toml` foi feita.)

- [x] **Step 3: Adicionar o header `Authorization` nos dois plans de validação manual (necessário de qualquer forma, já que o gateway local gateia toda function, com ou sem `config.toml`)**

Em `docs/superpowers/plans/2026-08-26-ped14-webhook-ack-async.md`, no Step 3 (por volta da linha 897-907), trocar o bloco de comando por:

````markdown
```bash
supabase functions serve webhook-pagamento --env-file supabase/.env.local
```

> Mesmo com `verify_jwt = false`, inclua `-H "Authorization: Bearer
> <SUPABASE_ANON_KEY local>"` no `curl` abaixo — o gateway local
> (Kong/edge-runtime) pode devolver 401 `UNAUTHORIZED_NO_AUTH_HEADER`
> antes mesmo de chamar a function sem esse header. Não muda o
> comportamento da function em si (quem valida a chamada de verdade é o
> `asaas-access-token`). Detalhes: [PED-54](https://linear.app/pedro-schuster/issue/PED-54/dev-local-supabase-functions-serve-nome-env-file-nao-respeita-verify).

Em outro terminal, envie o mesmo evento duas vezes (troque `SEU_TOKEN` e `pay_teste123` por um `asaas_payment_id` real de uma mensalidade de teste no seu banco local):

```bash
curl -s -X POST http://localhost:54321/functions/v1/webhook-pagamento \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_ANON_KEY_LOCAL" \
  -H "asaas-access-token: SEU_TOKEN" \
  -d '{"event":"PAYMENT_CONFIRMED","dateCreated":"2026-08-26T10:00:00Z","payment":{"id":"pay_teste123","status":"CONFIRMED"}}'
```
````

Em `docs/superpowers/plans/2026-08-27-ped34-35-observabilidade-dashboard-slo.md`, no Step 3 equivalente (por volta da linha 275-283), aplicar a mesma nota + adicionar `-H "Authorization: Bearer $SUPABASE_ANON_KEY_LOCAL"` ao `curl` existente.

Feito nos dois arquivos, com a nota já refletindo o achado real (não específico de `webhook-pagamento`).

- [x] **Step 4: Adicionar seção final ao `docs/DEV_LOCAL.md`**

(Já incluído no arquivo único da Task 1 — seção "Testando Edge Functions localmente: sempre inclua `Authorization`, mesmo com `verify_jwt = false`", com o achado real de que isso vale pra toda function, não só as com `verify_jwt = false`.)

- [x] **Step 5: Adicionar link no `README.md`**

(Feito junto com a Task 1 — ver seção "Ao final das 3 tasks" pra o commit.)

- [x] **Step 6: Verificar**

Relidos os dois plans modificados e `docs/DEV_LOCAL.md` de ponta a ponta — os três documentos contam a mesma história (mesmo achado, mesmo link pro PED-54), sem placeholders órfãos.

- [x] **Step 7: Commit**

```bash
git add docs/superpowers/plans/2026-08-26-ped14-webhook-ack-async.md docs/superpowers/plans/2026-08-27-ped34-35-observabilidade-dashboard-slo.md
git commit -m "docs: exige header Authorization na validacao manual local mesmo com verify_jwt=false (PED-54)"
```

(`supabase/config.toml` não foi alterado — Step 2 foi pulada, ver acima. `docs/DEV_LOCAL.md` e `README.md` já foram commitados junto com a Task 1.)

---

## Ao final das 3 tasks

- [ ] Atualizar os três issues no Linear (PED-52, PED-53, PED-54) para "Done", com um comentário curto linkando o commit/PR relevante em cada um.
- [ ] Seguir a skill `superpowers:finishing-a-development-branch` para decidir como integrar esta worktree (branch `worktree-ped-52-54-dev-local-supabase`) de volta em `main`.
