# Retenção/expurgo LGPD — processo e automação

> Referenciado a partir de `index.ts` e `config.toml` desta pasta. PED-176,
> PED-181 e PED-182 (fast-follows, ver seção dedicada abaixo).

## O que esta function faz

Duas rotinas independentes, uma execução por mês:

1. **Anonimização de estúdios cancelados há mais de 5 anos** — `estudios`
   com `status = 'cancelado'`, `cancelado_em` mais antigo que 5 anos e
   `anonimizado_em is null`. Pra cada um, chama a RPC
   `anonimizar_dados_estudio_cancelado`, que zera PII em `alunos`,
   `professores`, `mensalidades`, `fechamento_comissoes`,
   `estudio_dados_asaas` e no próprio `estudios`, redige o snapshot de PII
   já guardado em `audit_log` desse estúdio, e **apaga** (não anonimiza)
   `leads`. Um estúdio falhar não trava os demais — fica registrado em
   `estudios.detalhes[]` na resposta e reportado ao Sentry individualmente.
2. **Expurgo do payload de `webhook_events` com mais de 12 meses** — zera
   só a coluna `payload`, mantém o resto da linha (auditoria sem o corpo
   bruto do evento).

## PED-181 (conta auth.users) e PED-182 (arquivos no Storage)

A RPC `anonimizar_dados_estudio_cancelado` agora também devolve, além dos
contadores:

- `arquivos_storage_a_remover: [{bucket, path}]` — objetos do Storage do
  próprio projeto que estavam referenciados por `alunos.avatar_url`/
  `link_anamnese`/`fechamento_comissoes.comprovante_url` antes de zerar a
  coluna (URLs externas, coladas manualmente pelo estúdio, não entram
  aqui — `extrair_objeto_storage()` só reconhece o padrão
  `.../storage/v1/object/public/<bucket>/<path>`). A function (`index.ts`)
  chama `supabase.storage.from(bucket).remove([path])` pra cada um,
  **depois** do commit da anonimização no banco — best-effort, uma falha
  aqui (arquivo já removido, path inválido) não desfaz nem trava a
  anonimização, só incrementa `storage.arquivosFalhas` na resposta e loga
  no Sentry.
- `auth_ids_a_remover: [uuid]` — contas `auth.users` que ficaram sem
  NENHUM vínculo ativo (aluno/professor/estudio_membros) em qualquer outro
  estúdio ainda não anonimizado, depois de desvincular (`auth_id = null`)
  as linhas deste estúdio. A function chama
  `supabase.auth.admin.deleteUser(id)` pra cada uma — usa a Admin API (não
  `DELETE` SQL direto em `auth.users`) porque só ela limpa corretamente
  sessions/refresh_tokens/identities internos do GoTrue junto com a conta.

Ambos os passos exigem que a function rode com a `SUPABASE_SERVICE_ROLE_KEY`
(já é o caso — ver `handleRequest` em `index.ts`): `storage.remove()` e
`auth.admin.*` só funcionam com a service role key, nunca com a anon/public
key.

Suporta `?dryRun=true` — calcula e retorna o que *seria* alterado sem
escrever nada. Use sempre antes de uma primeira execução real num
ambiente novo.

## Autorização

Só `x-cron-secret` (mesmo secret usado por `gerar-mensalidades`/
`lembretes-aula`) — não existe caminho de JWT/admin aqui, porque não há
nenhum gatilho manual pelo frontend pra essa rotina.

## Validado em staging (08/09/2026)

Deploy + testes manuais rodados contra um fixture isolado (estúdio de
teste com `cancelado_em` forçado 6 anos no passado, um aluno/professor/
mensalidade/lead vinculados, e uma linha de `webhook_events` com
`recebido_em` forçado 13 meses no passado):

- `dryRun=true` → `estudios.candidatos: 1`, `webhookEvents.elegiveis: 1`,
  nada escrito (confirmado via query direta antes/depois).
- Execução real → `alunos.nome_completo/email/telefone/cpf` nulos,
  `professores.nome = '[dado removido - retenção LGPD]'`,
  `mensalidades.nome_visitante` nulo, `leads` removido (0 linhas
  restantes), `estudios.anonimizado_em` preenchido e PII do próprio
  estúdio nula, `webhook_events.payload` nulo.
