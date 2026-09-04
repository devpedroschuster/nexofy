# Runbook de incidente — Nexofy

> PED-42 (Frente 6: Plano de Rollback e Runbook de Incidente). Documento
> operacional: o que fazer *durante* um incidente em produção. Pra
> processo de deploy normal (sem incidente), ver `docs/DEPLOY.md`. Pra
> registrar o que aconteceu *depois*, ver `docs/POST_MORTEM_TEMPLATE.md`
> (PED-43).

## 1. Como identificar que há um incidente

Hoje não existe alerta automático/paging (ver `docs/OBSERVABILIDADE.md` —
as metas de SLO são informais, sem monitoramento automatizado de
disponibilidade). Identificação é manual, olhando estes três lugares:

1. **Painel SuperAdmin → "Saúde do sistema"**
   (`webapp/src/pages/SuperAdmin/components/SaudeSistema.jsx`):
   - Card "Mensalidades do mês": se `geradas` muito abaixo de `esperadas`
     no meio/fim do mês, a geração de mensalidades pode estar falhando.
   - Card "Latência webhook (p95)": badge vermelho = p95 acima da meta de
     `docs/OBSERVABILIDADE.md` (5s) — webhook do Asaas processando devagar
     ou com erro.
2. **Sentry** — dois links diretos nos cards de erro da mesma página
   (PED-150): projeto `nexofy-web` (erros do navegador do usuário final) e
   projeto `nexofy-edge-functions` (exceções não tratadas nas Edge
   Functions, via `_shared/sentry.ts` — requer o secret `SENTRY_DSN`
   configurado; se o card de erros parecer vazio demais, confirme que o
   secret não foi removido).
3. **Reclamação de cliente** (suporte/WhatsApp/email) — sinal mais direto
   e mais lento; se um cliente reportou algo, trate como incidente
   confirmado e siga direto pra comunicação (seção 5), mesmo sem
   confirmar ainda a causa técnica.

Se qualquer um dos três indicar problema real (não um pico isolado/falso
positivo), declare incidente e siga as seções abaixo na ordem que fizer
sentido pro caso.

## 2. Como reverter o frontend (Vercel)

Ver `docs/DEPLOY.md`, seção 5 (PED-40) — passo a passo completo de
"Promote to Production" no painel da Vercel (projeto `nexofy`).

Use isto quando o problema está no código do frontend (JS/CSS quebrado,
tela branca, regressão visual/funcional) e o deploy anterior era saudável.

## 3. Como reverter uma migration (se houver "down" preparado)

Ver `docs/DEPLOY.md`, seção 6 (PED-41) e `supabase/migrations-down/README.md`.

Resumo pra quem está sob pressão:

1. Confirme se existe um arquivo em `supabase/migrations-down/` com o
   mesmo timestamp da migration suspeita de causar o problema.
   - **Se não existir:** não há "down" pronto — reverter agora significa
     escrever e testar o SQL reverso na hora, contra staging primeiro,
     nunca direto em produção, mesmo em incidente. Avalie se dá pra
     mitigar de outra forma primeiro (rollback de frontend, seção 2, ou
     pausar processamento, seção 4) enquanto o "down" é escrito com
     calma.
   - **Se existir:** rode o conteúdo do arquivo contra produção via
     `supabase db execute -f supabase/migrations-down/<arquivo>.sql
     --project-ref <ref-de-producao>` (ou cole no SQL Editor do painel).
2. Depois de reverter, confirme (`list_tables` do MCP do Supabase ou
   `\d <tabela>` via psql) que o schema voltou ao esperado antes de
   liberar o incidente como resolvido.

## 4. Como pausar processamento financeiro

**Contexto atual (releia antes de agir, confirmado ao vivo em produção
via `select * from cron.job` em 2026-09-04): existe 1 cron ativo hoje** —
`cobrancas-mensais`, que chama `gerar-mensalidades` todo dia 1 às 11h UTC
(08h horário de Brasília). `gerar-repasses-mensais` continua **sem**
nenhum cron agendado (confirmado na mesma consulta — o `[[cron]]` de
`gerar-repasses-mensais/config.toml` não tem o bloco correspondente em
`supabase/config.toml` da raiz, então não é lido no deploy, mesmo
parecendo pronto no arquivo) e só roda quando alguém clica manualmente em
"Gerar Repasses do Mês" no painel (ver
`supabase/functions/gerar-repasses-mensais/RUNBOOK.md`, PED-18/PED-33).

Ou seja, "pausar" hoje tem **dois caminhos diferentes**, dependendo de
qual fluxo o incidente afeta:

