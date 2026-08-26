# PED-17 — Reconciliação financeira (mensalidades × asaas_status local × repasses)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um relatório (edge function) que um admin pode chamar para um estúdio+mês e recebe de volta a lista de mensalidades com divergência entre o que está registrado localmente e o que deveria ser verdade, para detectar problemas antes que o cliente perceba.

**Architecture:** Edge function `relatorio-reconciliacao-financeira`, mesmo padrão de auth de `gerar-repasses` (Bearer JWT de admin/super_admin do estúdio). Busca `mensalidades` do período e `repasses_lancamentos` vinculados, e roda 4 checagens **usando só dados já sincronizados localmente** (decisão confirmada — sem chamar a API do Asaas ao vivo, para manter o relatório rápido e sem depender de rate limit externo). A lógica de detecção de divergência é uma função pura (sem I/O), testável isoladamente com `deno test`.

**Tech Stack:** Deno Edge Functions (Supabase), `@supabase/supabase-js`.

**Spec:** Ticket Linear [PED-17](https://linear.app/pedro-schuster/issue/PED-17/financeiro-reconciliacao-financeira-mensalidades-x-cobrancas-asaas-x) — "Criar um relatório/query simples que compare `mensalidades` geradas x cobranças na Asaas x repasses calculados, para detectar divergência antes que o cliente perceba."

## Global Constraints

- Decisão de produto confirmada: comparação 100% com dados locais já sincronizados (`mensalidades.asaas_status`, `asaas_payment_id`) — **sem** chamada à API do Asaas no momento do relatório.
- Sem nova migração de banco — tudo implementado em TypeScript na edge function, reaproveitando tabelas existentes (`mensalidades`, `repasses_lancamentos`).
- Escopo é backend (edge function retornando JSON); não inclui página de frontend — pode ser consumido manualmente ou por uma UI futura.
- Mesmo padrão de isolamento multi-tenant do resto do projeto: toda query filtra por `estudio_id` explicitamente (service role ignora RLS).
- Cada divergência reportada deve ter uma explicação legível (não só um código), porque este relatório é para um humano decidir o que fazer.

---

## File Structure

- **Create** `supabase/functions/_shared/reconciliacao.ts` — função pura `detectarDivergencias(mensalidades, repasses, hoje)` com as 4 checagens; sem chamadas de rede/banco, só transforma dados já buscados.
- **Create** `supabase/functions/relatorio-reconciliacao-financeira/index.ts` — HTTP handler: auth, busca dados, chama `detectarDivergencias`, retorna JSON.
- **Create** `supabase/functions/relatorio-reconciliacao-financeira/config.toml` — `verify_jwt = true` (função exige JWT de usuário, sem bypass de cron — é um relatório sob demanda).
- **Test** `supabase/functions/_shared/reconciliacao.test.ts`.

---

### Task 1: Função pura de detecção de divergências

**Files:**
- Create: `supabase/functions/_shared/reconciliacao.ts`
- Test: `supabase/functions/_shared/reconciliacao.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  interface MensalidadeReconciliacao {
    id: string;
    aluno_id: string | null;
    tipo_aula: string;
    status: string;
    valor_pago: number | null;
    valor_cobranca: number | null;
    asaas_payment_id: string | null;
    asaas_status: string | null;
    data_vencimento: string; // YYYY-MM-DD
  }
  interface RepasseReconciliacao {
    mensalidade_id: string | null;
  }
  interface Divergencia {
    mensalidadeId: string;
    tipos: string[];       // ex: ["pago_sem_repasse", "valor_divergente"]
    detalhes: string[];    // uma frase legível por tipo, mesma ordem
  }
  function detectarDivergencias(
    mensalidades: MensalidadeReconciliacao[],
    repasses: RepasseReconciliacao[],
    hoje: Date,
  ): Divergencia[]
  ```
  Usada pelo Task 2.

- [ ] **Step 1: Escrever os testes (um por checagem + um caso sem divergência)**

```typescript
// supabase/functions/_shared/reconciliacao.test.ts
import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { detectarDivergencias } from "./reconciliacao.ts";

const HOJE = new Date("2026-08-26T12:00:00Z");

function mens(overrides: Partial<Parameters<typeof detectarDivergencias>[0][number]> = {}) {
  return {
    id: "m1",
    aluno_id: "a1",
    tipo_aula: "regular",
    status: "pendente",
    valor_pago: null,
    valor_cobranca: 100,
    asaas_payment_id: null,
    asaas_status: null,
    data_vencimento: "2026-08-10",
    ...overrides,
  };
}

Deno.test("sem divergência quando tudo bate", () => {
  const mensalidades = [mens({
    id: "m1", status: "pago", valor_pago: 100, valor_cobranca: 100,
  })];
  const repasses = [{ mensalidade_id: "m1" }];
  assertEquals(detectarDivergencias(mensalidades, repasses, HOJE), []);
});

Deno.test("pago_sem_valor: status pago mas valor_pago nulo", () => {
  const mensalidades = [mens({ id: "m1", status: "pago", valor_pago: null })];
  const divergencias = detectarDivergencias(mensalidades, [], HOJE);
  assertEquals(divergencias.length, 1);
  assertEquals(divergencias[0].mensalidadeId, "m1");
  assertEquals(divergencias[0].tipos, ["pago_sem_valor", "pago_sem_repasse"]);
});

Deno.test("pago_sem_repasse: pago, aluno vinculado, tipo elegível, sem lançamento", () => {
  const mensalidades = [mens({ id: "m1", status: "pago", valor_pago: 100 })];
  const divergencias = detectarDivergencias(mensalidades, [], HOJE);
  assertEquals(divergencias.map(d => d.mensalidadeId), ["m1"]);
  assertEquals(divergencias[0].tipos, ["pago_sem_repasse"]);
});

Deno.test("pago_sem_repasse não dispara quando já existe repasse vinculado", () => {
  const mensalidades = [mens({ id: "m1", status: "pago", valor_pago: 100 })];
  const repasses = [{ mensalidade_id: "m1" }];
  assertEquals(detectarDivergencias(mensalidades, repasses, HOJE), []);
});

Deno.test("pago_sem_repasse não dispara sem aluno vinculado (visitante)", () => {
  const mensalidades = [mens({ id: "m1", status: "pago", valor_pago: 100, aluno_id: null })];
  assertEquals(detectarDivergencias(mensalidades, [], HOJE), []);
});

Deno.test("valor_divergente: valor_pago diferente de valor_cobranca (fora da tolerância de 1 centavo)", () => {
  const mensalidades = [mens({
    id: "m1", status: "pago", valor_pago: 90, valor_cobranca: 100,
  })];
  const repasses = [{ mensalidade_id: "m1" }]; // isola o teste da checagem pago_sem_repasse
  const divergencias = detectarDivergencias(mensalidades, repasses, HOJE);
  assertEquals(divergencias[0].tipos, ["valor_divergente"]);
});

Deno.test("valor_divergente não dispara com diferença de 1 centavo (arredondamento)", () => {
  const mensalidades = [mens({
    id: "m1", status: "pago", valor_pago: 99.995, valor_cobranca: 100,
  })];
  const repasses = [{ mensalidade_id: "m1" }];
  assertEquals(detectarDivergencias(mensalidades, repasses, HOJE), []);
});

Deno.test("sem_retorno_webhook: cobrança criada no Asaas, vencida, sem nenhum retorno de status", () => {
  const mensalidades = [mens({
    id: "m1", status: "pendente", asaas_payment_id: "pay_1", asaas_status: null,
    data_vencimento: "2026-08-01", // vencida em relação a HOJE (26/08)
  })];
  const divergencias = detectarDivergencias(mensalidades, [], HOJE);
  assertEquals(divergencias[0].tipos, ["sem_retorno_webhook"]);
});

Deno.test("sem_retorno_webhook não dispara antes do vencimento", () => {
  const mensalidades = [mens({
    id: "m1", status: "pendente", asaas_payment_id: "pay_1", asaas_status: null,
    data_vencimento: "2026-09-10", // ainda não venceu
  })];
  assertEquals(detectarDivergencias(mensalidades, [], HOJE), []);
});

Deno.test("sem_retorno_webhook não dispara quando asaas_status já foi preenchido (webhook respondeu)", () => {
  const mensalidades = [mens({
    id: "m1", status: "pendente", asaas_payment_id: "pay_1", asaas_status: "PENDING",
    data_vencimento: "2026-08-01",
  })];
  assertEquals(detectarDivergencias(mensalidades, [], HOJE), []);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `deno test supabase/functions/_shared/reconciliacao.test.ts`
Expected: FAIL — `Module not found "./reconciliacao.ts"`

- [ ] **Step 3: Implementar `_shared/reconciliacao.ts`**

```typescript
// supabase/functions/_shared/reconciliacao.ts
//
// PED-17 — detecção de divergências financeiras usando SÓ dados já
// sincronizados localmente (mensalidades.asaas_status/asaas_payment_id,
// preenchidos pelo webhook-pagamento) comparados contra repasses_lancamentos.
// Não chama a API do Asaas — decisão de produto: relatório rápido, sem
// depender de disponibilidade/rate-limit externo. Se `asaas_status` local
// estiver desatualizado (bug no webhook), este relatório não pega esse
// caso — é uma limitação conhecida, não um bug deste módulo.
//
// Função pura (sem I/O) para ser testável sem mocks de banco/rede.

// Tipos de aula que geram repasse — mesmo conjunto tratado em
// _shared/repasses.ts (gerarRepassesParaMensalidade). Mantido em sincronia
// manualmente: se um novo tipo de aula passar a gerar repasse lá, adicionar
// aqui também.
const TIPOS_QUE_GERAM_REPASSE = new Set(["regular", "plano_livre", "avulsa", "experimental"]);

const TOLERANCIA_CENTAVOS = 0.01;

export interface MensalidadeReconciliacao {
  id: string;
  aluno_id: string | null;
  tipo_aula: string;
  status: string;
  valor_pago: number | null;
  valor_cobranca: number | null;
  asaas_payment_id: string | null;
  asaas_status: string | null;
  data_vencimento: string;
}

export interface RepasseReconciliacao {
  mensalidade_id: string | null;
}

export interface Divergencia {
  mensalidadeId: string;
  tipos: string[];
  detalhes: string[];
}

export function detectarDivergencias(
  mensalidades: MensalidadeReconciliacao[],
  repasses: RepasseReconciliacao[],
  hoje: Date,
): Divergencia[] {
  const mensalidadesComRepasse = new Set(
    repasses.map(r => r.mensalidade_id).filter((id): id is string => id !== null),
  );
  const hojeIso = hoje.toISOString().substring(0, 10);

  const resultado: Divergencia[] = [];

  for (const m of mensalidades) {
    const tipos: string[] = [];
    const detalhes: string[] = [];

    if (m.status === "pago" && m.valor_pago === null) {
      tipos.push("pago_sem_valor");
      detalhes.push("Status é 'pago' mas valor_pago está nulo.");
    }

    if (
      m.status === "pago" &&
      m.aluno_id !== null &&
      TIPOS_QUE_GERAM_REPASSE.has(m.tipo_aula) &&
      !mensalidadesComRepasse.has(m.id)
    ) {
      tipos.push("pago_sem_repasse");
      detalhes.push(`Mensalidade paga (tipo '${m.tipo_aula}') sem nenhum repasse gerado.`);
    }

    if (
      m.status === "pago" &&
      m.valor_pago !== null &&
      m.valor_cobranca !== null &&
      Math.abs(m.valor_pago - m.valor_cobranca) > TOLERANCIA_CENTAVOS
    ) {
      tipos.push("valor_divergente");
      detalhes.push(`valor_pago (${m.valor_pago}) difere de valor_cobranca (${m.valor_cobranca}).`);
    }

    if (
      m.asaas_payment_id !== null &&
      m.asaas_status === null &&
      m.status === "pendente" &&
      m.data_vencimento < hojeIso
    ) {
      tipos.push("sem_retorno_webhook");
      detalhes.push("Cobrança criada no Asaas e vencida, mas nunca recebemos nenhum retorno de status via webhook.");
    }

    if (tipos.length > 0) {
      resultado.push({ mensalidadeId: m.id, tipos, detalhes });
    }
  }

  return resultado;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `deno test supabase/functions/_shared/reconciliacao.test.ts`
Expected: PASS (10 testes)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/reconciliacao.ts supabase/functions/_shared/reconciliacao.test.ts
git commit -m "feat(financeiro): detectarDivergencias - lógica de reconciliação financeira (PED-17)"
```

---

### Task 2: Edge function `relatorio-reconciliacao-financeira`

**Files:**
- Create: `supabase/functions/relatorio-reconciliacao-financeira/index.ts`
- Create: `supabase/functions/relatorio-reconciliacao-financeira/config.toml`

**Interfaces:**
- Consumes: `detectarDivergencias` de `../_shared/reconciliacao.ts` (Task 1).

- [ ] **Step 1: Criar `config.toml`**

```toml
# supabase/functions/relatorio-reconciliacao-financeira/config.toml
verify_jwt = true
```

- [ ] **Step 2: Implementar `index.ts`**

```typescript
// supabase/functions/relatorio-reconciliacao-financeira/index.ts
//
// PED-17 — compara mensalidades x asaas_status/asaas_payment_id (já
// sincronizados localmente pelo webhook) x repasses_lancamentos, para
// detectar divergências financeiras antes que o cliente perceba.
//
// Chamada via: supabase.functions.invoke('relatorio-reconciliacao-financeira',
//   { body: { estudioId, mes, ano } })
//
// Mesmo padrão de auth de gerar-repasses: exige JWT de admin/super_admin
// do estúdio-alvo — este relatório expõe dados financeiros completos.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withSentry } from "../_shared/sentry.ts";
import { detectarDivergencias } from "../_shared/reconciliacao.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function response(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(withSentry("relatorio-reconciliacao-financeira", async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { estudioId, mes, ano } = await req.json();

    if (!estudioId) return response({ error: 'estudioId é obrigatório.' }, 400);
    if (!mes || !ano) return response({ error: 'mes e ano são obrigatórios.' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey     = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return response({ error: 'Não autorizado.' }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return response({ error: 'Não autorizado.' }, 401);
    }

    const { data: membro, error: membroErr } = await supabase
      .from('estudio_membros')
      .select('role')
      .eq('user_id', user.id)
      .eq('estudio_id', estudioId)
      .maybeSingle();
    if (membroErr) throw membroErr;
    if (!membro || !['admin', 'super_admin'].includes(membro.role)) {
      return response({ error: 'Acesso negado.' }, 403);
    }

    const mesStr = String(mes).padStart(2, '0');
    const inicio = `${ano}-${mesStr}-01`;
    const ultimoDia = new Date(Number(ano), Number(mes), 0).getDate();
    const fim = `${ano}-${mesStr}-${String(ultimoDia).padStart(2, '0')}`;

    const { data: mensalidades, error: errMens } = await supabase
      .from('mensalidades')
      .select('id, aluno_id, tipo_aula, status, valor_pago, valor_cobranca, asaas_payment_id, asaas_status, data_vencimento')
      .eq('estudio_id', estudioId)
      .gte('data_vencimento', inicio)
      .lte('data_vencimento', fim);

    if (errMens) throw errMens;

    const idsMensalidades = (mensalidades ?? []).map(m => m.id);
    const { data: repasses, error: errRepasses } = idsMensalidades.length === 0
      ? { data: [], error: null }
      : await supabase
          .from('repasses_lancamentos')
          .select('mensalidade_id')
          .eq('estudio_id', estudioId)
          .in('mensalidade_id', idsMensalidades);

    if (errRepasses) throw errRepasses;

    const divergencias = detectarDivergencias(mensalidades ?? [], repasses ?? [], new Date());

    const resumo: Record<string, number> = {};
    for (const d of divergencias) {
      for (const tipo of d.tipos) {
        resumo[tipo] = (resumo[tipo] ?? 0) + 1;
      }
    }

    return response({
      estudioId,
      mes: Number(mes),
      ano: Number(ano),
      totalMensalidades: mensalidades?.length ?? 0,
      totalDivergencias: divergencias.length,
      resumo,
      divergencias,
    });

  } catch (err) {
    const message =
      err instanceof Error ? err.message
      : typeof err === 'object' && err !== null ? JSON.stringify(err)
      : String(err);
    console.error('[relatorio-reconciliacao-financeira] ERRO:', message);
    return response({ error: message }, 500);
  }
}));
```

- [ ] **Step 3: Checagem de tipos**

Run: `deno check supabase/functions/relatorio-reconciliacao-financeira/index.ts`
Expected: sem erros.

- [ ] **Step 4: Validação manual local**

```bash
supabase functions serve relatorio-reconciliacao-financeira --env-file supabase/.env.local
```

```bash
curl -s -X POST http://localhost:54321/functions/v1/relatorio-reconciliacao-financeira \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <JWT de um admin>" \
  -d '{"estudioId":"<uuid do estúdio de teste>","mes":8,"ano":2026}' | jq
