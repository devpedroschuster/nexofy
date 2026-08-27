# Observabilidade — SLOs informais

> PED-35. Régua informal, não um SLA contratual nem um sistema de alertas — só um alvo por escrito pra saber quando algo está fora do normal.

## Webhook de pagamento (Asaas)

**Meta:** processado (resposta de ack 2xx) em menos de 5 segundos em 99% dos casos.

**Como é medido:** `webhook-pagamento/index.ts` grava `duracao_ms` em `webhook_events` no caminho de sucesso (ver PED-34). O dashboard SuperAdmin (`Saúde do sistema`) mostra o **p95** do mês atual como um proxy dessa meta — não é uma medição direta do p99. Com o volume mensal de webhooks deste app, um p99 calculado teria poucas amostras e seria instável (na prática, próximo do máximo observado); p95 é mais estável e serve como sinal de alerta, mas um p95 dentro da meta não garante formalmente que o p99 também esteja.

## Disponibilidade do app

**Meta:** disponível 99,5% do horário comercial.

**Como é medido:** hoje, não é — é só a meta declarada. Não há monitoramento de uptime automatizado nesta ficha (fora de escopo do PED-35, que pede só a definição por escrito). Se um monitor de uptime vier a ser criado depois, esta é a meta que ele deve reportar contra.
