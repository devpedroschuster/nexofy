# PED-115: Cobrança automática pós-trial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o estúdio assinar um plano pago da Nexofy (Essencial ou Profissional) com cartão de crédito quando o trial de 14 dias está perto de expirar ou já expirou, convertendo automaticamente `trial_expirado` → assinatura ativa assim que a Asaas confirmar o primeiro pagamento — sem intervenção manual de um super_admin.

**Architecture:** Reaproveita a conta Asaas **master** da Nexofy (já existe, hoje só usada em `criar-subconta-asaas` para criar subcontas). Nova edge function `assinar-plano-nexofy` cria um customer + assinatura recorrente (`POST /v3/subscriptions`, cartão enviado direto no mesmo request — a Asaas não tem tokenização client-side) na conta master, usando o estúdio como customer. Nova edge function `webhook-assinatura-nexofy` (endpoint/token de webhook próprios, separados do `webhook-pagamento` de mensalidades de aluno) recebe a confirmação e simplesmente zera `estudios.trial_ends_at` — o gate de acesso do PED-105 (`estudio_id_atual()`) já trata `trial_ends_at IS NULL` como liberado, então não há nenhuma mudança de RLS neste PR. Frontend ganha uma página de upgrade (`/upgrade`) acionada a partir do banner de trial e da tela de bloqueio.

**Tech Stack:** React + Vite (webapp), Supabase Postgres + Edge Functions (Deno), Asaas API (`POST /v3/customers`, `POST /v3/subscriptions`), Vitest para testes de frontend.

**Spec:** [docs/superpowers/specs/2026-09-02-ped115-cobranca-pos-trial-design.md](../specs/2026-09-02-ped115-cobranca-pos-trial-design.md)

## Global Constraints

- Preço **sempre** resolvido no backend a partir de uma constante — nunca confia no valor vindo do client.
- Nenhum campo de cartão (`number`, `ccv`, `expiryMonth`/`expiryYear`) é logado (`console.log`/`console.error`/Sentry) em nenhum ponto do backend.
- Planos self-service: `essencial` (R$129/mês) e `profissional` (R$249/mês) — valores de `webapp/src/pages/LandingNexofy.jsx` (array `PLANS`). Ciclo anual = 10x o valor mensal (2 meses grátis). Plano "Rede" **não** entra neste fluxo (permanece manual/sob consulta).
- `assinatura_status` só vira `'ativa'` via webhook (confirmação assíncrona da Asaas) — nunca no momento síncrono da criação da assinatura.
- Migration é aditiva (só `ADD COLUMN`/`ADD CONSTRAINT`) — sem down-migration, mesmo padrão de `supabase/migrations/20260901120000_add_trial_ends_at_estudios.sql`.
- Migration precisa ser aplicada e validada em staging antes de produção — o CI (`Supabase DB Diff (staging)`, `.github/workflows/ci.yml`) falha o PR se houver drift entre staging e as migrations do repositório.

---

## Task 1: Migration — colunas de assinatura Nexofy em `estudios`

**Files:**
- Create: `supabase/migrations/20260902170000_add_plano_nexofy_estudios.sql`

**Interfaces:**
- Produces: colunas `estudios.plano_nexofy` (`text`, null, check `essencial|profissional`), `estudios.ciclo_cobranca` (`text`, null, check `mensal|anual`), `estudios.assinatura_status` (`text not null default 'nenhuma'`, check `nenhuma|ativa`), `estudios.asaas_customer_id_nexofy` (`text`, null), `estudios.asaas_subscription_id` (`text`, null) — usadas por todas as tasks seguintes.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/20260902170000_add_plano_nexofy_estudios.sql
--
-- PED-115: colunas para cobrança automática pós-trial (plano pago
-- self-service com cartão). Puramente aditiva — todas as colunas nascem
-- NULL (ou 'nenhuma' pra assinatura_status), não afeta estúdio nenhum
-- existente. Sem down-migration: mesmo padrão de
-- 20260901120000_add_trial_ends_at_estudios.sql.

alter table public.estudios
  add column plano_nexofy text,
  add column ciclo_cobranca text,
  add column assinatura_status text not null default 'nenhuma',
  add column asaas_customer_id_nexofy text,
  add column asaas_subscription_id text;

alter table public.estudios
  add constraint estudios_plano_nexofy_check
  check (plano_nexofy is null or plano_nexofy = any (array['essencial', 'profissional']));

alter table public.estudios
  add constraint estudios_ciclo_cobranca_check
  check (ciclo_cobranca is null or ciclo_cobranca = any (array['mensal', 'anual']));

alter table public.estudios
  add constraint estudios_assinatura_status_check
  check (assinatura_status = any (array['nenhuma', 'ativa']));
```

- [ ] **Step 2: Aplicar e validar em staging via MCP do Supabase**

Use a tool `mcp__<supabase>__apply_migration` (ou `supabase db push` linkado ao staging) contra o projeto de **staging** — confirme com o usuário qual `project_ref` é staging antes de aplicar, este repo tem mais de um projeto Supabase. Depois de aplicar, confirme as colunas com `list_tables` (schema `public`, tabela `estudios`) e rode manualmente:

```sql
-- deve falhar (violação de check)
update estudios set plano_nexofy = 'invalido' where false;
-- deve funcionar
select plano_nexofy, ciclo_cobranca, assinatura_status, asaas_customer_id_nexofy, asaas_subscription_id
from estudios limit 1;
```

Confirme que `assinatura_status` já vem `'nenhuma'` por default nas linhas existentes.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260902170000_add_plano_nexofy_estudios.sql
git commit -m "feat(db): adiciona colunas de assinatura Nexofy em estudios (PED-115)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Lib pura de preços — `webapp/src/lib/planosNexofy.js`

**Files:**
- Create: `webapp/src/lib/planosNexofy.js`
- Test: `webapp/src/lib/planosNexofy.test.js`

**Interfaces:**
- Produces: `PLANOS_NEXOFY` (objeto `{ essencial: { label, valorMensal }, profissional: { label, valorMensal } }`), `resolverValorAssinatura(plano: string, ciclo: string): number | null`. Consumido por `UpgradePlano.jsx` (Task 6) pro cálculo exibido na UI — o valor **cobrado de verdade** é sempre recalculado no backend (Task 3), esta função aqui é só pra exibição.

- [ ] **Step 1: Escrever o teste (falhando)**

```js
// webapp/src/lib/planosNexofy.test.js
import { describe, it, expect } from 'vitest';
import { PLANOS_NEXOFY, resolverValorAssinatura } from './planosNexofy';