```

Esperado: JSON com `totalMensalidades`, `resumo` e `divergencias` (vazio se os dados de teste locais estiverem consistentes — force uma divergência manualmente, ex. `update mensalidades set status='pago', valor_pago=null where id=...`, e rode de novo para confirmar que `pago_sem_valor` aparece).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/relatorio-reconciliacao-financeira/
git commit -m "feat(financeiro): edge function relatorio-reconciliacao-financeira (PED-17)"
```

---

## Self-Review

1. **Cobertura do spec:** "compare mensalidades x cobranças Asaas x repasses" → as 4 checagens em `detectarDivergencias` cobrem inconsistência de valor, ausência de repasse, e ausência de retorno do Asaas — usando a fonte de dados que o usuário confirmou (local, sem API ao vivo). "detectar divergência antes que o cliente perceba" → relatório sob demanda, admin pode rodar proativamente por estúdio/mês. ✅
2. **Placeholder scan:** nenhum. A limitação de "não pega asaas_status desatualizado por bug no webhook" está documentada explicitamente como escopo conhecido, não como TODO.
3. **Consistência de tipos:** `detectarDivergencias(mensalidades, repasses, hoje)` — mesma assinatura no Task 1 (produtor/teste) e Task 2 (consumidor). Os campos de `MensalidadeReconciliacao`/`RepasseReconciliacao` batem exatamente com as colunas selecionadas na query do Task 2 Step 2.