- Segunda execução (mesmo fixture) → `estudios.candidatos: 0`,
  `webhookEvents.elegiveis: 0` — confirma idempotência.
- **Nota de limpeza**: `alunos_estudio_id_fkey`/`professores_estudio_id_fkey`/
  a FK de `mensalidades` para `estudios` **não** são `ON DELETE CASCADE`
  (diferente de `leads_estudio_id_fkey`, que é) — apagar um estúdio de
  teste exige apagar `mensalidades`/`professores`/`alunos` dele primeiro,
  senão o `DELETE` em `estudios` falha com violação de FK.

## Cron (produção)

Mesmo padrão de `gerar-mensalidades` (ver aquele RUNBOOK pro histórico
completo do mecanismo): `[[cron]]` em `config.toml` é só documentação — o
que roda de verdade é um job `pg_cron` criado à mão em cada ambiente:

```sql
select cron.schedule(
  'retencao-lgpd-mensal',
  '0 5 1 * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/expurgo-retencao-lgpd',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'CRON_SECRET')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Pra desligar em uma emergência: `select cron.unschedule('retencao-lgpd-mensal');`.

## Registrado em produção (08/09/2026)

`jobid=3`, `jobname='retencao-lgpd-mensal'`, `schedule='0 5 1 * *'`,
`active=true` — confirmado via `select * from cron.job where jobname =
'retencao-lgpd-mensal';`. `cron.timezone` do banco é `GMT` (=UTC), então
`05h` no schedule já é 05h UTC = 2h Brasília, sem o desvio de fuso que a
PED-75 encontrou em `cobrancas-mensais`. Antes de registrar, `dryRun=true`
contra produção confirmou `estudios.candidatos: 0` e
`webhookEvents.elegiveis: 0` — nenhum efeito imediato no primeiro disparo
real (01/10/2026, 05h UTC).

## ⚠️ Antes de mexer de novo neste cron em PRODUÇÃO

- **A primeira execução real (`dryRun=false`) em produção zera
  `webhook_events.payload` de tudo que tiver mais de 12 meses — isso é
  irreversível.** Rode `?dryRun=true` contra produção primeiro e
  confira `webhookEvents.elegiveis` antes de registrar o cron ou disparar
  uma execução real manualmente. Peça confirmação explícita de quem está
  operando antes desse primeiro `dryRun=false` em produção.
- A anonimização de estúdios cancelados (Stream A) **não** tem esse
  risco imediato: como `cancelado_em` foi *backfilled* pra `now()` na
  migration (PED-176), nenhum estúdio já cancelado hoje vai ser
  processado antes de completar 5 anos a partir do deploy — é seguro
  registrar essa parte do cron a qualquer momento.
- **`CRON_SECRET` compartilhado entre ambientes**: o valor usado hoje é o
  mesmo em staging e produção (rotacionado em 08/09/2026 — ver PED-176).
  Isso funciona, mas é uma superfície de risco a mais (vazamento em
  staging autentica produção também); considerar valores distintos por
  ambiente numa próxima rotação. **Sempre que o `CRON_SECRET` for
  rotacionado, atualize os DOIS lugares**: o Edge Function secret
  (Settings → Edge Functions → Secrets) **e** o valor em
  `vault.decrypted_secrets` que o job `pg_cron` lê — são storages
  diferentes, e o `cron.schedule` acima só funciona se os dois baterem.

## Checklist antes de mexer neste cron em produção

- [ ] Confirmar que `CRON_SECRET` está setado nos secrets de produção
      (compartilhado com `gerar-mensalidades`/`lembretes-aula`) **e** que
      o valor no Vault (`vault.decrypted_secrets`) bate com o Edge
      Function secret atual.
- [ ] Depois de qualquer alteração em `index.ts` ou nos dois `config.toml`
      (raiz e desta pasta), redeployar e confirmar `verify_jwt=false` no
      resultado do deploy.
- [ ] Rodar `?dryRun=true` contra staging e depois produção antes de
      qualquer execução manual real.
- [ ] Ver a seção "⚠️ Antes de mexer de novo neste cron em PRODUÇÃO" acima.
- [ ] Depois do primeiro disparo real (01/10/2026), conferir
      `select * from cron.job_run_details where jobid = 3 order by
      start_time desc limit 3;` e o Sentry Cron Monitor
      `retencao-lgpd-mensal` pra confirmar que rodou.
