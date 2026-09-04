# Monitoramento de crons (Sentry Crons)

> Referenciado a partir do comentário de `withCronCheckIn` em
> `_shared/sentry.ts` (PED-33). PED-67: este arquivo tinha ficado de fora
> do commit original que introduziu esse comentário.

`withCronCheckIn` (`_shared/sentry.ts`) já reporta início, sucesso e falha
de cada execução agendada ao Sentry Crons — isso cobre tanto "a function
rodou e falhou" quanto "a function não rodou no horário esperado" (ver
comentário no próprio arquivo). O que **não** existe por padrão é o
**alerta**: um monitor de cron no Sentry, sozinho, só acumula histórico de
check-ins — ele não notifica ninguém até uma das opções abaixo ser
configurada manualmente na UI do Sentry (não há como fazer isso via código).

**Status atual: alerta ativo, por e-mail.** Confirmado no painel do
monitor no Sentry (Monitors → `nexofy-edge-functions` → "Project Alerts")
que a regra de projeto "Send a notification for high priority issues"
(ação: Email) está conectada e se aplica às issues geradas por este
monitor — não é preciso nenhuma Alert Rule adicional filtrando por
`monitor.slug` pra cobrir o cenário do PED-33. Discord/Slack não são
usados de propósito (decisão do time — só e-mail mesmo); se isso mudar no
futuro, use a Opção 2 abaixo pra rotear pra um desses canais.

Monitor ativo hoje na conta do Sentry: só `gerar-mensalidades` (slug =
`CRON_MONITOR_SLUG` em `gerar-mensalidades/index.ts`), chamado pelo único
cron agendado em produção (`cobrancas-mensais`, dia 1 de cada mês).

PED-150: `gerar-repasses-mensais/index.ts` também declara um
`CRON_MONITOR_SLUG` e um `[[cron]]` no próprio `config.toml` da function,
mas esse bloco **não está espelhado** no `supabase/config.toml` da raiz —
não é lido no deploy, mesmo parecendo pronto no arquivo (confirmado via
`select * from cron.job`, ver `docs/RUNBOOK_INCIDENTE.md`). Sem cron real
chamando essa function, `withCronCheckIn` nunca roda e o Sentry nunca
recebe o primeiro check-in — o monitor `gerar-repasses-mensais` não existe
na conta do Sentry. Isso é intencional (`gerar-repasses-mensais` só roda
hoje via clique manual no painel, ver
`supabase/functions/gerar-repasses-mensais/RUNBOOK.md`, PED-18/PED-33), mas
o texto antigo aqui listava os dois monitores como se ambos já
estivessem ativos — dava falsa sensação de cobertura num incidente. Se
`gerar-repasses-mensais` ganhar um cron real de verdade no futuro, repita
a configuração da seção "Ao adicionar um novo cron monitorado" abaixo
pra esse slug.

## Projeto Sentry

`nexofy-edge-functions`, organização `dev-pedro-schuster`
(https://dev-pedro-schuster.sentry.io/).

## Opção 1 — e-mail padrão do monitor

**Project Settings > Crons > `<monitor_slug>`** e ative o alerta por
e-mail do monitor. Mais simples de configurar, mas só serve quem acompanha
por e-mail — não chega no Slack/Discord do time.

## Opção 2 — Slack/Discord via Alert Rule

1. **Alerts > Create Alert Rule**.
2. Tipo de alerta: **Issues**.
3. Condição: filtrar por `monitor.slug equals <monitor_slug>` (uma regra
   por monitor).
4. Action/destino: escolher a integração de Slack ou Discord (webhook) já
   conectada ao workspace do Sentry, e o canal de destino.
5. Salvar e disparar um teste (ex.: chamar a function com o
   `CRON_SECRET` errado de propósito, ou renomeá-lo temporariamente) para
   confirmar que a mensagem chega no canal certo antes de contar com o
   alerta de verdade.

## Ao adicionar um novo cron monitorado

Repita a configuração acima para o novo `monitorSlug` — não há herança
automática entre monitores no Sentry, cada um precisa do alerta
configurado individualmente.
