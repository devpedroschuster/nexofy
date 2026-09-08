# Retenção/expurgo LGPD — processo e automação

> Referenciado a partir de `index.ts` e `config.toml` desta pasta. PED-176.

## O que esta function faz

Duas rotinas independentes, uma execução por mês:

1. **Anonimização de estúdios cancelados há mais de 5 anos** — `estudios`
   com `status = 'cancelado'`, `cancelado_em` mais antigo que 5 anos e
   `anonimizado_em is null`. Pra cada um, chama a RPC
   `anonimizar_dados_estudio_cancelado`, que zera PII em `alunos`,
   `professores`, `mensalidades`, `estudio_dados_asaas` e no próprio
   `estudios`, e **apaga** (não anonimiza) `leads`. Um estúdio falhar não
   trava os demais — fica registrado em `estudios.detalhes[]` na resposta
   e reportado ao Sentry individualmente.
2. **Expurgo do payload de `webhook_events` com mais de 12 meses** — zera
   só a coluna `payload`, mantém o resto da linha (auditoria sem o corpo
   bruto do evento).

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

## ⚠️ Antes de registrar o cron em PRODUÇÃO

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
      qualquer execução real, e antes de registrar o cron de verdade.
- [ ] Ver a seção "⚠️ Antes de registrar o cron em PRODUÇÃO" acima.
