# Rodando o stack Supabase completo localmente

Guia para quem precisa testar **migrations ou Edge Functions localmente**
(não apenas rodar o front-end contra staging — para isso, veja a seção
"⚙️ Como rodar localmente" do [`README.md`](../README.md)).

## Pré-requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) rodando
- Supabase CLI (`npm install -g supabase` ou `scoop`/`brew` conforme o SO)

## Subindo o stack completo

```bash
supabase start
```

Sobe Postgres, PostgREST, Auth, Storage, Kong (gateway), edge-runtime,
Studio, Realtime e Analytics (Logflare) em containers Docker locais,
aplicando todas as migrations de `supabase/migrations/` e o
[`supabase/seed.sql`](../supabase/seed.sql) do zero.

### `logflare`/`realtime` podem falhar ao subir

Descoberto durante a validação manual do PED-34
([PED-52](https://linear.app/pedro-schuster/issue/PED-52/dev-local-supabase-start-falha-ao-subir-o-container-logflare)).
`supabase start` pode falhar com:

```
supabase_analytics_Nexofy_Admin container logs:
./logflare: 27: .: cannot open /opt/app/rel/logflare/releases//env.sh: No such file
supabase_realtime_Nexofy_Admin container logs:
{"_tag":"Error","error":{"code":"LegacyHealthCheckTimeoutError","message":"supabase_analytics_Nexofy_Admin container is not ready: unhealthy\nsupabase_realtime_Nexofy_Admin container is not ready: unhealthy"}}
```

Confirmado neste repositório (`supabase` CLI 2.115.0, imagem
`public.ecr.aws/supabase/logflare:1.50.2`): o script de boot do release
Elixir do Logflare tenta ler
`releases/$RELEASE_VSN/env.sh`, mas `$RELEASE_VSN` chega vazio nessa
imagem — daí o `releases//env.sh` (barra dupla) e o crash-loop. É um bug
da imagem Docker do Logflare distribuída pela CLI, não deste
repositório, e **é determinístico aqui** (não resolve tentar de novo —
diferente do relato mais comum na comunidade,
[supabase/cli#1177](https://github.com/supabase/cli/issues/1177), onde
costuma passar na segunda tentativa). `realtime` falha junto porque o
health-check da CLI espera os dois ficarem prontos na mesma etapa.

**Workaround:** suba sem esses dois serviços — suficiente pra testar
migrations/Edge Functions; só perde os logs agregados do Studio e
realtime de tabelas:

```bash
supabase start --exclude logflare,realtime
```

Nenhum impacto em staging/produção — ambos rodam a infraestrutura
gerenciada da Supabase, não este stack local via Docker.

### `service_role` sem acesso às tabelas — resolvido automaticamente

Todo `supabase start`/`supabase db reset` num volume novo roda as
migrations e, em seguida, [`supabase/seed.sql`](../supabase/seed.sql),
que concede a `service_role` os privilégios que faltam nas tabelas de
`public`
([PED-53](https://linear.app/pedro-schuster/issue/PED-53/dev-local-service-role-sem-grant-de-selectinsertupdatedelete-nas)).
Sem ele, **toda** Edge Function que usa o client `service_role` (a
maioria — `webhook-pagamento`, `criar-estudio`, `gerar-mensalidades`
etc.) falha na primeira leitura/escrita com:

```
{ code: "42501", message: "permission denied for table <tabela>" }
```

Isso acontece porque a baseline de schema (`00000000000000_baseline_current_schema.sql`,
gerada por `supabase db dump`) só captura `GRANT EXECUTE` nas funções
RPC — os `GRANT`s de tabela para `service_role`/`anon`/`authenticated`
são provisionados pela plataforma hospedada da Supabase na criação do
projeto (staging/produção), fora do que um dump de schema `public`
exporta. Um `supabase start` local, aplicando só as migrations deste
repo, nunca recebe esse bootstrap.

`seed.sql` roda automaticamente — nenhum passo manual necessário, mesmo
depois de um `supabase db reset`. Ele existe deliberadamente fora de
`supabase/migrations/`: uma migration versionada arriscaria sobrescrever,
em staging/produção, grants possivelmente mais restritivos do que os
concedidos aqui.

### Testando Edge Functions localmente: sempre inclua `Authorization`, mesmo com `verify_jwt = false`

Descoberto durante a validação manual do PED-34, testando
`webhook-pagamento`
([PED-54](https://linear.app/pedro-schuster/issue/PED-54/dev-local-supabase-functions-serve-nome-env-file-nao-respeita-verify)).
Um `curl`/Postman sem header `Authorization` contra qualquer function —
mesmo uma com `verify_jwt = false` no `config.toml` — volta 401 do
gateway local antes do código da function rodar:

```
HTTP/1.1 401 Unauthorized
sb-error-code: UNAUTHORIZED_NO_AUTH_HEADER
{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}
```

**Confirmado neste repositório que isso não é específico de
`webhook-pagamento` nem de `functions serve <nome>`:** reproduz igual em
`lembretes-aula` (que declara `verify_jwt = false` tanto no
`config.toml` raiz quanto no `config.toml` da própria pasta) e reproduz
igual via `supabase start` e via `supabase functions serve`. Ou seja,
`verify_jwt = false` não é respeitado pelo gateway local em nenhuma
combinação testada — é uma limitação do stack local da CLI (o `kong.yml`
local não diferencia por function; a diferenciação por `verify_jwt`
parece existir só no gateway da plataforma hospedada). **Não afeta
staging/produção** — lá o deploy real via `supabase functions deploy` é
o caminho usado, não o gateway local.

**Workaround:** inclua sempre um `Authorization: Bearer <anon key
local>` no `curl` de teste, mesmo pra functions com `verify_jwt =
false` — pegue a anon key local em `supabase status` (chave `ANON_KEY`).
Confirmado que isso é suficiente pra passar do gateway e chegar no
código da function; não muda o comportamento real dela — pra
`webhook-pagamento` especificamente, quem autentica de verdade é o
header `asaas-access-token`, verificado dentro do próprio código.