describe('PLANOS_NEXOFY', () => {
  it('tem os dois planos self-service com os valores da landing', () => {
    expect(PLANOS_NEXOFY.essencial.valorMensal).toBe(129);
    expect(PLANOS_NEXOFY.profissional.valorMensal).toBe(249);
  });
});

describe('resolverValorAssinatura', () => {
  it('retorna o valor mensal cheio pro ciclo mensal', () => {
    expect(resolverValorAssinatura('essencial', 'mensal')).toBe(129);
    expect(resolverValorAssinatura('profissional', 'mensal')).toBe(249);
  });

  it('retorna 10x o valor mensal pro ciclo anual (2 meses grátis)', () => {
    expect(resolverValorAssinatura('essencial', 'anual')).toBe(1290);
    expect(resolverValorAssinatura('profissional', 'anual')).toBe(2490);
  });

  it('retorna null pra plano desconhecido', () => {
    expect(resolverValorAssinatura('rede', 'mensal')).toBeNull();
    expect(resolverValorAssinatura('inexistente', 'mensal')).toBeNull();
  });

  it('retorna null pra ciclo desconhecido', () => {
    expect(resolverValorAssinatura('essencial', 'trimestral')).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd webapp && npx vitest run src/lib/planosNexofy.test.js`
Expected: FAIL — `Failed to resolve import "./planosNexofy"`

- [ ] **Step 3: Implementação mínima**

```js
// webapp/src/lib/planosNexofy.js
//
// Preços dos planos self-service da Nexofy (PED-115) — espelha o array
// PLANS de webapp/src/pages/LandingNexofy.jsx. "Rede" (sob consulta) não
// entra aqui: não é self-service, permanece 100% manual/comercial.
//
// O valor calculado aqui é só pra EXIBIÇÃO na UI de upgrade — o valor
// cobrado de verdade é sempre resolvido de novo no backend
// (supabase/functions/assinar-plano-nexofy/index.ts), que nunca confia em
// nenhum valor vindo do client.

export const PLANOS_NEXOFY = {
  essencial:    { label: 'Essencial',    valorMensal: 129 },
  profissional: { label: 'Profissional', valorMensal: 249 },
};

export function resolverValorAssinatura(plano, ciclo) {
  const config = PLANOS_NEXOFY[plano];
  if (!config) return null;
  if (ciclo === 'mensal') return config.valorMensal;
  if (ciclo === 'anual') return config.valorMensal * 10;
  return null;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `cd webapp && npx vitest run src/lib/planosNexofy.test.js`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/planosNexofy.js webapp/src/lib/planosNexofy.test.js
git commit -m "feat(web): lib pura de preços dos planos Nexofy (PED-115)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Edge function `assinar-plano-nexofy`

**Files:**
- Create: `supabase/functions/assinar-plano-nexofy/index.ts`
- Create: `supabase/functions/assinar-plano-nexofy/deno.json`

**Interfaces:**
- Consumes: colunas de `estudios` da Task 1 (`assinatura_status`, `asaas_customer_id_nexofy`, `asaas_subscription_id`, `plano_nexofy`, `ciclo_cobranca`); tabela `estudio_membros(user_id, estudio_id, role)` já existente.
- Produces: endpoint `POST /functions/v1/assinar-plano-nexofy` — body `{ estudioId: string, plano: 'essencial'|'profissional', ciclo: 'mensal'|'anual', cartao: { holderName, number, expiryMonth, expiryYear, ccv }, titular: { name, email, cpfCnpj, postalCode, addressNumber, phone } }`. Sucesso `200 { mensagem, asaas_subscription_id }`. Erros: `400` (campos faltando/plano-ciclo inválido), `401` (não autenticado), `403` (não é admin do estúdio), `404` (estúdio não encontrado), `409` (já tem assinatura ativa), `422` (cartão recusado pela Asaas, `{ erro, detalhes }`), `500` (erro interno/config). Consumido pelo service da Task 5.

- [ ] **Step 1: Criar `deno.json`**

```json
{
  "imports": {
    "std/http/server": "https://deno.land/std@0.177.0/http/server.ts",
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2"
  }
}
```

- [ ] **Step 2: Implementar a edge function**

```ts
// supabase/functions/assinar-plano-nexofy/index.ts
//
// PED-115 — cria a assinatura recorrente de um estúdio na Asaas MASTER
// (a mesma conta que cria subcontas em criar-subconta-asaas — aqui o
// estúdio é o customer, não o dono de subconta). A Asaas não tem SDK de
// tokenização client-side (diferente de Stripe.js): o cartão trafega em
// texto pela requisição até aqui, via HTTPS, e é repassado na mesma
// chamada pra Asaas — nunca é logado nem persistido em nenhuma tabela.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function response(body: object, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const ASAAS_API_URL = Deno.env.get('ASAAS_API_URL') ?? 'https://api-sandbox.asaas.com/v3'
const ASAAS_MASTER_API_KEY = Deno.env.get('ASAAS_MASTER_API_KEY') ?? ''

// Espelha webapp/src/lib/planosNexofy.js — mantido em sincronia manual,
// mesmo motivo do calcularPeriodoFim em criar-cobranca-asaas/index.ts
// (edge function roda em runtime Deno, não importa o arquivo JS do app).
const PRECOS_NEXOFY: Record<string, number> = {
  essencial: 129,
  profissional: 249,
}

function resolverValor(plano: string, ciclo: string): number | null {
  const valorMensal = PRECOS_NEXOFY[plano]
  if (!valorMensal) return null
  if (ciclo === 'mensal') return valorMensal
  if (ciclo === 'anual') return valorMensal * 10
  return null
}

function obterRemoteIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  return xff ? xff.split(',')[0].trim() : '0.0.0.0'
}

interface Cartao {
  holderName: string
  number: string
  expiryMonth: string
  expiryYear: string
  ccv: string
}

interface Titular {
  name: string
  email: string
  cpfCnpj: string
  postalCode: string
  addressNumber: string
  phone: string
}

interface Body {
  estudioId: string
  plano: string
  ciclo: string
  cartao: Cartao
  titular: Titular
}

serve(withSentry('assinar-plano-nexofy', async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!ASAAS_MASTER_API_KEY) {
    console.error('[assinar-plano-nexofy] ASAAS_MASTER_API_KEY não configurada.')
    return response({ erro: 'Integração de pagamentos indisponível no momento.' }, 500)
  }

  const body = (await req.json().catch(() => ({}))) as Partial<Body>
  const { estudioId, plano, ciclo, cartao, titular } = body

  if (!estudioId || !plano || !ciclo || !cartao || !titular) {
    return response({ erro: 'estudioId, plano, ciclo, cartao e titular são obrigatórios.' }, 400)
  }

  const valor = resolverValor(plano, ciclo)
  if (valor === null) {
    return response({ erro: 'Plano ou ciclo inválido.' }, 400)
  }

  // AUTORIZAÇÃO — ação sensível (move dinheiro real), exige sessão de
  // admin do próprio estúdio, igual criar-subconta-asaas.
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) {
    return response({ erro: 'Não autorizado.' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) {
    return response({ erro: 'Não autorizado.' }, 401)
  }

  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: membro } = await supabase
    .from('estudio_membros')
    .select('role')
    .eq('user_id', user.id)
    .eq('estudio_id', estudioId)
    .maybeSingle()

  if (!membro || !['admin', 'super_admin'].includes(membro.role)) {
    return response({ erro: 'Acesso negado.' }, 403)
  }

  try {
    const { data: estudio, error: errEstudio } = await supabase
      .from('estudios')
      .select('id, assinatura_status, asaas_customer_id_nexofy')
      .eq('id', estudioId)
      .maybeSingle()

    if (errEstudio) throw errEstudio
    if (!estudio) {
      return response({ erro: 'Estúdio não encontrado.' }, 404)
    }

    if (estudio.assinatura_status === 'ativa') {
      return response({ erro: 'Este estúdio já possui uma assinatura ativa.' }, 409)
    }

    // 1. Garante customer na Asaas MASTER — diferente da subconta do
    // estúdio (asaas_account_id), que é pra ele cobrar os próprios alunos.
    let customerId: string | null = estudio.asaas_customer_id_nexofy
    if (!customerId) {
      const customerRes = await fetch(`${ASAAS_API_URL}/customers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_MASTER_API_KEY },
        body: JSON.stringify({
          name: titular.name,
          email: titular.email,
          cpfCnpj: titular.cpfCnpj,
          postalCode: titular.postalCode,
          addressNumber: titular.addressNumber,
          phone: titular.phone,
        }),
      })
      const customerData = await customerRes.json()
      if (!customerRes.ok) {
        console.error('[assinar-plano-nexofy] Erro ao criar customer na Asaas:', customerData?.errors ?? customerData)
        return response({
          erro: 'Não foi possível validar os dados informados.',
          detalhes: customerData?.errors,
        }, 400)
      }
      customerId = customerData.id
    }

    // 2. Cria a assinatura recorrente com cartão de crédito — a Asaas
    // aceita creditCard/creditCardHolderInfo direto neste mesmo request,
    // sem precisar de um passo de tokenização separado antes.
    const nextDueDate = new Date().toISOString().split('T')[0]
    const subscriptionRes = await fetch(`${ASAAS_API_URL}/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'access_token': ASAAS_MASTER_API_KEY },
      body: JSON.stringify({
        customer: customerId,
        billingType: 'CREDIT_CARD',
        cycle: ciclo === 'anual' ? 'YEARLY' : 'MONTHLY',
        value: valor,
        nextDueDate,
        creditCard: cartao,
        creditCardHolderInfo: titular,
        remoteIp: obterRemoteIp(req),
        externalReference: `nexofy_plano_${estudioId}`,
      }),
    })
    const subscriptionData = await subscriptionRes.json()

    if (!subscriptionRes.ok) {
      // Não loga o corpo inteiro (pode ecoar campos de cartão de volta) —
      // só o array de erros estruturado que a Asaas devolve.
      console.error('[assinar-plano-nexofy] Assinatura recusada pela Asaas:', subscriptionData?.errors)
      return response({
        erro: 'Não foi possível processar o pagamento com este cartão.',
        detalhes: subscriptionData?.errors,
      }, 422)
    }

    // 3. Salva os identificadores. assinatura_status só vira 'ativa' no
    // webhook (webhook-assinatura-nexofy), quando o 1º pagamento é de
    // fato confirmado — a criação da assinatura em si não garante isso.
    const { error: errUpdate } = await supabase
      .from('estudios')
      .update({
        plano_nexofy: plano,
        ciclo_cobranca: ciclo,
        asaas_customer_id_nexofy: customerId,
        asaas_subscription_id: subscriptionData.id,
      })
      .eq('id', estudioId)

    if (errUpdate) {
      console.error(
        '[assinar-plano-nexofy] CRÍTICO: assinatura criada na Asaas mas falhou ao salvar no Supabase.',
        'asaas_subscription_id:', subscriptionData.id, 'estudio_id:', estudioId, errUpdate,
      )
      return response({
        erro: 'A assinatura foi criada, mas houve uma falha ao salvar no sistema. Contate o suporte informando o estúdio afetado.',
      }, 500)
    }

    return response({
      mensagem: 'Assinatura criada. Confirmando o pagamento…',
      asaas_subscription_id: subscriptionData.id,
    })
  } catch (err) {
    console.error('[assinar-plano-nexofy] Erro inesperado:', err)
    return response({ erro: 'Erro inesperado ao processar assinatura.' }, 500)
  }
}))
```

- [ ] **Step 3: Registrar a function no `supabase/config.toml` (raiz)**

Adicionar um bloco novo, no mesmo estilo do bloco `[functions.criar-subconta-asaas]` já existente (logo depois dele):

```toml
[functions.assinar-plano-nexofy]
enabled = true
# Sempre exige JWT — ação sensível (move dinheiro real), sem invocação
# por cron, chamada só pelo admin autenticado do próprio estúdio.
verify_jwt = true
import_map = "./functions/assinar-plano-nexofy/deno.json"
entrypoint = "./functions/assinar-plano-nexofy/index.ts"
```

- [ ] **Step 4: Deploy local e teste manual contra sandbox Asaas**

Suba o Supabase local (`supabase start`), garanta os secrets locais (`ASAAS_API_URL=https://api-sandbox.asaas.com/v3`, `ASAAS_MASTER_API_KEY=<key de sandbox>`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`), sirva a function (`supabase functions serve assinar-plano-nexofy --env-file supabase/.env.local`) e teste com um cartão de teste da Asaas (`docs.asaas.com` tem números de cartão de sandbox) contra um `estudioId` real de um estúdio de teste onde seu usuário é admin:

```bash
curl -X POST http://localhost:54321/functions/v1/assinar-plano-nexofy \
  -H "Authorization: Bearer <jwt-do-admin-de-teste>" \
  -H "Content-Type: application/json" \
  -d '{
    "estudioId": "<uuid-do-estudio-de-teste>",
    "plano": "essencial",
    "ciclo": "mensal",
    "cartao": {"holderName":"Teste Sandbox","number":"5162306219378829","expiryMonth":"05","expiryYear":"2028","ccv":"318"},
    "titular": {"name":"Teste Sandbox","email":"teste@nexofy.app","cpfCnpj":"24971563792","postalCode":"01310930","addressNumber":"100","phone":"11999999999"}
  }'
```

Expected: `200` com `asaas_subscription_id`; confira no banco local que `estudios.plano_nexofy = 'essencial'`, `ciclo_cobranca = 'mensal'`, `asaas_subscription_id` preenchido, e `assinatura_status` ainda `'nenhuma'` (só o webhook da Task 4 muda isso). Teste também um cartão de recusa de sandbox pra confirmar o `422` com mensagem amigável.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/assinar-plano-nexofy/ supabase/config.toml
git commit -m "feat(edge): cria assinatura recorrente Nexofy via Asaas master (PED-115)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Edge function `webhook-assinatura-nexofy`

**Files:**
- Create: `supabase/functions/webhook-assinatura-nexofy/index.ts`
- Create: `supabase/functions/webhook-assinatura-nexofy/deno.json`
- Create: `supabase/functions/webhook-assinatura-nexofy/config.toml`

**Interfaces:**
- Consumes: `estudios.asaas_subscription_id`/`assinatura_status`/`trial_ends_at` (Task 1); tabela `webhook_events` já existente (`origem, asaas_event, asaas_payment_id` unique).
- Produces: endpoint `POST /functions/v1/webhook-assinatura-nexofy` — recebe payload de webhook da Asaas (`{ event, payment: { id, subscription, status } }`), autenticado via header `asaas-access-token` == secret `ASAAS_WEBHOOK_TOKEN_NEXOFY`. Ao confirmar pagamento de uma assinatura conhecida, seta `estudios.assinatura_status = 'ativa'` e `estudios.trial_ends_at = NULL` — é isso que libera o acesso, via `estudio_id_atual()` do PED-105 (nenhuma mudança nessa função é necessária).

- [ ] **Step 1: Criar `deno.json`**

```json
{
  "imports": {
    "std/http/server": "https://deno.land/std@0.177.0/http/server.ts",
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2"
  }
}
```

- [ ] **Step 2: Implementar a edge function**

```ts
// supabase/functions/webhook-assinatura-nexofy/index.ts
//
// PED-115 — recebe eventos de pagamento de ASSINATURA da Asaas (conta
// master) e converte trial_expirado -> assinatura ativa no primeiro
// pagamento confirmado.
//
// Endpoint e secret PRÓPRIOS, separados do webhook-pagamento existente
// (que resolve tudo por mensalidades.asaas_payment_id — domínio de
// cobrança de aluno — e dispara efeitos colaterais específicos daquele
// domínio, como repasse e reativação de aluno, que não fazem sentido
// aqui). Configurar como um segundo webhook no painel da Asaas.
//
// Diferente do webhook-pagamento, este NÃO precisa de checagem de ordem
// por timestamp: a única transição de estado aqui é 'nenhuma'/'pendente'
// -> 'ativa', uma única vez, guardada pelo próprio check de
// `assinatura_status === 'ativa'` abaixo — não existe caminho de volta
// neste PR (falha de cobrança recorrente pós-ativação é o PED-125).
//
// SEGURANÇA: mesmo esquema do webhook-pagamento — Asaas não assina por
// HMAC, autentica via Access Token configurado no painel, devolvido no
// header `asaas-access-token`. verify_jwt = false necessário (Asaas não
// envia JWT do Supabase).
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { withSentry } from '../_shared/sentry.ts'
import { createLogger } from '../_shared/logger.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type, asaas-access-token',
}

function response(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const EVENTOS_PAGO = new Set(['PAYMENT_RECEIVED', 'PAYMENT_CONFIRMED'])

serve(withSentry('webhook-assinatura-nexofy', async (req: Request) => {
  const correlationId = crypto.randomUUID()
  const logger = createLogger('webhook-assinatura-nexofy', correlationId)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return response({ erro: 'method not allowed' }, 405)
  }

  const expectedToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN_NEXOFY') ?? ''
  const receivedToken = req.headers.get('asaas-access-token') ?? ''
  if (!expectedToken || receivedToken !== expectedToken) {
    logger.error('Token de webhook inválido ou ausente.')
    return response({ erro: 'Não autorizado.' }, 401)
  }

  let payload: {
    event?: string
    payment?: { id?: string; subscription?: string; status?: string }
  }
  try {
    payload = await req.json()
  } catch {
    return response({ erro: 'Payload inválido.' }, 400)
  }

  const evento = payload?.event
  const payment = payload?.payment
  const asaasPaymentId = payment?.id
  const subscriptionId = payment?.subscription

  if (!evento || !asaasPaymentId) {
    logger.warn('Evento sem payment.id, ignorado.', { evento })
    return response({ recebido: true, ignorado: true })
  }

  if (!subscriptionId) {
    // Pagamento sem assinatura associada não é do domínio deste webhook
    // (ex.: cobrança avulsa criada direto na conta master, se algum dia
    // existir) — ignora sem erro.
    logger.info('Pagamento sem assinatura associada, ignorado.', { evento, asaas_payment_id: asaasPaymentId })
    return response({ recebido: true, ignorado: true })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // ── IDEMPOTÊNCIA ─────────────────────────────────────────────────────
  // Mesmo mecanismo do webhook-pagamento: grava o evento com ON CONFLICT
  // DO NOTHING antes de processar. origem='asaas_nexofy' distingue estes
  // eventos dos de mensalidade de aluno (origem='asaas') na mesma tabela.
  const { data: eventoRow, error: eventoErr } = await supabase
    .from('webhook_events')
    .upsert(
      { origem: 'asaas_nexofy', asaas_event: evento, asaas_payment_id: asaasPaymentId, payload },
      { onConflict: 'origem,asaas_event,asaas_payment_id', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle()

  if (eventoErr) {
    logger.error('Erro ao gravar webhook_events.', { evento, asaas_payment_id: asaasPaymentId, erro: eventoErr })
    return response({ erro: 'Erro interno.' }, 500)
  }
  if (!eventoRow) {
    logger.info('Evento duplicado (reentrega), ignorando.', { evento, asaas_payment_id: asaasPaymentId })
    return response({ recebido: true, duplicado: true })
  }

  if (!EVENTOS_PAGO.has(evento)) {
    // PAYMENT_OVERDUE/recusa no 1º pagamento: não muda nada — o admin já
    // viu o erro síncrono na criação da assinatura (assinar-plano-nexofy).
    // Falha recorrente pós-ativação é o PED-125.
    return response({ recebido: true, ignorado: true })
  }

  const { data: estudio, error: buscaErr } = await supabase
    .from('estudios')
    .select('id, assinatura_status')
    .eq('asaas_subscription_id', subscriptionId)
    .maybeSingle()

  if (buscaErr) {
    logger.error('Erro ao buscar estúdio pela assinatura.', { subscription_id: subscriptionId, erro: buscaErr })
    return response({ erro: 'Erro interno.' }, 500)
  }

  if (!estudio) {
    logger.warn('Assinatura não encontrada em nenhum estúdio.', { subscription_id: subscriptionId })
    return response({ recebido: true, ignorado: true })
  }

  if (estudio.assinatura_status === 'ativa') {
    return response({ recebido: true, ja_ativa: true })
  }

  const { error: updateErr } = await supabase
    .from('estudios')
    .update({ assinatura_status: 'ativa', trial_ends_at: null })
    .eq('id', estudio.id)

  if (updateErr) {
    logger.error('Erro ao ativar assinatura do estúdio.', { estudio_id: estudio.id, erro: updateErr })
    return response({ erro: 'Erro ao atualizar estúdio.' }, 500)
  }

  logger.info('Assinatura confirmada, trial encerrado.', { estudio_id: estudio.id, subscription_id: subscriptionId })
  return response({ recebido: true, estudio_id: estudio.id, status: 'ativa' })
}))
```

- [ ] **Step 3: `config.toml` local da function + bloco na raiz**

```toml
# supabase/functions/webhook-assinatura-nexofy/config.toml
[functions.webhook-assinatura-nexofy]
verify_jwt = false
```

E, no `supabase/config.toml` da raiz (mesmo bloco duplicado — o comentário em `[functions.gerar-mensalidades]` documenta que o config.toml por-function sozinho não é suficiente, só o bloco na raiz é o que efetivamente vale):

```toml
[functions.webhook-assinatura-nexofy]
enabled = true
# Asaas não envia JWT do Supabase — autenticação é via header
# asaas-access-token (ver comentário de segurança no index.ts).
verify_jwt = false
import_map = "./functions/webhook-assinatura-nexofy/deno.json"
entrypoint = "./functions/webhook-assinatura-nexofy/index.ts"
```

- [ ] **Step 4: Teste manual local — evento simulado**

Com `supabase functions serve webhook-assinatura-nexofy --env-file supabase/.env.local` rodando e `ASAAS_WEBHOOK_TOKEN_NEXOFY=teste-local` setado, simule o evento (usando o `asaas_subscription_id` real salvo pelo teste manual da Task 3):

```bash
curl -X POST http://localhost:54321/functions/v1/webhook-assinatura-nexofy \
  -H "asaas-access-token: teste-local" \
  -H "Content-Type: application/json" \
  -d '{"event":"PAYMENT_CONFIRMED","payment":{"id":"pay_teste_123","subscription":"<asaas_subscription_id-do-teste-da-task-3>","status":"CONFIRMED"}}'
```

Expected: `200 { recebido: true, estudio_id, status: 'ativa' }`. Confira no banco: `estudios.assinatura_status = 'ativa'` e `trial_ends_at IS NULL` pro estúdio de teste. Reenvie o mesmo payload — expected `200 { recebido: true, duplicado: true }` (idempotência). Envie com token errado — expected `401`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/webhook-assinatura-nexofy/ supabase/config.toml
git commit -m "feat(edge): webhook de confirmação da assinatura Nexofy (PED-115)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Service de frontend — `assinaturaNexofyService.js`

**Files:**
- Create: `webapp/src/services/assinaturaNexofyService.js`

**Interfaces:**
- Consumes: edge function `assinar-plano-nexofy` (Task 3) via `supabase.functions.invoke`.
- Produces: `assinarPlanoNexofy({ estudioId, plano, ciclo, cartao, titular }): Promise<{ mensagem: string, asaas_subscription_id: string }>` — lança `Error` com mensagem amigável em caso de falha. Consumido por `UpgradePlano.jsx` (Task 6).

- [ ] **Step 1: Implementar o service**

```js
// webapp/src/services/assinaturaNexofyService.js
//
// PED-115 — chama a edge function que cria a assinatura recorrente do
// estúdio na Asaas master. Mesmo padrão de tratamento de erro de
// estudioAsaasService.js/ConfiguracoesPagamentos.jsx: supabase-js não
// rejeita a Promise em erros HTTP 4xx/5xx da function, o corpo de erro
// vem em `data` mesmo assim quando `error` existe.
import { supabase } from '../lib/supabase';

export async function assinarPlanoNexofy({ estudioId, plano, ciclo, cartao, titular }) {
  const { data, error } = await supabase.functions.invoke('assinar-plano-nexofy', {
    body: { estudioId, plano, ciclo, cartao, titular },
  });

  if (error) {
    const mensagem = data?.erro || error.message || 'Erro ao processar assinatura.';
    throw new Error(mensagem);
  }

  return data;
}
```

- [ ] **Step 2: Commit**

```bash
git add webapp/src/services/assinaturaNexofyService.js
git commit -m "feat(web): service de frontend pra assinatura Nexofy (PED-115)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Página `UpgradePlano.jsx` + rota `/upgrade`

**Files:**
- Create: `webapp/src/pages/UpgradePlano.jsx`
- Modify: `webapp/src/App.jsx:65` (import), `webapp/src/App.jsx:240-242` (rota)

**Interfaces:**
- Consumes: `useAuth()` (`estudioId`, `nomeUsuario`, `perfil`), `PLANOS_NEXOFY`/`resolverValorAssinatura` (Task 2), `assinarPlanoNexofy` (Task 5), componentes `Button`/`Input`/`FormField`/`Surface` já existentes, `showToast` de `../components/shared/Toast`.
- Produces: rota `/upgrade`, acessível com sessão ativa independente de `estudioBloqueado` (mesmo padrão da rota `/estudio-bloqueado`) — é referenciada pelas Tasks 7 e 8.

- [ ] **Step 1: Implementar a página**

```jsx
// webapp/src/pages/UpgradePlano.jsx
//
// PED-115 — tela de upgrade self-service: escolhe plano (Essencial ou
// Profissional — "Rede" é sob consulta, fora deste fluxo), escolhe ciclo
// (mensal/anual), preenche cartão + dados do titular e assina. Acessível
// mesmo com o estúdio bloqueado por trial expirado (ver rota em App.jsx,
// mesmo padrão de /estudio-bloqueado) — é justamente a saída desse
// bloqueio.
//
// A confirmação definitiva da assinatura acontece de forma assíncrona via
// webhook (normalmente em segundos) — esta tela só mostra que o envio deu
// certo e redireciona; quem reflete o novo estado é o próximo carregamento
// de sessão (useAuth), igual ao resto do bloqueio por trial.

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { assinarPlanoNexofy } from '../services/assinaturaNexofyService';
import { PLANOS_NEXOFY, resolverValorAssinatura } from '../lib/planosNexofy';
import { showToast } from '../components/shared/Toast';
import Button from '../components/ui/Button';
import Input, { FormField } from '../components/ui/Input';
import Surface from '../components/ui/Surface';

const CARTAO_VAZIO = { holderName: '', number: '', expiryMonth: '', expiryYear: '', ccv: '' };
const TITULAR_VAZIO = { name: '', email: '', cpfCnpj: '', postalCode: '', addressNumber: '', phone: '' };

function formatarMoeda(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 });
}

export default function UpgradePlano() {
  const { estudioId, nomeUsuario } = useAuth();
  const navigate = useNavigate();

  const [plano, setPlano] = useState('essencial');
  const [ciclo, setCiclo] = useState('mensal');
  const [cartao, setCartao] = useState(CARTAO_VAZIO);
  const [titular, setTitular] = useState({ ...TITULAR_VAZIO, name: nomeUsuario ?? '' });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);

  const valor = resolverValorAssinatura(plano, ciclo);

  function atualizarCartao(campo, valorCampo) {
    setCartao((atual) => ({ ...atual, [campo]: valorCampo }));
  }

  function atualizarTitular(campo, valorCampo) {
    setTitular((atual) => ({ ...atual, [campo]: valorCampo }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!estudioId || enviando) return;

    setErro(null);
    setEnviando(true);
    try {
      await assinarPlanoNexofy({ estudioId, plano, ciclo, cartao, titular });
      showToast.success('Assinatura enviada! Confirmando o pagamento…');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      console.error('[UpgradePlano] Erro ao assinar:', err);
      setErro(err?.message || 'Erro ao processar assinatura.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <CreditCard size={28} className="text-primary" />
          </div>
          <h1 className="text-xl font-black text-foreground tracking-tight">Assinar plano Nexofy</h1>
          <p className="mt-2 text-sm text-muted-foreground">Escolha o plano e informe o cartão pra continuar usando a Nexofy.</p>
        </div>

        <Surface className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plano</p>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(PLANOS_NEXOFY).map(([chave, config]) => (
                  <button
                    key={chave}
                    type="button"
                    onClick={() => setPlano(chave)}
                    className={`rounded-xl border p-4 text-left transition-colors ${
                      plano === chave ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <p className="font-bold text-foreground">{config.label}</p>
                    <p className="text-sm text-muted-foreground">{formatarMoeda(config.valorMensal)}/mês</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ciclo de cobrança</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCiclo('mensal')}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    ciclo === 'mensal' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                  }`}
                >
                  <p className="font-bold text-foreground">Mensal</p>
                  <p className="text-sm text-muted-foreground">{formatarMoeda(resolverValorAssinatura(plano, 'mensal'))}/mês</p>
                </button>
                <button
                  type="button"
                  onClick={() => setCiclo('anual')}
                  className={`rounded-xl border p-4 text-left transition-colors ${
                    ciclo === 'anual' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                  }`}
                >
                  <p className="font-bold text-foreground">Anual</p>
                  <p className="text-sm text-muted-foreground">{formatarMoeda(resolverValorAssinatura(plano, 'anual'))}/ano — 2 meses grátis</p>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cartão de crédito</p>
              <FormField label="Nome impresso no cartão" required>
                <Input value={cartao.holderName} onChange={(e) => atualizarCartao('holderName', e.target.value)} required />
              </FormField>
              <FormField label="Número do cartão" required>
                <Input inputMode="numeric" value={cartao.number} onChange={(e) => atualizarCartao('number', e.target.value.replace(/\D/g, ''))} required />
              </FormField>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Mês" required>
                  <Input inputMode="numeric" placeholder="MM" maxLength={2} value={cartao.expiryMonth} onChange={(e) => atualizarCartao('expiryMonth', e.target.value.replace(/\D/g, ''))} required />
                </FormField>
                <FormField label="Ano" required>
                  <Input inputMode="numeric" placeholder="AAAA" maxLength={4} value={cartao.expiryYear} onChange={(e) => atualizarCartao('expiryYear', e.target.value.replace(/\D/g, ''))} required />
                </FormField>
                <FormField label="CVV" required>
                  <Input inputMode="numeric" maxLength={4} value={cartao.ccv} onChange={(e) => atualizarCartao('ccv', e.target.value.replace(/\D/g, ''))} required />
                </FormField>
              </div>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dados do titular</p>
              <FormField label="Nome completo" required>
                <Input value={titular.name} onChange={(e) => atualizarTitular('name', e.target.value)} required />
              </FormField>
              <FormField label="E-mail" required>
                <Input type="email" value={titular.email} onChange={(e) => atualizarTitular('email', e.target.value)} required />
              </FormField>
              <FormField label="CPF ou CNPJ" required>
                <Input inputMode="numeric" value={titular.cpfCnpj} onChange={(e) => atualizarTitular('cpfCnpj', e.target.value.replace(/\D/g, ''))} required />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="CEP" required>
                  <Input inputMode="numeric" value={titular.postalCode} onChange={(e) => atualizarTitular('postalCode', e.target.value.replace(/\D/g, ''))} required />
                </FormField>
                <FormField label="Número do endereço" required>
                  <Input value={titular.addressNumber} onChange={(e) => atualizarTitular('addressNumber', e.target.value)} required />
                </FormField>
              </div>
              <FormField label="Telefone" required>
                <Input inputMode="numeric" value={titular.phone} onChange={(e) => atualizarTitular('phone', e.target.value.replace(/\D/g, ''))} required />
              </FormField>
            </div>

            {erro && (
              <p className="text-sm font-medium text-destructive" role="alert">{erro}</p>
            )}

            <Button type="submit" fullWidth size="lg" loading={enviando} leftIcon={<CheckCircle2 size={18} />}>
              Assinar {PLANOS_NEXOFY[plano].label} — {formatarMoeda(valor)}
              {ciclo === 'anual' ? '/ano' : '/mês'}
            </Button>
          </form>
        </Surface>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Adicionar o import em `App.jsx`**

Em `webapp/src/App.jsx:65`, logo depois de `import EstudioBloqueado from './pages/EstudioBloqueado';`:

```jsx
import UpgradePlano from './pages/UpgradePlano';
```

- [ ] **Step 3: Adicionar a rota em `App.jsx`**

Em `webapp/src/App.jsx:240-242`, logo depois do bloco da rota `/estudio-bloqueado` (mesmo padrão: sessão ativa exigida, sem exigir perfil resolvido nem estúdio ativo):

```jsx
        {/*
          Upgrade self-service (PED-115). Mesmo padrão de /estudio-bloqueado:
          exige sessão ativa, mas não exige perfil resolvido nem estúdio
          ativo — é acessível justamente por quem está bloqueado por trial
          expirado, pra sair do bloqueio.
        */}
        <Route path="/upgrade" element={
          !sessao ? <Navigate to="/login" replace /> : <UpgradePlano />
        } />
```

- [ ] **Step 4: Testar manualmente no navegador**

Rode o dev server (`npm run dev` em `webapp/`), navegue logado como admin de um estúdio de teste até `/upgrade` diretamente pela URL, preencha o formulário com os dados de sandbox usados na Task 3 e confirme que o submit funciona (toast de sucesso, redirect pro dashboard) e que erro de cartão recusado aparece inline sem quebrar a tela.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/pages/UpgradePlano.jsx webapp/src/App.jsx
git commit -m "feat(web): tela de upgrade self-service (PED-115)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: CTA "Assinar agora" no `TrialBanner.jsx`

**Files:**
- Modify: `webapp/src/components/shared/TrialBanner.jsx` (arquivo inteiro, 39 linhas)

**Interfaces:**
- Consumes: rota `/upgrade` (Task 6).

- [ ] **Step 1: Adicionar o link quando o trial está urgente (≤3 dias)**

```jsx
// webapp/src/components/shared/TrialBanner.jsx
//
// Banner discreto com os dias restantes do trial de 14 dias (PED-105),
// visível do dia 1 ao dia 14. Só aparece pro admin do estúdio — é quem
// decide sobre upgrade, professores/alunos não precisam ver. Fica em
// fluxo normal (não fixed): nunca coexiste com BannerImpersonation, já
// que impersonation é sempre perfil 'super_admin', nunca 'admin'.
//
// PED-115: quando urgente (≤3 dias), ganha um link pra /upgrade — antes
// disso o banner é só informativo, sem CTA, pra não pressionar cedo demais.

import React from 'react';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { diasRestantesTrial } from '../../lib/trial';

const LIMITE_DIAS_URGENTE = 3;

export default function TrialBanner() {
  const { perfil, estudioStatusInfo } = useAuth();

  if (perfil !== 'admin') return null;

  const dias = diasRestantesTrial(estudioStatusInfo?.trial_ends_at);
  if (dias === null || dias < 0) return null;

  const urgente = dias <= LIMITE_DIAS_URGENTE;

  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold shrink-0 text-center ${
        urgente ? 'bg-warning text-warning-foreground' : 'bg-info-soft text-info'
      }`}
    >
      <Clock size={15} className="shrink-0" />
      <span>
        Período de teste — {dias === 0 ? 'último dia' : `faltam ${dias} dia${dias === 1 ? '' : 's'}`}
      </span>
      {urgente && (
        <Link to="/upgrade" className="underline underline-offset-2 hover:no-underline">
          Assinar agora
        </Link>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Testar manualmente**

Force `trial_ends_at` de um estúdio de teste pra 2 dias no futuro (via SQL local), recarregue o dashboard logado como admin desse estúdio, confirme que o banner fica com o tom de urgência e o link "Assinar agora" aparece e navega pra `/upgrade`.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/components/shared/TrialBanner.jsx
git commit -m "feat(web): CTA de assinatura no banner de trial urgente (PED-115)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: CTA "Assinar agora" no `EstudioBloqueado.jsx`

**Files:**
- Modify: `webapp/src/pages/EstudioBloqueado.jsx:1-97` (arquivo inteiro)

**Interfaces:**
- Consumes: rota `/upgrade` (Task 6), `chaveMensagemBloqueio` de `../lib/trial` (já existe).

- [ ] **Step 1: Adicionar o botão primário quando o bloqueio é por trial expirado**

```jsx
// webapp/src/pages/EstudioBloqueado.jsx
//
// Tela exibida quando o usuário logado (admin/professor) pertence a um
// estúdio cujo `status` não é 'ativo' (inativo, suspenso ou cancelado) OU
// cujo trial expirou. A resolução vem do AuthContext (useAuth) via RPC
// verificar_status_estudio, que roda SECURITY DEFINER e por isso funciona
// mesmo com o estúdio bloqueado no RLS (meu_estudio_id()/estudio_id_atual()
// retornam null nesse cenário, cortando todo o resto dos dados em cascata).
//
// super_admin NUNCA cai aqui: ele acessa qualquer estúdio via
// impersonation (estudio_ativo_via_override()), que é um caminho à parte.
//
// PED-115: quando o motivo é especificamente trial_expirado, a ação
// primária vira "Assinar agora" (pra /upgrade) em vez de só suporte — é a
// saída self-service do bloqueio. Pros outros motivos (inativo/suspenso/
// cancelado, decididos pelo time), a única ação continua sendo suporte.

import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, LogOut, Mail, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/ui/Button';
import { chaveMensagemBloqueio } from '../lib/trial';

const MENSAGENS_POR_STATUS = {
  inativo: {
    titulo: 'Estúdio inativo',
    descricao:
      'O acesso a este estúdio está temporariamente pausado. Se você acredita que isso é um engano, entre em contato com o suporte.',
  },
  suspenso: {
    titulo: 'Estúdio suspenso',
    descricao:
      'O acesso a este estúdio foi suspenso pela administração da plataforma. Entre em contato com o suporte para regularizar a situação.',
  },
  cancelado: {
    titulo: 'Estúdio encerrado',
    descricao:
      'Este estúdio foi encerrado e não está mais disponível. Entre em contato com o suporte se precisar de mais informações.',
  },
  trial_expirado: {
    titulo: 'Período de teste encerrado',
    descricao:
      'Seus 14 dias de teste grátis chegaram ao fim. Assine um plano pra continuar usando a Nexofy.',
  },
};

const MENSAGEM_PADRAO = {
  titulo: 'Acesso indisponível',
  descricao:
    'Não foi possível liberar o acesso a este estúdio no momento. Entre em contato com o suporte.',
};

export default function EstudioBloqueado() {
  const { estudioStatusInfo, nomeUsuario } = useAuth();

  const nomeEstudio = estudioStatusInfo?.nome ?? 'seu estúdio';
  const chave = chaveMensagemBloqueio(estudioStatusInfo);
  const { titulo, descricao } = MENSAGENS_POR_STATUS[chave] ?? MENSAGEM_PADRAO;
  const ehTrialExpirado = chave === 'trial_expirado';

  async function handleSair() {
    await supabase.auth.signOut();
    // O AppRoutes reage à mudança de sessão e redireciona pro /login sozinho.
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card shadow-card p-8 text-center">
        <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-warning-soft flex items-center justify-center">
          <AlertTriangle size={28} className="text-warning" />
        </div>

        <h1 className="text-xl font-black text-foreground tracking-tight">{titulo}</h1>

        <p className="mt-2 text-sm font-bold text-muted-foreground">{nomeEstudio}</p>

        <p className="mt-4 text-sm text-muted-foreground leading-relaxed">{descricao}</p>

        {nomeUsuario && (
          <p className="mt-4 text-xs text-muted-foreground">
            Conectado como <span className="font-bold text-foreground">{nomeUsuario}</span>
          </p>
        )}

        <div className="mt-8 flex flex-col gap-3">
          {ehTrialExpirado && (
            <Button as={Link} to="/upgrade" leftIcon={<CreditCard size={16} />}>
              Assinar agora
            </Button>
          )}

          <a
            href="mailto:suporte@nexofy.app"
            className="inline-flex items-center justify-center gap-2 text-sm font-bold text-primary hover:underline"
          >
            <Mail size={15} />
            Falar com o suporte
          </a>

          <Button variant="ghost" onClick={handleSair} className="w-full">
            <LogOut size={16} className="mr-2" />
            Sair
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Testar manualmente**

Force `trial_ends_at` de um estúdio de teste pro passado (via SQL local), recarregue logado como admin desse estúdio — confirme redirect pra `/estudio-bloqueado`, confirme que aparece "Assinar agora" como botão primário levando pra `/upgrade`, e que pros outros motivos de bloqueio (mude `status` do estúdio pra `'suspenso'` num segundo teste) o botão não aparece, só o link de suporte.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/pages/EstudioBloqueado.jsx
git commit -m "feat(web): CTA de assinatura na tela de trial expirado (PED-115)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Verificação end-to-end e configuração de secrets em staging

**Files:** nenhum arquivo novo — task de configuração/validação.

- [ ] **Step 1: Configurar secrets em staging**

Confirme com o usuário qual `project_ref` do Supabase é staging (repo tem múltiplos projetos — não assuma). Then:

```bash
supabase secrets set ASAAS_WEBHOOK_TOKEN_NEXOFY=<token-novo-gerado> --project-ref <ref-do-staging>
```

`ASAAS_API_URL` e `ASAAS_MASTER_API_KEY` já devem existir em staging (usados por `criar-subconta-asaas`) — confirme com `supabase secrets list --project-ref <ref-do-staging>`.

- [ ] **Step 2: Deploy das duas edge functions em staging**

```bash
supabase functions deploy assinar-plano-nexofy --project-ref <ref-do-staging>
supabase functions deploy webhook-assinatura-nexofy --project-ref <ref-do-staging>
```

- [ ] **Step 3: Configurar o segundo webhook no painel da Asaas (sandbox)**

No painel Asaas (ambiente sandbox), Integrações > Webhooks, adicione uma **nova** configuração de webhook apontando pra `https://<ref-do-staging>.supabase.co/functions/v1/webhook-assinatura-nexofy`, evento de pagamento, com o mesmo Access Token setado em `ASAAS_WEBHOOK_TOKEN_NEXOFY`. Não reaproveite a configuração existente do `webhook-pagamento` — são dois webhooks distintos na Asaas agora.

- [ ] **Step 4: Passagem manual completa em staging**

Com um estúdio de teste em staging com trial expirado: logar como admin, cair em `/estudio-bloqueado`, clicar "Assinar agora", preencher com cartão de sandbox, confirmar `200` na criação, aguardar o webhook real da Asaas chegar (segundos), recarregar a página e confirmar que o bloqueio sumiu (o `estudio_id_atual()` já libera sozinho com `trial_ends_at = NULL`). Confirme também no banco de staging: `assinatura_status = 'ativa'`, `plano_nexofy`/`ciclo_cobranca` preenchidos corretamente.

- [ ] **Step 5: Rodar a suite completa de testes de frontend**

Run: `cd webapp && npm test`
Expected: todos os testes passando, incluindo os novos de `planosNexofy.test.js`.
