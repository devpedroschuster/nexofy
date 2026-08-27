# PED-34 / PED-35 — Dashboard de saúde básico + SLOs informais (Observabilidade)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SuperAdmin ganha uma seção "Saúde do sistema" com 3 métricas simples (mensalidades geradas vs esperado no mês, p95 de latência do webhook de pagamento, link direto pros erros de Edge Functions no Sentry), e o projeto ganha um documento curto com as metas informais (SLOs) contra as quais essas métricas são lidas.

**Architecture:** Duas RPCs Postgres novas (`mensalidades_geradas_vs_esperado_mes`, `latencia_webhook_pagamento_mes`) seguem exatamente o padrão de `receita_total_paga()` já usado por `metricasGlobais` (STABLE SECURITY DEFINER, gate `eh_super_admin()`, grants restritos a `authenticated`). A latência do webhook não existe em lugar nenhum hoje (tracing de performance do Sentry está desligado de propósito, free tier) — `webhook-pagamento/index.ts` passa a gravar `duracao_ms` na própria linha de `webhook_events` já inserida pela idempotência do PED-14, só no caminho de sucesso. O erro de Edge Functions não ganha número novo no app: um card linka direto pro Sentry (decisão de escopo confirmada no brainstorming, para não introduzir um proxy de API externa nova). Frontend: `MetricCard` é extraído de `MetricasGlobais.jsx` pra ser reaproveitado por um novo `SaudeSistema.jsx`, renderizado na mesma página do SuperAdmin.

**Tech Stack:** Postgres/PL-pgSQL (migration), Deno Edge Functions (Supabase), React + TanStack Query + Vite, Vitest (lógica pura, sem testing-library — não existe no projeto).

