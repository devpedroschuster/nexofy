# Geração mensal de mensalidades — processo e automação

> Referenciado a partir de `index.ts` e `config.toml` desta pasta. PED-68.

## Os dois modos da function

`gerar-mensalidades` opera em dois modos, decididos por `handleRequest()` em
`index.ts` a partir de quem chama e do payload:

1. **Um estúdio** (`estudioId` no payload) — usado tanto pelo painel admin
   quanto pelo cron quando alguém precisar rodar manualmente pra um estúdio
   específico. Autorização: JWT de admin/super_admin daquele estúdio, ou
   `x-cron-secret`.
2. **Todos os estúdios ativos** (sem `estudioId` no payload) — **exclusivo do
   cron** (`x-cron-secret` válido). Sem isso, uma chamada sem `estudioId`
   continua rejeitada com 400. Itera `estudios` com `status='ativo'` e chama
   o núcleo de geração (`gerarMensalidadesDoEstudio`) pra cada um,
   isoladamente — um estúdio falhar não aborta os demais (fica registrado em
   `resultados[]` na resposta e reportado ao Sentry individualmente).

Um admin nunca consegue disparar o modo "todos" pelo frontend: o painel
sempre manda `estudioId` (ver abaixo), e mesmo que alguém chamasse a function
direto sem esse campo, faltaria o `x-cron-secret`.

## Caminho já protegido: painel admin

O botão "Gerar Mensalidades" (página Financeiro, `webapp/src/pages/Financeiro.jsx`):

1. `handleAbrirGerarMensalidades` abre o modal e mostra a contagem de alunos
   ativos do estúdio (`totalAtivos`) antes de confirmar — não é um preview
   financeiro linha-a-linha como o de repasses (`ModalPreviewRepasses`), só
   um número de referência pra quem vai confirmar.
2. Só então `handleGerarMensalidades` chama `gerar-mensalidades` com
   `{ estudioId: idEfetivo, mes, ano }` — sempre o estúdio do usuário logado
   (`idEfetivo`), nunca um valor arbitrário.
3. A segurança contra duplicar cobrança não vem de um preview, e sim da RPC
   `inserir_mensalidades_regulares_idempotente` (dedup por índice único
   parcial) — rodar de novo pro mesmo estúdio/mês não gera duplicata, só
   retorna `geradas: 0` com a mensagem "já geradas".

## Cron (produção)

- Definido em `config.toml` desta pasta, replicado no schedule do pg_cron
  (`cobrancas-mensais`, `0 8 1 * *` — dia 1 de cada mês, 08h, horário do
  servidor Postgres).
- Chama sem `estudioId` de propósito → dispara o modo "todos os estúdios
  ativos" acima.
- `verify_jwt=false` precisa estar no bloco `[functions.gerar-mensalidades]`
  do `supabase/config.toml` da **raiz** do repo — o `config.toml` desta
  pasta sozinho não é suficiente (ver comentário lá, PED-57/PED-68).
- Monitorado via Sentry Cron Monitors (`CRON_MONITOR_SLUG =
  'gerar-mensalidades'`, `withCronCheckIn` em `index.ts`) — um erro
  catastrófico (ex: falha ao listar estúdios ativos) marca o check-in como
  `error`; falhas isoladas de um único estúdio dentro do lote não marcam o
  check-in inteiro como erro, só geram um evento de exceção separado no
  Sentry por estúdio (ver PED-33 se isso precisar de um alerta mais direto).

## Agendar o cron de verdade em produção (feito em 28/08/2026)

Os três passos abaixo (Vault, deploy, `cron.schedule`) foram concluídos em
28/08/2026 — **nunca via `supabase db push`** (que aplicaria a mesma
migration em staging também, e a URL usada é fixa de produção):

1. **Segredo no Vault** — `CRON_SECRET` como *Edge Function secret* (o que
   `index.ts` lê via `Deno.env.get('CRON_SECRET')`) e `CRON_SECRET` no
   **Vault** (`vault.decrypted_secrets`) são duas storages diferentes; o SQL
   do passo 3 lê do Vault. Configurado pelo Pedro (dashboard + SQL Editor).
2. **Deploy da function** — feito via MCP, `verify_jwt=false` confirmado no
   resultado do deploy (version 23). Smoke test sem auth confirmou que o
   request chega no código (400 "estudioId é obrigatório", não um 401 de
   gateway) — prova que `verify_jwt=false` está de fato ativo, não só no
   arquivo local.
3. **Job agendado** — `cron.schedule('cobrancas-mensais', '0 8 1 * *', ...)`
   rodado direto no projeto de produção. Confirmado via `select * from
   cron.job;`: `jobid=1`, `jobname='cobrancas-mensais'`, `active=true`.