1. **`gerar-repasses-mensais` (ainda manual): é questão de comunicação,
   não de código.** Avise quem tem acesso admin (hoje, só um usuário) pra
   não clicar em nenhum botão de geração financeira (Comissões → "Gerar
   Repasses do Mês") até o incidente ser resolvido. Isso sozinho já pausa
   100% desse fluxo.
2. **`gerar-mensalidades` (cron ativo desde PED-68): pausar exige ação
   técnica real, não só disciplina.** O cron dispara sozinho todo dia 1,
   08h BRT, sem intervenção manual — "avisar pra não clicar" não pausa
   nada aqui. Revogue o secret que autentica a chamada, `CRON_SECRET`
   (`supabase secrets unset CRON_SECRET` ou defina um valor novo que
   ninguém mais conhece) no projeto de produção. Isso quebra apenas a
   chamada automatizada (`x-cron-secret`) sem afetar chamadas manuais de
   admin (que usam JWT, um caminho de autenticação separado — ver
   comentário "AUTORIZAÇÃO" em
   `supabase/functions/gerar-mensalidades/index.ts`). Depois de resolvido
   o incidente, redefina `CRON_SECRET` com o valor esperado pela function
   pra reativar o cron.
3. **Se `gerar-repasses-mensais` ganhar um cron real no futuro** (hoje não
   tem, ver acima): mesma técnica do item 2 — revogar `CRON_SECRET` pausa
   os dois de uma vez, já que compartilham o mesmo secret.
4. **Webhook de pagamento (`webhook-pagamento`) é diferente — normalmente
   NÃO deve ser pausado:** ele só grava status de pagamento e é
   idempotente (`webhook_events` com `UNIQUE event_id`, PED-12/14) — o
   Asaas reentrega automaticamente em caso de falha, então pausar esse
   webhook só atrasa a atualização de status sem necessidade, e cria uma
   fila de reentregas pra processar depois. Só pause-o (revogando
   `ASAAS_WEBHOOK_TOKEN`) se o incidente for especificamente nessa
   function causando dano ativo (ex.: um bug gravando status errado) — não
   como precaução genérica.
5. **Último recurso (evite, é lento de reverter):** `supabase functions
   delete <nome-da-function>` remove a function do ar até o próximo
   deploy. Só use se as opções acima não bastarem — redesplegar depois
   exige rodar o deploy de novo (`supabase functions deploy`), não é
   instantâneo como as opções acima.

## 5. Como comunicar o cliente

Template base — copiar, preencher os `[colchetes]`, revisar antes de
enviar (não mandar com placeholder sem preencher):

> Olá! Identificamos uma instabilidade em [funcionalidade afetada] a
> partir de [horário aproximado]. Já estamos trabalhando na correção e
> não é necessário nenhuma ação da sua parte agora. Assim que estiver
> resolvido, avisamos por aqui. Se você notar algo relacionado a isso nas
> próximas horas ([ex.: cobrança duplicada, repasse não gerado]), pode
> responder este mesmo email/mensagem que priorizamos.
>
> Pedimos desculpas pelo transtorno.

Regras:
- Envie assim que o incidente for **confirmado** (fim da seção 1), não
  espere a causa raiz — "estamos cientes, resolvendo" é suficiente e é
  melhor que silêncio.
- Se o incidente afetou dado financeiro (cobrança, repasse, mensalidade)
  de cliente pagante, isso **sempre** vira post-mortem depois — ver
  `docs/POST_MORTEM_TEMPLATE.md` (PED-43).
- Avise de novo quando resolver, mesmo que curto: "Resolvido — [o que foi
  a causa, em 1 frase, se já souber]".

## 6. Estúdio travado no 409 "assinatura em andamento" (PED-125)

Sintoma: admin de um estúdio tenta assinar um plano em `/upgrade`, o
cartão foi pra análise de risco da Asaas (`AWAITING_RISK_ANALYSIS`) e
depois foi reprovado, mas toda nova tentativa recebe 409 "Este estúdio já
possui uma assinatura em andamento ou ativa" — sem conseguir tentar de
novo com outro cartão.

Desde este PR, o `webhook-assinatura-nexofy` trata
`PAYMENT_REPROVED_BY_RISK_ANALYSIS` automaticamente: cancela a assinatura
órfã na Asaas e limpa `asaas_subscription_id` do estúdio, destravando o
guard sozinho, normalmente em segundos. Se o admin ainda estiver travado
depois de confirmado que a Asaas já reprovou o pagamento (**painel Asaas
→ Cobranças → busque pelo `asaas_subscription_id` do estúdio**), o motivo
mais provável é entrega do webhook atrasada/falhada, não ausência do
tratamento:

1. Confira no painel da Asaas (conta master) se a assinatura em questão
   já está **cancelada**. Se ainda estiver ativa, não prossiga por aqui —
   cancele-a lá primeiro (`Assinaturas → [assinatura] → Cancelar`), pra
   não deixar uma assinatura solta tentando cobrar de novo no próximo
   ciclo.
2. Confirmada a assinatura cancelada do lado da Asaas, libere o guard
   manualmente via SQL Editor do painel Supabase (produção):
   ```sql
   update estudios
   set asaas_subscription_id = null
   where id = '<estudio_id>'
     and assinatura_status <> 'ativa';
   ```
   O `and assinatura_status <> 'ativa'` é uma trava de segurança —
   garante que o comando nunca mexe num estúdio que já é assinante
   pagante de verdade.
3. Avise o admin que já pode tentar assinar de novo em `/upgrade`.