**Spec:** Tickets Linear [PED-34](https://linear.app/pedro-schuster/issue/PED-34/observabilidade-dashboard-de-saude-basico-erro-de-edge-functions) ("Métricas simples: taxa de erro de Edge Functions, latência do webhook, número de mensalidades geradas vs esperado no mês") e [PED-35](https://linear.app/pedro-schuster/issue/PED-35/observabilidade-definir-slos-informais-webhook-disponibilidade-do-app) ("Definir por escrito... 'webhook de pagamento processado em <5s em 99% dos casos', 'app disponível 99.5% do horário comercial'"). Desenho aprovado em chat (brainstorming) em 2026-08-27: erro de Edge Function = link pro Sentry (não número via API nova); dashboard vive na página SuperAdmin existente (não aba nova); latência do webhook é gravada em `webhook_events.duracao_ms` (não tracing do Sentry).

## Global Constraints

- RPCs novas seguem **exatamente** o padrão de `receita_total_paga()` (`supabase/migrations/00000000000000_baseline_current_schema.sql:1155-1173`): `STABLE SECURITY DEFINER`, `SET search_path TO 'public'`, gate `if not eh_super_admin() then raise exception 'access denied' using errcode = '42501'; end if;`, e grants explícitos (`REVOKE ... FROM PUBLIC` + `GRANT ... TO authenticated`) — sem isso a função fica executável por `PUBLIC` por padrão do Postgres.
- `webhook-pagamento/index.ts` já foi hardenizado no PED-14 (idempotência, ordem, ack rápido) — a mudança de `duracao_ms` é estritamente aditiva: não muda nenhum `return` existente, não move a inserção de `webhook_events`, só adiciona um UPDATE antes do ack.
- Não ligar `tracesSampleRate` do Sentry (continua 0 — decisão de custo já registrada em `_shared/sentry.ts:23`) e não criar proxy de API do Sentry nesta ficha — o card de erro de Edge Function é só um link.
- Não existe `@testing-library/react` (nem qualquer runner de teste de componente) neste projeto — não introduzir essa infraestrutura aqui. Vitest já é usado para lógica pura em `webapp/src/lib/*.test.js`; qualquer lógica nova com ramificação (ex.: comparação contra SLO) deve ser extraída pra uma função pura testável nesse mesmo padrão. Componentes React são validados manualmente (dev server / browser), igual o resto do projeto.
- Migration é testada **localmente** (`supabase start` + `supabase migration up` ou `db reset`) contra o stack local — não aplicar diretamente em staging/produção. Promoção pra staging/prod segue o gate de CI (`db-diff`, PED-30) já existente, acionado no merge, não manualmente.
- `.gitattributes` marca `supabase/migrations/*.sql -text` (sem normalização de line-ending pelo git) — o gate `db-diff` do PED-30 compara bytes exatos contra staging. Criar o arquivo da migration com `Write` normalmente (sem editor/ferramenta que reescreva line endings) é suficiente; não rodar nenhum passo extra de "normalização" nesse arquivo.
- `webhook_events` tem `revoke all from anon, authenticated` (só service role acessa) — por isso `latencia_webhook_pagamento_mes()` PRECISA ser `SECURITY DEFINER` pra conseguir ler a tabela por baixo do gate de `eh_super_admin()`.

---

## File Structure

- **Create** `docs/OBSERVABILIDADE.md` — as duas metas informais do PED-35, por escrito.
- **Create** `supabase/migrations/20260827171659_observabilidade_dashboard_slo.sql` — coluna `webhook_events.duracao_ms` + as duas RPCs + grants.
- **Modify** `supabase/functions/webhook-pagamento/index.ts` — grava `duracao_ms` antes do ack.
- **Create** `webapp/src/components/ui/MetricCard.jsx` — card de métrica genérico, extraído de `MetricasGlobais.jsx`.
- **Modify** `webapp/src/pages/SuperAdmin/components/MetricasGlobais.jsx` — passa a importar `MetricCard` em vez de definir localmente.
- **Create** `webapp/src/pages/SuperAdmin/components/saudeSistemaHelpers.js` + **Test** `saudeSistemaHelpers.test.js` — meta do SLO (5000ms) e formatação, como funções puras testáveis.
- **Modify** `webapp/src/services/superAdminService.js` — nova função `saudeSistema()`.
- **Create** `webapp/src/pages/SuperAdmin/components/SaudeSistema.jsx` — os 3 cards.
- **Modify** `webapp/src/pages/SuperAdmin/pages/SuperAdminDashboard.jsx` — renderiza `<SaudeSistema />`.

---

### Task 1: Documentar SLOs informais (PED-35)

**Files:**
- Create: `docs/OBSERVABILIDADE.md`

**Interfaces:**
- Produces: o texto canônico das duas metas (webhook <5s em 99%, app 99,5% disponível no horário comercial), citado literalmente pelo badge do Task 5/7 e pela constante `WEBHOOK_SLO_MS` do Task 5.

- [ ] **Step 1: Criar `docs/OBSERVABILIDADE.md`**

```markdown
# Observabilidade — SLOs informais

> PED-35. Régua informal, não um SLA contratual nem um sistema de alertas — só um alvo por escrito pra saber quando algo está fora do normal.

## Webhook de pagamento (Asaas)

**Meta:** processado (resposta de ack 2xx) em menos de 5 segundos em 99% dos casos.

**Como é medido:** `webhook-pagamento/index.ts` grava `duracao_ms` em `webhook_events` no caminho de sucesso (ver PED-34). O dashboard SuperAdmin (`Saúde do sistema`) mostra o p95 do mês atual contra essa meta.

## Disponibilidade do app

**Meta:** disponível 99,5% do horário comercial.

**Como é medido:** hoje, não é — é só a meta declarada. Não há monitoramento de uptime automatizado nesta ficha (fora de escopo do PED-35, que pede só a definição por escrito). Se um monitor de uptime vier a ser criado depois, esta é a meta que ele deve reportar contra.
```

- [ ] **Step 2: Ler o arquivo de volta e conferir que os dois números batem com o ticket (PED-35: "<5s em 99% dos casos", "99.5% do horário comercial")**

- [ ] **Step 3: Commit**

```bash
git add docs/OBSERVABILIDADE.md
git commit -m "docs(observabilidade): define SLOs informais de webhook e disponibilidade (PED-35)"
```

---

### Task 2: Migration — coluna de latência + RPCs de métricas

**Files:**
- Create: `supabase/migrations/20260827171659_observabilidade_dashboard_slo.sql`

**Interfaces:**
- Produces:
  - Coluna `public.webhook_events.duracao_ms integer` (nullable) — consumida pelo Task 3 (grava) e pela RPC abaixo (lê).
  - `public.mensalidades_geradas_vs_esperado_mes() RETURNS TABLE(esperado bigint, gerado bigint)` — consumida pelo Task 6.
  - `public.latencia_webhook_pagamento_mes() RETURNS TABLE(p95_ms numeric, media_ms numeric, amostras bigint)` — consumida pelo Task 6.

- [ ] **Step 1: Criar a migration**

```sql
-- supabase/migrations/20260827171659_observabilidade_dashboard_slo.sql
--
-- PED-34 — dashboard de saúde básico no SuperAdmin.
--
-- 1) webhook_events.duracao_ms: tempo (ms) de processamento do webhook de
--    pagamento até o ack, gravado por webhook-pagamento/index.ts só no
--    caminho de sucesso (idempotência/ordem continuam decidindo os
--    retornos antecipados, essa coluna só descreve o caso feliz).
-- 2) mensalidades_geradas_vs_esperado_mes(): compara quantas mensalidades
--    foram geradas este mês contra quantos alunos ativos com plano
--    cobrável existem — mesmo filtro que gerar-mensalidades/index.ts usa
--    pra decidir quem cobrar (ativo=true, plano_id not null, preco > 0).
-- 3) latencia_webhook_pagamento_mes(): p95/média de duracao_ms no mês
--    corrente, usada pelo dashboard e pelo SLO do PED-35 (<5s em 99%).
--
-- Ambas as RPCs seguem o padrão de receita_total_paga() (baseline schema,
-- linha ~1155): STABLE SECURITY DEFINER + gate eh_super_admin(), porque
-- só o SuperAdmin (cross-tenant) deve ver essas métricas, e
-- webhook_events tem "revoke all from anon, authenticated" — sem
-- SECURITY DEFINER a função não conseguiria ler a tabela.

alter table public.webhook_events
  add column duracao_ms integer;

comment on column public.webhook_events.duracao_ms is
  'Tempo (ms) entre o início do handler e a resposta de ack em webhook-pagamento/index.ts. Só gravado no caminho de sucesso (PED-34). Usado pelo dashboard de observabilidade e pelo SLO de latência (PED-35).';

CREATE OR REPLACE FUNCTION public.mensalidades_geradas_vs_esperado_mes()
RETURNS TABLE(esperado bigint, gerado bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not eh_super_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  return query
  select
    (
      select count(*)
      from alunos a
      join planos p on p.id = a.plano_id
      where a.ativo = true
        and a.plano_id is not null
        and p.preco > 0
    ) as esperado,
    (
      select count(*)
      from mensalidades m
      where m.tipo_aula = 'regular'
        and date_trunc('month', m.data_vencimento) = date_trunc('month', current_date)
    ) as gerado;
end;
$function$;

CREATE OR REPLACE FUNCTION public.latencia_webhook_pagamento_mes()
RETURNS TABLE(p95_ms numeric, media_ms numeric, amostras bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not eh_super_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  return query
  select
    percentile_cont(0.95) within group (order by duracao_ms)::numeric as p95_ms,
    avg(duracao_ms) as media_ms,
    count(*) as amostras
  from webhook_events
  where duracao_ms is not null
    and date_trunc('month', recebido_em) = date_trunc('month', current_date);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.mensalidades_geradas_vs_esperado_mes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mensalidades_geradas_vs_esperado_mes() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.latencia_webhook_pagamento_mes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.latencia_webhook_pagamento_mes() TO authenticated;
```

- [ ] **Step 2: Aplicar localmente**

Run: `supabase start` (se o stack local não estiver rodando) seguido de `supabase migration up`

Expected: migration `20260827171659_observabilidade_dashboard_slo` aplicada sem erro.

- [ ] **Step 3: Verificar a coluna e as RPCs via SQL local**

Run (via `supabase db execute` ou client SQL apontando pro Postgres local, tipicamente `postgresql://postgres:postgres@127.0.0.1:54322/postgres`):

```sql
select column_name, data_type from information_schema.columns
where table_name = 'webhook_events' and column_name = 'duracao_ms';

select * from mensalidades_geradas_vs_esperado_mes();
select * from latencia_webhook_pagamento_mes();
```

Expected: a primeira query retorna `duracao_ms | integer`. As duas RPCs retornam uma linha cada (podem vir com `esperado`/`gerado`/`amostras` = 0 se o banco local estiver vazio — o importante é não dar erro de permissão nem de sintaxe). Chamar como um usuário sem ser super_admin (ou anon) deve falhar com `access denied`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260827171659_observabilidade_dashboard_slo.sql
git commit -m "feat(db): adiciona duracao_ms em webhook_events e RPCs de métricas de observabilidade (PED-34)"
```

---

### Task 3: Gravar `duracao_ms` em `webhook-pagamento/index.ts`

**Files:**
- Modify: `supabase/functions/webhook-pagamento/index.ts:55-56` e `:205-209`

**Interfaces:**
- Consumes: coluna `webhook_events.duracao_ms` (Task 2).
- Produces: linhas de `webhook_events` com `duracao_ms` preenchido no caminho de sucesso — consumidas por `latencia_webhook_pagamento_mes()` (Task 2) na próxima leitura.

- [ ] **Step 1: Capturar o instante inicial logo no início do handler**

Em `supabase/functions/webhook-pagamento/index.ts`, troque:

```typescript
serve(withSentry("webhook-pagamento", async (req) => {
  if (req.method === "OPTIONS") {
```

por:

```typescript
serve(withSentry("webhook-pagamento", async (req) => {
  const inicio = Date.now()

  if (req.method === "OPTIONS") {
```

- [ ] **Step 2: Gravar a duração antes do ack, só no caminho de sucesso**

Troque:

```typescript
  // ── 3) ACK RÁPIDO ────────────────────────────────────────────────────
  // A partir daqui, tudo que resta é pesado (calcular repasse cruzando
  // várias tabelas, chamar a Expo Push API) — não pode competir com o
  // prazo do Asaas para considerar a entrega bem-sucedida.
  const res = response({ recebido: true, mensalidade_id: mensalidade.id, status: novoStatus ?? "sem_alteracao" })
```

por:

```typescript
  // ── 3) ACK RÁPIDO ────────────────────────────────────────────────────
  // PED-34: grava a duração do processamento (ms) na própria linha de
  // webhook_events já inserida no passo de idempotência acima. Precisa
  // acontecer AQUI, antes do return — mesmo motivo do flush do Sentry em
  // withSentry (_shared/sentry.ts): o processo pode ser congelado logo
  // após a resposta, e perderíamos justamente a métrica de latência que
  // o SLO do PED-35 depende. Só o caminho de sucesso grava duração —
  // eventos duplicados/fora de ordem/mensalidade não encontrada retornam
  // antes daqui de propósito, e não devem contar como "processado" pro SLO.
  const duracaoMs = Date.now() - inicio
  const { error: duracaoErr } = await supabase
    .from("webhook_events")
    .update({ duracao_ms: duracaoMs })
    .eq("id", eventoRow.id)
  if (duracaoErr) {
    console.error("[webhook-pagamento] Falha ao gravar duracao_ms:", duracaoErr)
  }

  // A partir daqui, tudo que resta é pesado (calcular repasse cruzando
  // várias tabelas, chamar a Expo Push API) — não pode competir com o
  // prazo do Asaas para considerar a entrega bem-sucedida.
  const res = response({ recebido: true, mensalidade_id: mensalidade.id, status: novoStatus ?? "sem_alteracao" })
```

- [ ] **Step 3: Validar manualmente com `supabase functions serve`**

Run: `supabase functions serve webhook-pagamento --env-file supabase/functions/.env` (mesmo fluxo já usado na validação manual do PED-14)

Em outro terminal, com um `asaas_payment_id` real de uma mensalidade `pendente` no banco local:

```bash
curl -i -X POST http://127.0.0.1:54321/functions/v1/webhook-pagamento \
  -H "Content-Type: application/json" \
  -H "asaas-access-token: $ASAAS_WEBHOOK_TOKEN" \
  -d '{"event":"PAYMENT_CONFIRMED","dateCreated":"2026-08-27T12:00:00Z","payment":{"id":"<asaas_payment_id real>","status":"CONFIRMED"}}'
```

Expected: resposta 200 com `"status":"pago"`. Em seguida, via SQL local:

```sql
select id, asaas_event, duracao_ms from webhook_events
where asaas_payment_id = '<mesmo asaas_payment_id>'
order by recebido_em desc limit 1;
```

Expected: `duracao_ms` preenchido com um inteiro pequeno (tipicamente < 1000).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/webhook-pagamento/index.ts
git commit -m "feat(webhook): grava duracao_ms do processamento pro dashboard de observabilidade (PED-34)"
```

---

### Task 4: Extrair `MetricCard` (DRY) de `MetricasGlobais.jsx`

**Files:**
- Create: `webapp/src/components/ui/MetricCard.jsx`
- Modify: `webapp/src/pages/SuperAdmin/components/MetricasGlobais.jsx`

**Interfaces:**
- Produces: `<MetricCard icon={LucideIcon} label={string} valor={string} corIcone={string} corFundo={string} loading={boolean} footer?={ReactNode} />` — consumido por `MetricasGlobais.jsx` (este task) e por `SaudeSistema.jsx` (Task 7).

- [ ] **Step 1: Criar `webapp/src/components/ui/MetricCard.jsx`**

```jsx
// webapp/src/components/ui/MetricCard.jsx
//
// Card de métrica genérico (ícone + label + valor), extraído de
// MetricasGlobais.jsx (PED-34) pra ser reaproveitado por SaudeSistema.jsx
// sem duplicar a marcação. `footer` é opcional — usado pelo card de
// latência do webhook pra mostrar o badge de SLO abaixo do valor.

import React from 'react';
import Skeleton from './Skeleton';

export default function MetricCard({ icon: Icon, label, valor, corIcone, corFundo, loading, footer }) {
  return (
    <div className="rounded-3xl border border-border bg-card shadow-card p-6 flex items-start gap-4">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${corFundo}`}>
        <Icon size={22} className={corIcone} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
          {label}
        </p>
        {loading ? (
          <Skeleton className="h-8 w-28 mt-1" />
        ) : (
          <>
            <p className="text-3xl font-black text-foreground tracking-tight leading-none">
              {valor}
            </p>
            {footer}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Atualizar `MetricasGlobais.jsx` pra usar o componente extraído**

Substitua o arquivo inteiro por:

```jsx
// webapp/src/pages/SuperAdmin/components/MetricasGlobais.jsx

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Users, DollarSign, TrendingUp } from 'lucide-react';
import { superAdminService } from '../../../services/superAdminService';
import MetricCard from '../../../components/ui/MetricCard';
import { formatarMoeda } from '../../../lib/utils';

export default function MetricasGlobais() {
  const { data, isLoading } = useQuery({
    queryKey: ['super-admin', 'metricas'],
    queryFn: superAdminService.metricasGlobais,
    staleTime: 1000 * 60 * 2,
  });

  const cards = [
    {
      icon: Building2,
      label: 'Estúdios ativos',
      valor: (data?.totalEstudios ?? 0).toString(),
      corIcone: 'text-primary',
      corFundo: 'bg-primary-soft',
    },
    {
      icon: Users,
      label: 'Alunos (total)',
      valor: (data?.totalAlunos ?? 0).toLocaleString('pt-BR'),
      corIcone: 'text-info',
      corFundo: 'bg-info-soft',
    },
    {
      icon: DollarSign,
      label: 'Receita total (pago)',
      valor: formatarMoeda(data?.receitaTotal ?? 0),
      corIcone: 'text-success',
      corFundo: 'bg-success-soft',
    },
    {
      icon: TrendingUp,
      label: 'Média por estúdio',
      valor: data?.totalEstudios
        ? formatarMoeda((data.receitaTotal ?? 0) / data.totalEstudios)
        : 'R$ 0,00',
      corIcone: 'text-warning',
      corFundo: 'bg-warning-soft',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((c) => (
        <MetricCard key={c.label} {...c} loading={isLoading} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Rodar o dev server e conferir visualmente que a página SuperAdmin (`/super`) renderiza os 4 cards de métricas exatamente como antes**

Run: `npm run dev` (dentro de `webapp/`), abrir `/super` logado como super_admin.

Expected: os 4 cards (Estúdios ativos, Alunos, Receita total, Média por estúdio) aparecem idênticos ao layout anterior — a extração não muda nada visualmente.

- [ ] **Step 4: Commit**

```bash
git add webapp/src/components/ui/MetricCard.jsx webapp/src/pages/SuperAdmin/components/MetricasGlobais.jsx
git commit -m "refactor(webapp): extrai MetricCard de MetricasGlobais pra reaproveitar em SaudeSistema (PED-34)"
```

---

### Task 5: `saudeSistemaHelpers.js` — meta do SLO e formatação (TDD)

**Files:**
- Create: `webapp/src/pages/SuperAdmin/components/saudeSistemaHelpers.js`
- Test: `webapp/src/pages/SuperAdmin/components/saudeSistemaHelpers.test.js`

**Interfaces:**
- Produces: `WEBHOOK_SLO_MS` (number, 5000), `webhookDentroDoSlo(p95Ms: number|null|undefined): boolean`, `formatarSegundos(ms: number): string` — consumidos por `SaudeSistema.jsx` (Task 7).

- [ ] **Step 1: Escrever o teste (falhando) — mesmo padrão de `webapp/src/lib/validation.test.js`**

```javascript
// webapp/src/pages/SuperAdmin/components/saudeSistemaHelpers.test.js

import { describe, it, expect } from 'vitest';
import { WEBHOOK_SLO_MS, webhookDentroDoSlo, formatarSegundos } from './saudeSistemaHelpers';

describe('webhookDentroDoSlo', () => {
  it('retorna true quando p95 está dentro da meta de 5s', () => {
    expect(webhookDentroDoSlo(1200)).toBe(true);
  });

  it('retorna true no limite exato de 5000ms', () => {
    expect(webhookDentroDoSlo(WEBHOOK_SLO_MS)).toBe(true);
  });

  it('retorna false quando p95 excede a meta', () => {
    expect(webhookDentroDoSlo(5200)).toBe(false);
  });

  it('retorna false quando não há amostras (null)', () => {
    expect(webhookDentroDoSlo(null)).toBe(false);
  });

  it('retorna false quando o valor é undefined', () => {
    expect(webhookDentroDoSlo(undefined)).toBe(false);
  });
});

describe('formatarSegundos', () => {
  it('formata milissegundos como segundos com uma casa decimal', () => {
    expect(formatarSegundos(1234)).toBe('1.2s');
  });

  it('arredonda pra cima quando aplicável', () => {
    expect(formatarSegundos(1250)).toBe('1.3s');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha (módulo não existe ainda)**

Run: `npm run test -- saudeSistemaHelpers` (dentro de `webapp/`)

Expected: FAIL — `Cannot find module './saudeSistemaHelpers'` (ou equivalente).

- [ ] **Step 3: Implementar `saudeSistemaHelpers.js`**

```javascript
// webapp/src/pages/SuperAdmin/components/saudeSistemaHelpers.js
//
// Lógica pura do card de latência do webhook — separada de SaudeSistema.jsx
// pra ser testável com vitest (mesmo padrão de webapp/src/lib/*.test.js;
// não há testing-library no projeto pra testar o componente em si).

export const WEBHOOK_SLO_MS = 5000; // PED-35: <5s em 99% dos casos

export function webhookDentroDoSlo(p95Ms) {
  return typeof p95Ms === 'number' && p95Ms <= WEBHOOK_SLO_MS;
}

export function formatarSegundos(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}
```

- [ ] **Step 4: Rodar o teste de novo e confirmar que passa**

Run: `npm run test -- saudeSistemaHelpers` (dentro de `webapp/`)

Expected: PASS — 7 testes passando.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/pages/SuperAdmin/components/saudeSistemaHelpers.js webapp/src/pages/SuperAdmin/components/saudeSistemaHelpers.test.js
git commit -m "test(webapp): adiciona lógica pura de SLO de latência do webhook (PED-34/PED-35)"
```

---

### Task 6: `superAdminService.saudeSistema()`

**Files:**
- Modify: `webapp/src/services/superAdminService.js`

**Interfaces:**
- Consumes: RPCs `mensalidades_geradas_vs_esperado_mes()` e `latencia_webhook_pagamento_mes()` (Task 2).
- Produces: `superAdminService.saudeSistema(): Promise<{ mensalidadesGeradas: number, mensalidadesEsperadas: number, webhookP95Ms: number|null, webhookAmostras: number }>` — consumido por `SaudeSistema.jsx` (Task 7).

- [ ] **Step 1: Adicionar a função `saudeSistema` em `superAdminService.js`**

Adicione, logo após a função `metricasGlobais` existente:

```javascript
async function saudeSistema() {
  const [
    { data: mensalidades, error: errMensalidades },
    { data: latencia, error: errLatencia },
  ] = await Promise.all([
    supabase.rpc('mensalidades_geradas_vs_esperado_mes').single(),
    supabase.rpc('latencia_webhook_pagamento_mes').single(),
  ]);

  if (errMensalidades) throw errMensalidades;
  if (errLatencia) throw errLatencia;

  return {
    mensalidadesGeradas: Number(mensalidades?.gerado ?? 0),
    mensalidadesEsperadas: Number(mensalidades?.esperado ?? 0),
    webhookP95Ms: latencia?.p95_ms != null ? Number(latencia.p95_ms) : null,
    webhookAmostras: Number(latencia?.amostras ?? 0),
  };
}
```

E adicione `saudeSistema` ao objeto exportado:

```javascript
export const superAdminService = {
  listarEstudios,
  metricasGlobais,
  saudeSistema,
  alterarStatusEstudio,
  criarEstudio,
};
```

- [ ] **Step 2: Validar — a checagem completa acontece no Task 7**

As RPCs já foram validadas isoladamente via SQL no Task 2/Step 3. `saudeSistema()` é só a ponte JS pra elas, sem lógica própria de negócio — não há um jeito de exercitá-la isoladamente sem montar `SaudeSistema.jsx` primeiro, então a verificação de ponta a ponta (RPC → service → UI) acontece no Task 7/Step 3, quando o dashboard renderiza de verdade com esses dados. Nada a rodar aqui além de conferir visualmente que o arquivo salvou sem erro de sintaxe (`npm run dev` já mostra erro de build no terminal se houver).

- [ ] **Step 3: Commit**

```bash
git add webapp/src/services/superAdminService.js
git commit -m "feat(webapp): adiciona superAdminService.saudeSistema (PED-34)"
```

---

### Task 7: `SaudeSistema.jsx` + wiring no SuperAdminDashboard

**Files:**
- Create: `webapp/src/pages/SuperAdmin/components/SaudeSistema.jsx`
- Modify: `webapp/src/pages/SuperAdmin/pages/SuperAdminDashboard.jsx`

**Interfaces:**
- Consumes: `MetricCard` (Task 4), `WEBHOOK_SLO_MS`/`webhookDentroDoSlo`/`formatarSegundos` (Task 5), `superAdminService.saudeSistema` (Task 6), `Badge` (existente, `webapp/src/components/ui/Badge.jsx`).
- Produces: `<SaudeSistema />` renderizado em `/super`.

- [ ] **Step 1: Criar `SaudeSistema.jsx`**

```jsx
// webapp/src/pages/SuperAdmin/components/SaudeSistema.jsx
//
// PED-34 — dashboard de saúde básico: mensalidades geradas vs esperado no
// mês, p95 de latência do webhook de pagamento (contra a meta do PED-35),
// e um link direto pros erros de Edge Functions no Sentry (decisão de
// escopo do brainstorming: sem proxy de API novo nesta ficha).

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Timer, Bug } from 'lucide-react';
import { superAdminService } from '../../../services/superAdminService';
import MetricCard from '../../../components/ui/MetricCard';
import Badge from '../../../components/ui/Badge';
import { webhookDentroDoSlo, formatarSegundos } from './saudeSistemaHelpers';

const SENTRY_ISSUES_URL = 'https://dev-pedro-schuster.sentry.io/issues/';

export default function SaudeSistema() {
  const { data, isLoading } = useQuery({
    queryKey: ['super-admin', 'saude-sistema'],
    queryFn: superAdminService.saudeSistema,
    staleTime: 1000 * 60 * 2,
  });

  const p95 = data?.webhookP95Ms ?? null;
  const temAmostras = (data?.webhookAmostras ?? 0) > 0;

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
        Saúde do sistema
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <MetricCard
          icon={Activity}
          label="Mensalidades do mês"
          valor={`${data?.mensalidadesGeradas ?? 0} / ${data?.mensalidadesEsperadas ?? 0}`}
          corIcone="text-info"
          corFundo="bg-info-soft"
          loading={isLoading}
        />

        <MetricCard
          icon={Timer}
          label="Latência webhook (p95)"
          valor={temAmostras ? formatarSegundos(p95) : 'sem dados'}
          corIcone="text-warning"
          corFundo="bg-warning-soft"
          loading={isLoading}
          footer={
            temAmostras ? (
              <Badge tone={webhookDentroDoSlo(p95) ? 'success' : 'destructive'} className="mt-2">
                Meta: {'<'}5s em 99% dos casos
              </Badge>
            ) : null
          }
        />

        <a
          href={SENTRY_ISSUES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-3xl border border-border bg-card shadow-card p-6 flex items-start gap-4 hover:border-primary/50 hover:shadow-brand transition-all"
        >
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-destructive-soft">
            <Bug size={22} className="text-destructive" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
              Erros de Edge Functions
            </p>
            <p className="text-sm font-bold text-foreground">
              Ver no Sentry (projeto nexofy-edge-functions) →
            </p>
          </div>
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Renderizar em `SuperAdminDashboard.jsx`**

Troque:

```jsx
import MetricasGlobais from '../components/MetricasGlobais';
import Button from '../../../components/ui/Button';
```

por:

```jsx
import MetricasGlobais from '../components/MetricasGlobais';
import SaudeSistema from '../components/SaudeSistema';
import Button from '../../../components/ui/Button';
```

E troque:

```jsx
      {/* Cards de métricas cross-tenant */}
      <MetricasGlobais />
```

por:

```jsx
      {/* Cards de métricas cross-tenant */}
      <MetricasGlobais />

      {/* PED-34: saúde operacional (webhook, mensalidades, erros) */}
      <SaudeSistema />
```

- [ ] **Step 3: Validar visualmente no dev server**

Run: `npm run dev` (dentro de `webapp/`, se não estiver rodando), abrir `/super` logado como super_admin.

Expected: nova seção "Saúde do sistema" abaixo dos cards de métricas globais, com 3 cards — mensalidades (N/M), latência (Xs + badge verde/vermelho da meta, ou "sem dados" se `webhook_events` local estiver vazio), e o link do Sentry abrindo `https://dev-pedro-schuster.sentry.io/issues/` em nova aba.

- [ ] **Step 4: Commit**

```bash
git add webapp/src/pages/SuperAdmin/components/SaudeSistema.jsx webapp/src/pages/SuperAdmin/pages/SuperAdminDashboard.jsx
git commit -m "feat(webapp): dashboard de saúde do sistema no SuperAdmin (PED-34)"
```

---

## Depois de completar todos os tasks

- Marcar PED-34 e PED-35 como "In Review" no Linear (mesmo fluxo do PED-33).
- Abrir PR — a promoção da migration pra staging acontece via merge (gate `db-diff` do PED-30), não manualmente.
