# Monitor de uptime externo (PED-157)

> Antes desta ficha, a única forma de saber que o site caiu era alguém abrir
> o painel manualmente — não havia nenhum monitor externo batendo em
> produção. Diferente do monitoramento de cron (`supabase/functions/CRON_MONITORING.md`),
> aqui não há nenhuma automação de código possível: criar conta e cadastrar
> monitor num serviço de terceiros só pode ser feito manualmente na UI dele,
> com o celular/e-mail do operador.

## O que monitorar

| Alvo | URL | Por quê |
|---|---|---|
| Site principal | `https://www.nexofy.com.br` | é o que o cliente acessa — se cair, é o sintoma mais direto de indisponibilidade. |
| Health-check da API | `https://<PROJECT_REF_PRODUCAO>.supabase.co/functions/v1/health` | confirma que a Edge Function *e* o banco de produção respondem, não só que a Vercel serve HTML estático. `PROJECT_REF_PRODUCAO` = `tciiepqmnrrcjnqhspvw` (ver `docs/DEPLOY.md`). Só existe depois do deploy da function `health` (`supabase/functions/health/index.ts`). |

O endpoint de health-check é público (`verify_jwt = false`, ver `supabase/config.toml`) de propósito — o UptimeRobot não tem como enviar um JWT do Supabase. Ele não expõe nenhum dado de negócio: só faz uma contagem `HEAD` numa tabela pra confirmar que o banco responde, e devolve `{"status":"ok"}` (200) ou `{"status":"erro"}` (503).

## Passo a passo — UptimeRobot (plano grátis)

1. Criar conta grátis em https://uptimerobot.com (e-mail do operador).
2. **Add New Monitor** → tipo `HTTP(s)` → URL = `https://www.nexofy.com.br` → intervalo de checagem: **5 minutos** (mínimo do plano grátis).
3. Repetir para a URL do health-check (`.../functions/v1/health`) — opcionalmente como monitor tipo **Keyword**, procurando por `"status":"ok"` no corpo da resposta, pra pegar também o caso em que a function responde 200 mas o banco está fora (não deveria acontecer com o código atual, mas é uma segurança extra caso o endpoint mude no futuro).
4. Instalar o app UptimeRobot (iOS/Android), logar com a mesma conta e ativar notificação push — no plano grátis, push pelo app é o único canal de alerta pro celular sem custo (e-mail e Slack também são grátis; SMS/ligação exigem crédito pago). Associar esse "alert contact" aos dois monitores criados no passo 2-3.
5. Testar de verdade antes de confiar no alerta: pausar um dos monitores por ~1 minuto (ou renomear temporariamente a function no Supabase pra forçar um 404) e confirmar que o push chega no celular. Reverter a alteração de teste em seguida.

## Status atual

**Pendente** — depende de uma conta pessoal (e-mail/celular do operador) que só o usuário pode criar; não é algo que possa ser automatizado por código ou CI. Atualizar esta seção (e a "Disponibilidade do app" em `docs/OBSERVABILIDADE.md`) para "ativo" assim que os passos acima forem confirmados manualmente.