```sql
select cron.schedule(
  'cobrancas-mensais',
  '0 8 1 * *',
  $$
  select net.http_post(
    url := 'https://tciiepqmnrrcjnqhspvw.supabase.co/functions/v1/gerar-mensalidades',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

## Verificação PED-56 (29/08/2026) — confirmado contra produção

O PED-56 pediu pra confirmar, contra o projeto Supabase real, se o mecanismo
que roda em produção é o `[[cron]]` declarativo deste `config.toml` (cenário
1: URL com placeholder `<...>` e sem body — quebrado) ou o job `pg_cron`
separado descrito na seção acima (cenário 2: este `config.toml` é só
referência/documentação). Confirmado direto em `tciiepqmnrrcjnqhspvw`:

- `select * from cron.job;` → `jobid=1`, `jobname='cobrancas-mensais'`,
  `schedule='0 8 1 * *'`, `active=true`, `command` chamando a URL real (sem
  placeholder) com `Content-Type: application/json` e `body := '{}'::jsonb` —
  bate exatamente com o modo batch do PED-68 (payload vazio → todos os
  estúdios ativos).
- `select * from cron.job_run_details;` → vazio (esperado: a primeira
  execução real é 01/09/2026 08:00 UTC).
- `select name, created_at from vault.secrets where name = 'CRON_SECRET';` →
  existe, criado em 28/08/2026 21:45 UTC.
- `get_edge_function` (MCP) na function deployada → `verify_jwt: false`
  confirmado no deploy ativo (não só no arquivo local), código idêntico ao
  deste repo (versão 23).

**Conclusão: cenário 2.** O `[[cron]]` deste arquivo nunca foi o mecanismo
real (nem antes nem depois do PED-68) — é só documentação/referência, e já
está anotado como tal nos comentários acima. Os dois problemas que o PED-56
descreveu (placeholder na URL, ausência de body) já tinham sido corrigidos
pelo PED-57/PED-68 antes desta verificação; não havia mais nada quebrado pra
corrigir aqui.

Esta verificação encontrou um problema não relacionado: `cron.timezone` do
banco está em `GMT`, então o job na verdade dispara às 05h de Brasília, não
08h como os comentários acima assumem — o Sentry Cron Monitor (PED-33) vai
marcar isso como "missed" todo mês por ficar 3h fora da `checkinMargin`. Não é
escopo do PED-56 (a geração em si não quebra — 05h ainda é dia 1), registrado
separadamente em PED-75 (corrigido — ver seção abaixo).

**Ainda não feito:** um teste manual autenticado de ponta a ponta do modo
batch (`curl -X POST .../gerar-mensalidades -H 'x-cron-secret: <valor
real>' -H 'Content-Type: application/json'`, conferindo `resultados[]` na
resposta) — não foi possível fazer isso nesta sessão porque o valor de
`CRON_SECRET` nunca foi manuseado por quem implementou (ver seção acima).
O primeiro disparo real será o cron em si, dia 1 do próximo mês, 08h — até
lá, vale rodar esse curl manualmente pra não descobrir um problema só
quando a cobrança automática já tiver disparado. Acompanhar em
`select * from cron.job_run_details order by start_time desc limit 5;`
depois do dia 1, e os Sentry Cron Monitors (`gerar-mensalidades`) pra
alerta de falha.

Pra desligar em uma emergência: `select cron.unschedule('cobrancas-mensais');`.

## Correção PED-75 (29/08/2026) — schedule do pg_cron ajustado

A verificação do PED-56 acima encontrou `cron.timezone = GMT` no banco de
produção, fazendo o job `cobrancas-mensais` (`schedule = '0 8 1 * *'`)
disparar às 08h **UTC** = 05h Brasília, não 08h Brasília como o comentário
em `config.toml` e o `CRON_SCHEDULE` (`timezone: 'America/Sao_Paulo'`) em
`index.ts` assumem — o Sentry Cron Monitor (PED-33) marcaria "missed" todo
mês por ficar 3h fora do `checkinMargin`, mesmo com a function rodando com
sucesso.

Corrigido ajustando só o `schedule` do job já existente, sem tocar em mais
nada (`command`, `active`, a injeção do secret via Vault — tudo idêntico):

```sql
select cron.alter_job(job_id := 1, schedule := '0 11 1 * *');
```

Confirmado via `select * from cron.job where jobname = 'cobrancas-mensais';`:
`jobid=1`, `schedule='0 11 1 * *'`, `active=true`, `command` inalterado.
11h UTC = 8h Brasília — agora bate com o que `index.ts`/o Sentry Cron
Monitor já esperavam, **sem precisar de nenhuma mudança de código ou
redeploy da function**.

Não havia nenhuma execução registrada em `cron.job_run_details` até este
ajuste (a primeira execução real seria só 01/09/2026), então não havia
risco de interromper um disparo em andamento.

Próxima execução real: 01/09/2026, 11h UTC (8h Brasília). Confirmar depois
com `select * from cron.job_run_details where jobid = 1 order by start_time
desc limit 3;` e checar no Sentry que o monitor `gerar-mensalidades` não
aparece mais como "missed".

## Checklist antes de mexer neste cron em produção

- [ ] Confirmar que `CRON_SECRET` está setado nos secrets do projeto de
      produção (`supabase secrets list --project-ref tciiepqmnrrcjnqhspvw`)
      — é compartilhado entre todas as functions que usam esse padrão
      (`lembretes-aula`, `gerar-mensalidades`), não é por-function.
- [ ] Depois de qualquer alteração em `index.ts` ou nos dois `config.toml`
      (raiz e desta pasta), redeployar a function e confirmar
      `verify_jwt=false` no resultado do deploy — não assumir que o arquivo
      local já reflete o que está no ar (ver histórico do PED-57/PED-68:
      ficaram dessincronizados por um tempo sem ninguém notar).
- [ ] Testar o modo batch manualmente contra staging antes de mexer em
      produção (`POST .../gerar-mensalidades -H 'x-cron-secret: ...'` sem
      body) e conferir `resultados[]` na resposta.
- [ ] Novo estúdio criado com `status` diferente de `'ativo'` não entra no
      lote automático — é a mesma definição de "ativo" usada em
      `verificar_status_estudio()`/`estudioBloqueado` no frontend.
