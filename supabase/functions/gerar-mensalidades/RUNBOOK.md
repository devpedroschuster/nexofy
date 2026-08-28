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

## Agendar o cron de verdade em produção (ainda pendente)

Confirmado em 28/08/2026: `cron.job` está vazio — **nenhum cron desta ou de
qualquer outra function já foi agendado de verdade** neste projeto. O
`[[cron]]` em `config.toml` é só documentação/intenção; ele não cria nada
sozinho. Faltam três passos manuais, nessa ordem, **só contra produção**
(`tciiepqmnrrcjnqhspvw`) — nunca via `supabase db push` (que aplicaria a
mesma migration em staging também, e a URL abaixo é fixa de produção):

1. **Confirmar (ou criar) o segredo no Vault** — `CRON_SECRET` como *Edge
   Function secret* (o que `index.ts` lê via `Deno.env.get('CRON_SECRET')`)
   e `CRON_SECRET` no **Vault** (`vault.decrypted_secrets`) são duas
   storages diferentes; o SQL abaixo lê do Vault. Se ainda não existir lá:
   ```sql
   select vault.create_secret('<mesmo valor do Edge Function secret CRON_SECRET>', 'CRON_SECRET');
   ```
2. **Deploy da function** com o código atual deste diretório e
   `verify_jwt=false` (ver bloco `[functions.gerar-mensalidades]` em
   `supabase/config.toml` da raiz) — confirmar no resultado do deploy que
   `verify_jwt` voltou `false`, não assumir.
3. **Agendar o job** (rodar uma vez, direto no SQL Editor do painel Supabase
   do projeto de produção, ou via uma chamada isolada — não como migration
   versionada):
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
   Depois de agendado, confirmar com `select * from cron.job;` e, no próximo
   dia 1, com `select * from cron.job_run_details order by start_time desc limit 5;`.

Recomendação: antes do passo 3, testar o modo batch manualmente (`curl -X
POST .../gerar-mensalidades -H 'x-cron-secret: <valor real>' -H
'Content-Type: application/json'`) contra produção ou staging e conferir
`resultados[]` na resposta, já que este modo ainda não foi exercitado de
ponta a ponta nesta sessão (deploy foi bloqueado pelo classifier de auto
mode do Claude Code).

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
