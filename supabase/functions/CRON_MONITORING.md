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

Monitores hoje (slug = `CRON_MONITOR_SLUG` em cada `index.ts`):
`gerar-mensalidades`, `gerar-repasses-mensais`.

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
