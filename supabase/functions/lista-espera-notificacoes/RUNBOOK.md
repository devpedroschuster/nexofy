# RUNBOOK — lista-espera-notificacoes

Mesmo padrão de `lembretes-aula`/`gerar-mensalidades`: a function só faz o
trabalho quando chamada; quem agenda a chamada é um job `pg_cron` criado
manualmente em cada ambiente — **nunca via `supabase db push`** (que
aplicaria a mesma migration em staging também, e a URL usada no
`cron.schedule` é fixa por ambiente). O bloco `[[cron]]` em `config.toml`
desta pasta é só documentação/referência (confirmado no PED-56, mesma
lição para `gerar-mensalidades`), não o mecanismo real.

## O que a function faz

1. Busca `lista_espera` com `status = 'convertido' AND notificado_em IS NULL`
   (entradas que o trigger `promover_fila_apos_liberar_vaga` já auto-agendou),
   envia um push Expo pra cada uma (reaproveitando `alunos.push_token`, mesmo
   campo usado por `lembretes-aula`) e marca `notificado_em`.
2. Marca como `expirado` (motivo `data_passada`) toda entrada `aguardando`
   de uma turma cuja data já passou — limpeza, evita fila "fantasma".

Push é best-effort: só alcança quem já tem o app mobile instalado (ainda
não lançado) — a UI web do aluno (seção "Minha lista de espera" em
`AreaAluno.jsx`) é o canal garantido independente disso.

## Deploy

```bash
supabase functions deploy lista-espera-notificacoes --project-ref <ref-do-ambiente>
```

Depois do deploy, confirmar `verify_jwt=false` no resultado (não assumir
que o arquivo local já reflete o que está no ar — ver o bloco
`[functions.lista-espera-notificacoes]` em `supabase/config.toml` na raiz,
que é o que efetivamente vale, mesma lição do PED-57/PED-68).

## Variáveis de ambiente da function

- `CRON_SECRET` — mesmo segredo compartilhado já usado por
  `lembretes-aula`/`gerar-mensalidades` nesse ambiente (`x-cron-secret`
  header). Não é por-function.
- `ESTUDIO_ID` — só necessária se o cron não enviar `estudioId` no body.

## Agendar o cron de verdade (1x por ambiente)

Sugestão de frequência: a cada 5 minutos.

```sql
select cron.schedule(
  'lista-espera-notificacoes',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := '<SUPABASE_URL_DO_AMBIENTE>/functions/v1/lista-espera-notificacoes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
    ),
    body := jsonb_build_object('estudioId', '<estudio_id_do_ambiente>')
  );
  $$
);
```

Ainda não cobre múltiplos estúdios num único ambiente (diferente do modo
batch de `gerar-mensalidades`) — se um ambiente hospedar mais de um
estúdio, agende um `cron.schedule` por `estudioId`, ou trate isso como
melhoria futura seguindo o padrão `handleBatchTodosEstudios` já existente
em `gerar-mensalidades/index.ts`.

Confirmar depois com `select * from cron.job where jobname =
'lista-espera-notificacoes';` e, após a primeira execução, `select * from
cron.job_run_details where jobid = (select jobid from cron.job where
jobname = 'lista-espera-notificacoes') order by start_time desc limit 5;`.

**Replique este passo em produção somente depois de validar em staging**
(mesma convenção já usada pelas outras cron jobs deste repo).

Pra desligar em uma emergência: `select cron.unschedule('lista-espera-notificacoes');`.
