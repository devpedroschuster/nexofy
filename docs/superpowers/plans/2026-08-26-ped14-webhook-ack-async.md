# PED-14 — Webhook Asaas: ack rápido + processamento assíncrono

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `webhook-pagamento` responde 200 em menos de 2s, é idempotente contra reentregas do Asaas, rejeita eventos fora de ordem, e move o trabalho pesado (gerar repasse, notificar o aluno) para depois da resposta via `EdgeRuntime.waitUntil`.

**Architecture:** Grava o evento em `webhook_events` com `ON CONFLICT DO NOTHING` logo no início (idempotência) — se já existir, responde 200 e para. Compara `asaas_event_timestamp` da mensalidade contra o timestamp do evento recebido para descartar reentregas tardias fora de ordem. Faz o UPDATE essencial de `mensalidades`/`alunos` (rápido, já existe hoje) e responde. Só depois disso, dentro de `EdgeRuntime.waitUntil`, chama a geração de repasse (lógica extraída para um módulo compartilhado `_shared/repasses.ts`, reaproveitada por `gerar-repasses/index.ts`) e envia um push Expo de confirmação de pagamento.

**Tech Stack:** Deno Edge Functions (Supabase), `@supabase/supabase-js`, `@sentry/deno`, Expo Push API.

**Spec:** Ticket Linear [PED-14](https://linear.app/pedro-schuster/issue/PED-14/financeiro-resposta-rapida-ack-2s-processamento-assincrono-no-webhook) — "Webhook deve responder 200 em <2s (ack) e delegar processamento pesado (gerar repasse, notificar) para fora do hot path, evitando timeout/reentrega em cascata."

## Global Constraints

- Não introduzir fila/worker externo (Inngest, BullMQ, QStash) — o projeto não usa nenhum; a decisão confirmada foi usar `EdgeRuntime.waitUntil()`.
- Decisão de produto confirmada: o webhook passa a gerar repasse automaticamente na confirmação de pagamento via Asaas (hoje só acontecia via confirmação manual do admin no frontend).
- Não modificar a autenticação HTTP existente de `gerar-repasses/index.ts` (continua exigindo Bearer JWT de admin/super_admin) — o webhook chama a lógica compartilhada diretamente em processo, sem HTTP, sem novo bypass de auth.
- Não tocar em `lembretes-aula/index.ts` — é uma function separada e funcionando; o helper de push é uma nova função mínima, não uma refatoração daquela function.
- Todo código novo em Deno/TypeScript segue o estilo existente (funções `response()`, `withSentry()`, comentários em português explicando o "porquê").
- Sem framework de teste configurado no repo para edge functions — validar lógica pura extraída com `deno test` (sem necessidade de instalar nada, `deno test` é nativo), e validar o handler HTTP manualmente via `supabase functions serve` + `curl`.

---

## File Structure

- **Create** `supabase/functions/_shared/repasses.ts` — lógica de cálculo/inserção de repasse para UMA mensalidade, extraída de `gerar-repasses/index.ts` (sem mudar comportamento), para ser chamada tanto pelo endpoint HTTP quanto pelo webhook.
- **Create** `supabase/functions/_shared/expoPush.ts` — envio de uma única notificação push via Expo (não é a lógica em lote de `lembretes-aula`, é um helper novo e mínimo).
- **Create** `supabase/functions/_shared/backgroundTask.ts` — wrapper para `EdgeRuntime.waitUntil` com captura de erro via Sentry, usado por qualquer function que precise "responder e continuar depois".
- **Modify** `supabase/functions/gerar-repasses/index.ts` — passa a chamar `gerarRepassesParaMensalidade` do módulo compartilhado; HTTP/auth inalterados.
- **Modify** `supabase/functions/webhook-pagamento/index.ts` — idempotência, checagem de ordem, resposta antecipada, e disparo em background de repasse + notificação.
- **Test** `supabase/functions/_shared/repasses.test.ts`, `supabase/functions/_shared/backgroundTask.test.ts` — testes `deno test` para a lógica pura extraída.

---

### Task 1: Extrair `_shared/repasses.ts` de `gerar-repasses/index.ts`

**Files:**
- Create: `supabase/functions/_shared/repasses.ts`
- Modify: `supabase/functions/gerar-repasses/index.ts`
- Test: manual (ver Step 4) — a extração não muda lógica, só localização; testes automatizados de regra de negócio ficam no Task 3 (dedicado ao novo comportamento).

**Interfaces:**
- Produces: `gerarRepassesParaMensalidade(supabase: SupabaseClient, params: { estudioId: string; mensalidadeId: string }): Promise<{ sucesso?: boolean; aviso?: string; gerados: number; itens?: { modalidade: string; valor: number; tipo: string }[] }>` — usada pelos Tasks 2 e 4.

- [ ] **Step 1: Criar `supabase/functions/_shared/repasses.ts` com a lógica de negócio movida (idêntica) de `gerar-repasses/index.ts`**

```typescript
// supabase/functions/_shared/repasses.ts
//
// Lógica de geração de repasse para UMA mensalidade — extraída de
// gerar-repasses/index.ts (PED-14) para ser reaproveitada tanto pelo
// endpoint HTTP (admin confirma manualmente) quanto pelo webhook-pagamento
// (Asaas confirma automaticamente), sem duplicar a regra de cálculo.
//
// Esta função NÃO faz autenticação/autorização — isso é responsabilidade
// de quem chama (gerar-repasses/index.ts valida JWT de admin; webhook-pagamento
// chama diretamente com service role, já autenticado pelo token do Asaas).

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// REP-07: distribui `total` em centavos exatos entre `n` parcelas.
function distribuirCentavos(total: number, n: number): number[] {
  const totalCentavos = Math.round(total * 100);
  const baseCentavos = Math.floor(totalCentavos / n);
  const parcelasCentavos = Array(n).fill(baseCentavos);
  const restoCentavos = totalCentavos - baseCentavos * n;

  for (let i = 0; i < restoCentavos; i++) {
    parcelasCentavos[n - 1 - i] += 1;
  }
  return parcelasCentavos.map(c => c / 100);
}

interface ConfigRepasse {
  valor_1_modalidade: number;
  valor_multi_modalidade: number;
  plano_livre_pct_casa: number;
  plano_livre_pct_prof: number;
  aula_avulsa_valor: number;
  aula_avulsa_pct_prof: number;
  aula_avulsa_pct_casa: number;
  aula_experimental_valor: number;
  aula_experimental_pct_prof: number;
}

interface Mensalidade {
  id: string;
  estudio_id: string;
  aluno_id: string | null;
  plano_id: string | null;
  tipo_aula: string;
  valor_pago: number;
  professor_id: string | null;
  modalidade_nome: string | null;
  data_pagamento: string | null;
  data_vencimento: string;
}

export interface ResultadoGerarRepasses {
  sucesso?: boolean;
  aviso?: string;
  gerados: number;
  itens?: { modalidade: string; valor: number; tipo: string }[];
}

/**
 * Gera (ou regera) os repasses de UMA mensalidade específica.
 * Lança exceção em erro de banco/config ausente — quem chama decide como
 * reportar (HTTP 500 no endpoint, Sentry no background task do webhook).
 */
export async function gerarRepassesParaMensalidade(
  supabase: SupabaseClient,
  params: { estudioId: string; mensalidadeId: string },
): Promise<ResultadoGerarRepasses> {
  const { estudioId, mensalidadeId } = params;

  const { data: mens, error: errMens } = await supabase
    .from('mensalidades')
    .select('id, estudio_id, aluno_id, plano_id, tipo_aula, valor_pago, professor_id, modalidade_nome, data_pagamento, data_vencimento')
    .eq('id', mensalidadeId)
    .eq('estudio_id', estudioId)
    .single();

  if (errMens || !mens) {
    throw new Error('Mensalidade não encontrada.');
  }

  const mensalidade = mens as Mensalidade;

  if (!mensalidade.aluno_id) {
    return { aviso: 'Mensalidade sem aluno vinculado. Nenhum repasse gerado.', gerados: 0 };
  }

  const { data: config, error: errConfig } = await supabase
    .from('configuracoes_repasse')
    .select('valor_1_modalidade, valor_multi_modalidade, plano_livre_pct_casa, plano_livre_pct_prof, aula_avulsa_valor, aula_avulsa_pct_prof, aula_avulsa_pct_casa, aula_experimental_valor, aula_experimental_pct_prof')
    .eq('estudio_id', estudioId)
    .single();

  if (errConfig || !config) throw new Error('Configurações de repasse não encontradas.');
  const cfg = config as ConfigRepasse;

  const dataBase = mensalidade.data_pagamento || mensalidade.data_vencimento;
  const [anoRef, mesRef] = dataBase.substring(0, 7).split('-').map(Number);
  const mesStr = String(mesRef).padStart(2, '0');
  const dataReferencia = `${anoRef}-${mesStr}-01`;
  const ultimoDia = new Date(anoRef, mesRef, 0).getDate();
  const inicioPeriodo = dataReferencia;
  const fimPeriodo = `${anoRef}-${mesStr}-${String(ultimoDia).padStart(2, '0')}`;

  const itens: {
    estudio_id: string;
    professor_id: string;
    aluno_id: string;
    mensalidade_id: string;
    tipo_aula: string;
    modalidade: string;
    valor: number;
    data_referencia: string;
  }[] = [];

  const idsLoteRemover: string[] = [];

  const { data: repassesLote } = await supabase
    .from('repasses_lancamentos')
    .select('id, modalidade, tipo_aula')
    .eq('estudio_id', estudioId)
    .eq('aluno_id', mensalidade.aluno_id)
    .eq('data_referencia', dataReferencia)
    .is('mensalidade_id', null);

  const loteJaGerado = new Map<string, string>();
  for (const r of repassesLote ?? []) {
    loteJaGerado.set(`${r.modalidade}|${r.tipo_aula}`, r.id);
  }

  if (mensalidade.tipo_aula === 'plano_livre') {
    const { data: presencas, error: errPresencas } = await supabase
      .from('presencas')
      .select(`
        aula_id,
        agenda (
          modalidades (
            id,
            nome,
            professor_id
          )
        )
      `)
      .eq('estudio_id', estudioId)
      .eq('aluno_id', mensalidade.aluno_id)
      .gte('data_checkin', `${inicioPeriodo}T00:00:00`)
      .lte('data_checkin', `${fimPeriodo}T23:59:59`)
      .not('aula_id', 'is', null);

    if (errPresencas) throw errPresencas;

    if (!presencas || presencas.length === 0) {
      return { aviso: 'Plano livre sem presenças no mês. Nenhum repasse gerado para professores.', gerados: 0 };
    }

    const modMap = new Map<string, { nome: string; professor_id: string }>();
    for (const p of presencas) {
      const mod = (p.agenda as any)?.modalidades;
      if (mod?.id && mod?.professor_id) {
        modMap.set(mod.id, { nome: mod.nome, professor_id: mod.professor_id });
      }
    }

    if (modMap.size === 0) {
      return { aviso: 'Plano livre: presenças encontradas mas nenhuma modalidade com professor vinculado.', gerados: 0 };
    }

    const valorTotal = Number(mensalidade.valor_pago);
    const pctProf = Number(cfg.plano_livre_pct_prof) / 100;
    const parteProfs = valorTotal * pctProf;
    const modsArray = [...modMap.values()];
    const valoresPorMod = distribuirCentavos(parteProfs, modsArray.length);

    for (let i = 0; i < modsArray.length; i++) {
      const mod = modsArray[i];
      const chave = `${mod.nome}|plano_livre`;
      const idLote = loteJaGerado.get(chave);
      if (idLote) idsLoteRemover.push(idLote);
      itens.push({
        estudio_id: estudioId,
        professor_id: mod.professor_id,
        aluno_id: mensalidade.aluno_id!,
        mensalidade_id: mensalidadeId,
        tipo_aula: 'plano_livre',
        modalidade: mod.nome,
        valor: valoresPorMod[i],
        data_referencia: dataReferencia,
      });
    }
  } else if (mensalidade.tipo_aula === 'regular') {
    const { data: aluno } = await supabase
      .from('alunos')
      .select('modalidades_selecionadas')
      .eq('id', mensalidade.aluno_id)
      .eq('estudio_id', estudioId)
      .single();

    const modIds: string[] = aluno?.modalidades_selecionadas ?? [];

    if (modIds.length === 0) {
      return { aviso: 'Aluno sem modalidades vinculadas. Repasse não gerado.', gerados: 0 };
    }

    const { data: mods } = await supabase
      .from('modalidades')
      .select('id, nome, professor_id')
      .eq('estudio_id', estudioId)
      .in('id', modIds)
      .not('professor_id', 'is', null);

    const modsValidas = (mods ?? []) as { id: string; nome: string; professor_id: string }[];

    if (modsValidas.length === 0) {
      return { aviso: 'Modalidades sem professor vinculado. Repasse não gerado.', gerados: 0 };
    }

    const valorPorMod = modsValidas.length === 1
      ? Number(cfg.valor_1_modalidade)
      : Number(cfg.valor_multi_modalidade);

    for (const mod of modsValidas) {
      const chave = `${mod.nome}|regular`;
      const idLote = loteJaGerado.get(chave);
      if (idLote) idsLoteRemover.push(idLote);
      itens.push({
        estudio_id: estudioId,
        professor_id: mod.professor_id,
        aluno_id: mensalidade.aluno_id!,
        mensalidade_id: mensalidadeId,
        tipo_aula: 'regular',
        modalidade: mod.nome,
        valor: valorPorMod,
        data_referencia: dataReferencia,
      });
    }
  } else if (mensalidade.tipo_aula === 'avulsa') {
    if (!mensalidade.professor_id) {
      return { aviso: 'Aula avulsa sem professor. Repasse não gerado.', gerados: 0 };
    }

    const valorRepasse = Math.round(Number(mensalidade.valor_pago) * (cfg.aula_avulsa_pct_prof / 100) * 100) / 100;

    itens.push({
      estudio_id: estudioId,
      professor_id: mensalidade.professor_id,
      aluno_id: mensalidade.aluno_id!,
      mensalidade_id: mensalidadeId,
      tipo_aula: 'avulsa',
      modalidade: mensalidade.modalidade_nome ?? 'Avulsa',
      valor: valorRepasse,
      data_referencia: dataReferencia,
    });
  } else if (mensalidade.tipo_aula === 'experimental') {
    const pctProf = Number(cfg.aula_experimental_pct_prof);

    if (pctProf <= 0) {
      return { aviso: 'Aula experimental com percentual 0. Nenhum repasse gerado.', gerados: 0 };
    }
    if (!mensalidade.professor_id) {
      return { aviso: 'Aula experimental sem professor vinculado. Repasse não gerado.', gerados: 0 };
    }

    const valorRepasse = Math.round(Number(mensalidade.valor_pago) * (pctProf / 100) * 100) / 100;

    itens.push({
      estudio_id: estudioId,
      professor_id: mensalidade.professor_id,
      aluno_id: mensalidade.aluno_id!,
      mensalidade_id: mensalidadeId,
      tipo_aula: 'experimental',
      modalidade: mensalidade.modalidade_nome ?? 'Experimental',
      valor: valorRepasse,
      data_referencia: dataReferencia,
    });
  }

  if (itens.length === 0) {
    return { aviso: 'Nenhum repasse calculado para este tipo de aula.', gerados: 0 };
  }

  const { error: errRpc } = await supabase.rpc('substituir_repasses_mensalidade', {
    p_estudio_id: estudioId,
    p_mensalidade_id: mensalidadeId,
    p_ids_lote_remover: idsLoteRemover,
    p_itens: itens,
  });

  if (errRpc) throw errRpc;

  return {
    sucesso: true,
    gerados: itens.length,
    itens: itens.map(i => ({ modalidade: i.modalidade, valor: i.valor, tipo: i.tipo_aula })),
  };
}
```

- [ ] **Step 2: Reescrever `gerar-repasses/index.ts` para usar o módulo compartilhado**

Substituir todo o corpo do `try` (a partir da busca da mensalidade, linha ~121 do arquivo original, até o `return response({ sucesso: true, ... })`) por uma chamada à função extraída, mantendo intactos: CORS, parsing do body, autenticação (Bearer JWT), autorização (`estudio_membros`), e o `catch` final. O arquivo final:

```typescript
// supabase/functions/gerar-repasses/index.ts
//
// Gera repasses para UMA mensalidade específica ao ser confirmada.
// A lógica de cálculo vive em ../_shared/repasses.ts (PED-14) — reaproveitada
// também pelo webhook-pagamento, que chama gerarRepassesParaMensalidade
// diretamente (sem passar por este endpoint HTTP, que exige JWT de admin).
//
// Chamada via: supabase.functions.invoke('gerar-repasses', { body: { estudioId, mensalidadeId } })

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { withSentry } from "../_shared/sentry.ts";
import { gerarRepassesParaMensalidade } from "../_shared/repasses.ts";

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

serve(withSentry("gerar-repasses", async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { estudioId, mensalidadeId } = await req.json();

    if (!estudioId) {
      return response({ error: 'estudioId é obrigatório no payload.' }, 400);
    }
    if (!mensalidadeId) {
      return response({ error: 'Parâmetro mensalidadeId é obrigatório.' }, 400);
    }

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

    const resultado = await gerarRepassesParaMensalidade(supabase, { estudioId, mensalidadeId });
    return response(resultado);

  } catch (err) {
    const message =
      err instanceof Error ? err.message
      : typeof err === 'object' && err !== null ? JSON.stringify(err)
      : String(err);
    console.error('[gerar-repasses] ERRO:', message);
    return response({ error: message }, 500);
  }
}));
```

- [ ] **Step 3: Conferir manualmente que nada mudou de comportamento**

Rode:
```bash
grep -c "distribuirCentavos\|substituir_repasses_mensalidade" supabase/functions/gerar-repasses/index.ts
```
Esperado: `0` (a lógica saiu daqui e foi para `_shared/repasses.ts`).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/repasses.ts supabase/functions/gerar-repasses/index.ts
git commit -m "refactor(financeiro): extrai cálculo de repasse para _shared/repasses.ts"
```

---

### Task 2: Criar `_shared/backgroundTask.ts` (wrapper de `EdgeRuntime.waitUntil`)

**Files:**
- Create: `supabase/functions/_shared/backgroundTask.ts`
- Test: `supabase/functions/_shared/backgroundTask.test.ts`

**Interfaces:**
- Produces: `runInBackground(task: () => Promise<void>, label: string): void` — usado pelo Task 4 (webhook-pagamento).
- Consumes: `Sentry` de `./sentry.ts` (já exportado por esse módulo, ver `export { Sentry }` em `_shared/sentry.ts`).

- [ ] **Step 1: Escrever o teste**

```typescript
// supabase/functions/_shared/backgroundTask.test.ts
import { assertEquals } from "https://deno.land/std@0.177.0/testing/asserts.ts";
import { runInBackground, __setEdgeRuntimeForTest } from "./backgroundTask.ts";

Deno.test("runInBackground executa a task e a repassa para EdgeRuntime.waitUntil quando disponível", async () => {
  let promisePassada: Promise<unknown> | null = null;
  __setEdgeRuntimeForTest({
    waitUntil: (p: Promise<unknown>) => { promisePassada = p; },
  });

  let executou = false;
  runInBackground(async () => { executou = true; }, "teste");

  // waitUntil recebeu uma Promise (não travou o chamador)
  if (!promisePassada) throw new Error("waitUntil não foi chamado");
  await promisePassada;
  assertEquals(executou, true);

  __setEdgeRuntimeForTest(undefined);
});

Deno.test("runInBackground não lança quando a task falha (erro é engolido e reportado)", async () => {
  let promisePassada: Promise<unknown> | null = null;
  __setEdgeRuntimeForTest({
    waitUntil: (p: Promise<unknown>) => { promisePassada = p; },
  });

  runInBackground(async () => { throw new Error("falhou de propósito"); }, "teste-erro");

  // não deve rejeitar — o erro é capturado internamente
  await promisePassada;

  __setEdgeRuntimeForTest(undefined);
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha (módulo ainda não existe)**

Run: `deno test supabase/functions/_shared/backgroundTask.test.ts`
Expected: FAIL — `Module not found "./backgroundTask.ts"`

- [ ] **Step 3: Implementar `_shared/backgroundTask.ts`**

```typescript
// supabase/functions/_shared/backgroundTask.ts
//
// PED-14: wrapper para EdgeRuntime.waitUntil — permite que uma edge function
// responda ao cliente e continue processando depois, sem que o runtime
// congele o isolate antes da task terminar. Usado pelo webhook-pagamento
// para gerar repasse + notificar fora do "hot path" da resposta HTTP.
//
// EdgeRuntime é um global específico do runtime do Supabase Edge Functions
// (não existe em `deno test` nem em outros ambientes Deno) — por isso o
// acesso é via globalThis com fallback seguro, e o teste substitui esse
// global através de __setEdgeRuntimeForTest.

import { Sentry } from "./sentry.ts";

interface EdgeRuntimeLike {
  waitUntil(promise: Promise<unknown>): void;
}

let edgeRuntimeOverride: EdgeRuntimeLike | undefined;

/** Só para uso em testes — substitui o EdgeRuntime global. */
export function __setEdgeRuntimeForTest(mock: EdgeRuntimeLike | undefined) {
  edgeRuntimeOverride = mock;
}

function getEdgeRuntime(): EdgeRuntimeLike | undefined {
  if (edgeRuntimeOverride) return edgeRuntimeOverride;
  // deno-lint-ignore no-explicit-any
  return (globalThis as any).EdgeRuntime;
}

/**
 * Executa `task` sem bloquear quem chamou, garantindo que o runtime não
 * mate o isolate antes dela terminar (via EdgeRuntime.waitUntil quando
 * disponível). Erros são capturados e reportados ao Sentry — nunca
 * propagam para o chamador.
 */
export function runInBackground(task: () => Promise<void>, label: string): void {
  const promise = task().catch(async (err) => {
    console.error(`[background:${label}] Falhou:`, err);
    Sentry.captureException(err, { tags: { background_task: label } });
    await Sentry.flush(2000).catch(() => {});
  });

  const rt = getEdgeRuntime();
  if (rt?.waitUntil) {
    rt.waitUntil(promise);
  } else {
    console.warn(`[background:${label}] EdgeRuntime.waitUntil indisponível — task roda sem garantia de conclusão antes do processo encerrar (normal em ambiente de teste/local).`);
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `deno test supabase/functions/_shared/backgroundTask.test.ts`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/backgroundTask.ts supabase/functions/_shared/backgroundTask.test.ts
git commit -m "feat(financeiro): adiciona runInBackground (wrapper de EdgeRuntime.waitUntil)"
```

---

### Task 3: Criar `_shared/expoPush.ts` (push único de confirmação de pagamento)

**Files:**
- Create: `supabase/functions/_shared/expoPush.ts`
- Test: manual via Step 3 (rede externa — sem mock de fetch automatizado neste módulo, ver nota abaixo)

**Interfaces:**
- Produces: `enviarPushUnico(pushToken: string | null | undefined, title: string, body: string): Promise<void>` — usada pelo Task 4.

- [ ] **Step 1: Implementar `_shared/expoPush.ts`**

Nota: este helper é intencionalmente mínimo (1 destinatário, sem lotes) — a lógica de envio em lote para múltiplos alunos já existe em `lembretes-aula/index.ts` e não é tocada aqui (fora de escopo do PED-14).

```typescript
// supabase/functions/_shared/expoPush.ts
//
// Envio de UMA notificação push via Expo Push API. Para envio em lote
// (múltiplos destinatários), ver a lógica dedicada em lembretes-aula/index.ts
// — este helper é deliberadamente mínimo, usado pelo webhook-pagamento
// (PED-14) para notificar um único aluno após confirmação de pagamento.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Envia um push Expo para `pushToken`. Não lança se `pushToken` for
 * vazio/nulo (aluno sem app instalado ou notificações desativadas) —
 * simplesmente não faz nada. Lança em caso de falha de rede/HTTP para que
 * o chamador possa reportar ao Sentry.
 */
export async function enviarPushUnico(
  pushToken: string | null | undefined,
  title: string,
  body: string,
): Promise<void> {
  if (!pushToken) return;

  const resposta = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify([{ to: pushToken, title, body }]),
  });

  if (!resposta.ok) {
    const corpoErro = await resposta.text().catch(() => '');
    throw new Error(`Expo push falhou (HTTP ${resposta.status}): ${corpoErro}`);
  }
}
```

- [ ] **Step 2: Checagem de tipos**

Run: `deno check supabase/functions/_shared/expoPush.ts`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/expoPush.ts
git commit -m "feat(financeiro): adiciona enviarPushUnico para notificação de pagamento confirmado"
```

---

### Task 4: Reescrever `webhook-pagamento/index.ts` — idempotência, ordem, ack rápido, background

**Files:**
- Modify: `supabase/functions/webhook-pagamento/index.ts`

**Interfaces:**
- Consumes: `runInBackground` de `../_shared/backgroundTask.ts` (Task 2), `gerarRepassesParaMensalidade` de `../_shared/repasses.ts` (Task 1), `enviarPushUnico` de `../_shared/expoPush.ts` (Task 3).

**IMPORTANTE — campo `dateCreated` do Asaas:** o payload do webhook do Asaas inclui um campo de nível superior `dateCreated` (data de criação da notificação do evento, ISO 8601), documentado pelo Asaas como o timestamp do próprio evento. Esse campo ainda não foi observado em um payload real capturado neste projeto — depois de este deploy ir ao ar, confira em `select payload from webhook_events order by recebido_em desc limit 5;` se `dateCreated` realmente aparece no formato esperado; se o Asaas usar outro nome de campo, ajustar a leitura no Step 1 (a checagem de ordem já é best-effort e nunca bloqueia o processamento se o campo estiver ausente/inválido).

- [ ] **Step 1: Reescrever `supabase/functions/webhook-pagamento/index.ts`**

```typescript
import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { withSentry, Sentry } from "../_shared/sentry.ts"
import { runInBackground } from "../_shared/backgroundTask.ts"
import { gerarRepassesParaMensalidade } from "../_shared/repasses.ts"
import { enviarPushUnico } from "../_shared/expoPush.ts"

// ─────────────────────────────────────────────────────────────────────────
// webhook-pagamento
//
// Recebe eventos do Asaas (PAYMENT_RECEIVED, PAYMENT_CONFIRMED,
// PAYMENT_OVERDUE, PAYMENT_DELETED/REFUNDED, ...) e sincroniza o status
// real da mensalidade.
//
// PED-14 — três garantias adicionadas nesta versão:
//   1. Idempotência: grava o evento em `webhook_events` com
//      ON CONFLICT DO NOTHING antes de processar. Reentregas do Asaas
//      (que acontecem sempre que a resposta anterior não foi 2xx, ou por
//      retry espontâneo) são identificadas e descartadas sem reprocessar.
//   2. Ordem: compara `asaas_event_timestamp` já salvo na mensalidade
//      contra o timestamp do evento recebido — um evento mais antigo que
//      chega atrasado (reentrega fora de ordem) não pode reverter um
//      status mais recente.
//   3. Ack rápido: responde 200 assim que o estado essencial (status da
//      mensalidade, ativação do aluno) está gravado. Geração de repasse e
//      notificação push acontecem DEPOIS da resposta, via
//      EdgeRuntime.waitUntil (runInBackground) — processamento pesado não
//      compete mais com o prazo de timeout do Asaas.
//
// SEGURANÇA — validação do remetente:
// O Asaas não assina o payload por HMAC como Stripe; a autenticação é
// feita via um "Access Token" definido no painel de configuração do
// webhook, enviado de volta no header `asaas-access-token`. Configure o
// mesmo valor em ASAAS_WEBHOOK_TOKEN (edge function secret) e no painel
// Asaas > Integrações > Webhooks. Sem essa checagem, qualquer request
// externo poderia marcar mensalidades como pagas.
//
// verify_jwt = false é necessário (o Asaas não envia JWT do Supabase);
// a autenticidade da chamada é garantida pelo token acima, não pelo JWT.
// ─────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, asaas-access-token",
}

const EVENTOS_PAGO = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"])
const EVENTOS_FALHOU = new Set([
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
])

serve(withSentry("webhook-pagamento", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return response({ erro: "method not allowed" }, 405)
  }

  const expectedToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN") ?? ""
  const receivedToken = req.headers.get("asaas-access-token") ?? ""
  if (!expectedToken || receivedToken !== expectedToken) {
    console.error("[webhook-pagamento] Token de webhook inválido ou ausente.")
    return response({ erro: "Não autorizado." }, 401)
  }

  let payload: {
    event?: string
    dateCreated?: string
    payment?: { id?: string; status?: string; externalReference?: string }
  }
  try {
    payload = await req.json()
  } catch {
    return response({ erro: "Payload inválido." }, 400)
  }

  const evento = payload?.event
  const payment = payload?.payment
  const asaasPaymentId = payment?.id

  if (!evento || !asaasPaymentId) {
    console.warn("[webhook-pagamento] Evento sem payment.id, ignorado:", evento)
    return response({ recebido: true, ignorado: true })
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  )

  // ── 1) IDEMPOTÊNCIA ──────────────────────────────────────────────────
  // Insere o evento com ON CONFLICT DO NOTHING (via upsert+ignoreDuplicates).
  // Se `eventoRow` vier vazio, é uma reentrega de um evento já visto — o
  // Asaas reenvia sempre que a resposta anterior não foi 2xx (ou por retry
  // espontâneo), e reprocessar geraria repasse/notificação duplicados.
  const { data: eventoRow, error: eventoErr } = await supabase
    .from("webhook_events")
    .upsert(
      { origem: "asaas", asaas_event: evento, asaas_payment_id: asaasPaymentId, payload },
      { onConflict: "origem,asaas_event,asaas_payment_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle()

  if (eventoErr) {
    console.error("[webhook-pagamento] Erro ao gravar webhook_events:", eventoErr)
    return response({ erro: "Erro interno." }, 500)
  }
  if (!eventoRow) {
    console.log("[webhook-pagamento] Evento duplicado (reentrega), ignorando:", evento, asaasPaymentId)
    return response({ recebido: true, duplicado: true })
  }

  // Localiza a mensalidade pelo id externo do gateway — NÃO pelo
  // externalReference (que é só metadado nosso, não garantidamente
  // sincronizado). asaas_payment_id é a fonte de verdade.
  const { data: mensalidade, error: buscaErr } = await supabase
    .from("mensalidades")
    .select("id, estudio_id, aluno_id, status, valor_cobranca, valor_pago, asaas_event_timestamp")
    .eq("asaas_payment_id", asaasPaymentId)
    .maybeSingle()

  if (buscaErr) {
    console.error("[webhook-pagamento] Erro ao buscar mensalidade:", buscaErr)
    return response({ erro: "Erro interno." }, 500)
  }

  if (!mensalidade) {
    console.warn("[webhook-pagamento] Mensalidade não encontrada para payment:", asaasPaymentId)
    return response({ recebido: true, ignorado: true })
  }

  // ── 2) ORDEM ─────────────────────────────────────────────────────────
  // Best-effort: se não conseguirmos ler um timestamp válido do evento,
  // processamos normalmente (nunca bloqueia por causa disso).
  const eventoTimestamp = payload?.dateCreated ? new Date(payload.dateCreated) : null
  const timestampValido = eventoTimestamp && !Number.isNaN(eventoTimestamp.getTime())

  if (timestampValido && mensalidade.asaas_event_timestamp) {
    const timestampAtual = new Date(mensalidade.asaas_event_timestamp)
    if (timestampAtual > eventoTimestamp!) {
      console.warn(
        "[webhook-pagamento] Evento fora de ordem (mais antigo que o último processado), ignorado:",
        evento, asaasPaymentId,
      )
      return response({ recebido: true, fora_de_ordem: true })
    }
  }

  let novoStatus: string | null = null
  if (EVENTOS_PAGO.has(evento)) {
    novoStatus = "pago"
  } else if (EVENTOS_FALHOU.has(evento)) {
    novoStatus = "pendente"
  }

  const updatePayload: Record<string, unknown> = {
    asaas_status: payment?.status ?? evento,
  }
  if (novoStatus) updatePayload.status = novoStatus
  if (timestampValido) updatePayload.asaas_event_timestamp = eventoTimestamp!.toISOString()

  // Quando o pagamento é confirmado via Asaas, precisamos preencher valor_pago
  // (já lido acima, junto com a busca da mensalidade — evita um round-trip extra).
  if (novoStatus === "pago" && mensalidade.valor_pago === null) {
    updatePayload.valor_pago = mensalidade.valor_cobranca
    updatePayload.data_pagamento = new Date().toISOString().split("T")[0]
  }

  const { error: updateErr } = await supabase
    .from("mensalidades")
    .update(updatePayload)
    .eq("id", mensalidade.id)

  if (updateErr) {
    console.error("[webhook-pagamento] Erro ao atualizar mensalidade:", updateErr)
    return response({ erro: "Erro ao atualizar mensalidade." }, 500)
  }

  // Efeito colateral: pagamento confirmado libera o aluno (idempotente) e
  // já traz push_token/nome_completo para a notificação em background,
  // evitando uma query extra depois de responder.
  let alunoParaNotificar: { push_token: string | null; nome_completo: string | null } | null = null

  if (novoStatus === "pago") {
    const { data: alunoAtualizado, error: alunoErr } = await supabase
      .from("alunos")
      .update({ ativo: true })
      .eq("id", mensalidade.aluno_id)
      .eq("estudio_id", mensalidade.estudio_id)
      .select("push_token, nome_completo")
      .maybeSingle()

    if (alunoErr) {
      console.error("[webhook-pagamento] Falha ao reativar aluno:", alunoErr)
    } else {
      alunoParaNotificar = alunoAtualizado
    }
  }

  // ── 3) ACK RÁPIDO ────────────────────────────────────────────────────
  // A partir daqui, tudo que resta é pesado (calcular repasse cruzando
  // várias tabelas, chamar a Expo Push API) — não pode competir com o
  // prazo do Asaas para considerar a entrega bem-sucedida.
  const res = response({ recebido: true, mensalidade_id: mensalidade.id, status: novoStatus ?? "sem_alteracao" })

  if (novoStatus === "pago" && mensalidade.aluno_id) {
    const estudioId = mensalidade.estudio_id
    const mensalidadeId = mensalidade.id
    const primeiroNome = alunoParaNotificar?.nome_completo?.split(" ")[0]

    runInBackground(async () => {
      await gerarRepassesParaMensalidade(supabase, { estudioId, mensalidadeId })

      await enviarPushUnico(
        alunoParaNotificar?.push_token,
        "✅ Pagamento confirmado",
        primeiroNome
          ? `Olá, ${primeiroNome}! Recebemos a confirmação do seu pagamento.`
          : "Recebemos a confirmação do seu pagamento.",
      )
    }, "webhook-pagamento:pos-processamento")
  }

  return res
}))

function response(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}
```

- [ ] **Step 2: Checagem de tipos**

Run: `deno check supabase/functions/webhook-pagamento/index.ts`
Expected: sem erros.

- [ ] **Step 3: Validação manual local — idempotência**

```bash
supabase functions serve webhook-pagamento --env-file supabase/.env.local
```

> **Nota (PED-54, adicionada depois desta validação original):** mesmo com
> `verify_jwt = false`, o gateway local (Kong/edge-runtime) pode devolver
> 401 `UNAUTHORIZED_NO_AUTH_HEADER` antes de chamar a function se o `curl`
> não incluir um header `Authorization`. Inclua `-H "Authorization: Bearer
> <SUPABASE_ANON_KEY local>"` (pegue o valor em `supabase status`) nos
> comandos abaixo — não muda o comportamento da function (quem autentica de
> verdade é o `asaas-access-token`). Detalhes em
> [`docs/DEV_LOCAL.md`](../../DEV_LOCAL.md) e no ticket
> [PED-54](https://linear.app/pedro-schuster/issue/PED-54/dev-local-supabase-functions-serve-nome-env-file-nao-respeita-verify).

Em outro terminal, envie o mesmo evento duas vezes (troque `SEU_TOKEN` e `pay_teste123` por um `asaas_payment_id` real de uma mensalidade de teste no seu banco local):

```bash
curl -s -X POST http://localhost:54321/functions/v1/webhook-pagamento \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_ANON_KEY_LOCAL" \
  -H "asaas-access-token: SEU_TOKEN" \
  -d '{"event":"PAYMENT_CONFIRMED","dateCreated":"2026-08-26T10:00:00Z","payment":{"id":"pay_teste123","status":"CONFIRMED"}}'
```

Rode o mesmo `curl` de novo, sem alterar nada. Esperado: primeira resposta `{"recebido":true,...,"status":"pago"}` com HTTP 200 em bem menos de 2s; segunda resposta `{"recebido":true,"duplicado":true}`.

Confirme no banco: `select * from repasses_lancamentos where mensalidade_id = '<id da mensalidade de teste>';` deve ter os lançamentos gerados **uma única vez**, mesmo com os dois `curl`.

- [ ] **Step 4: Validação manual — evento fora de ordem**

Envie um evento com `dateCreated` anterior ao já processado (ex.: `"2026-08-25T00:00:00Z"`) para a mesma `asaas_payment_id`, com um `event` diferente (para não cair no bloqueio de idempotência) — ex. `PAYMENT_OVERDUE`. Esperado: resposta `{"recebido":true,"fora_de_ordem":true}` e `mensalidades.status` continua `pago` (não regride para `pendente`).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/webhook-pagamento/index.ts
git commit -m "feat(financeiro): webhook-pagamento com idempotência, checagem de ordem e processamento assíncrono (PED-14)"
```

---

## Self-Review

1. **Cobertura do spec:** ack <2s → Task 4 Step 3 (resposta enviada antes do trabalho pesado). Idempotência/reentrega em cascata → Task 4 `webhook_events` upsert. Processamento pesado fora do hot path → Task 2 (`runInBackground`) + Task 4 uso dele para repasse+notificação. ✅ todos cobertos.
2. **Placeholder scan:** nenhum "TBD"/"implement later" — a única ressalva documentada (campo `dateCreated`) é explicitamente best-effort por design (nunca bloqueia), não um placeholder de código faltando.
3. **Consistência de tipos:** `gerarRepassesParaMensalidade(supabase, { estudioId, mensalidadeId })` — mesma assinatura usada no Task 1 (produtor) e Task 4 (consumidor). `runInBackground(task, label)` — mesma assinatura no Task 2 e Task 4. `enviarPushUnico(pushToken, title, body)` — mesma assinatura no Task 3 e Task 4.
