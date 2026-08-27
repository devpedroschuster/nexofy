# PED-28 — Playwright: webhook de pagamento e idempotência — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um teste E2E Playwright cobrindo o fluxo crítico do webhook de pagamento simulado (`webhook-pagamento`), incluindo o caso de reenvio duplicado do Asaas, para validar a idempotência.

**Architecture:** Diferente de PED-26/27 (fluxos disparados por clique na UI), o webhook é disparado por uma chamada HTTP externa (o Asaas, na vida real) — não existe UI que o acione. O teste usa o fixture `request` do Playwright (API testing, não navegação de browser) pra fazer 2 chamadas POST diretas ao endpoint da Edge Function com payload idêntico, e só depois usa `page`/`loginComoAdmin` (reaproveitado de PED-26) pra verificar o estado final na UI do Financeiro — mesmo padrão de "assert de estado final" já usado em PED-27. A 2ª chamada precisa **sempre** retornar `duplicado: true`, independente de a 1ª chamada daquela execução ter sido o processamento real ou já um duplicado de uma execução anterior do CI (o dedup de `webhook_events`, ao contrário da geração de mensalidades, não expira por mês — é permanente por `(origem, asaas_event, asaas_payment_id)`).

**Tech Stack:** Mesmo do PED-26/27 — `@playwright/test` (incluindo seu fixture `request` de API testing), Chromium, GitHub Actions (`ubuntu-latest`), Supabase staging (`qjmybxkfjkxttggdjxga`).

**Spec:** Ticket Linear [PED-28](https://linear.app/pedro-schuster/issue/PED-28/cicd-fase-2-teste-e2e-playwright-fluxo-de-webhook-de-pagamento) — "Cobrir com Playwright o fluxo crítico do webhook de pagamento simulado (incluindo caso de reenvio duplicado, para validar idempotência)." Desenho acordado em brainstorming na mesma sessão que gerou este plano.

## Global Constraints

- Usar o tenant B (`ronaldo`/"Estudio Teste 3"), mesmo padrão de PED-26/27.
- Não reaproveitar o aluno/mensalidade do PED-27 — fixture dedicado, pra manter os testes independentes (o dedup de `webhook_events` é permanente, diferente da geração de mensalidade que é escopada por mês).
- Autenticação do webhook é via header `asaas-access-token` comparado contra o secret `ASAAS_WEBHOOK_TOKEN` da Edge Function — **não** é JWT do Supabase (`verify_jwt = false` no `config.toml` da function).
- Não commitar segredos — token só via `process.env.E2E_ASAAS_WEBHOOK_TOKEN` (secret do GitHub, já criado).
- A 2ª chamada do webhook (payload idêntico à 1ª) deve sempre ser verificada como `duplicado: true` — essa é a asserção real de idempotência, não a resposta da 1ª chamada (que varia conforme o histórico de execuções do CI).

## Contexto dos fixtures (já criados nesta sessão, não repetir)

Staging (`qjmybxkfjkxttggdjxga`), estúdio "Estudio Teste 3" (`ronaldo`, id `e6657270-4d5c-4e52-a3bd-e389e4b32db2`):
- Aluno `id=3`, nome "E2E Aluno Webhook", `plano_id=1`, `ativo=false` (o webhook ativa o aluno como efeito colateral do pagamento confirmado — não é verificado por este teste, mas o estado inicial `false` é intencional).
- Mensalidade `id=123`, `aluno_id=3`, `status='pendente'`, `tipo_aula='avulsa'`, `valor_cobranca=100.00`, `asaas_payment_id='e2e-webhook-test-payment'`.

Secret `ASAAS_WEBHOOK_TOKEN` já configurado na Edge Function em staging, e o mesmo valor já salvo como secret do GitHub Actions `E2E_ASAAS_WEBHOOK_TOKEN`.

## UI/API já mapeados (não repetir a investigação)

- Endpoint: `POST https://qjmybxkfjkxttggdjxga.supabase.co/functions/v1/webhook-pagamento`, headers `Content-Type: application/json` + `asaas-access-token: <token>`.
- Payload esperado (`supabase/functions/webhook-pagamento/index.ts`): `{ event, dateCreated, payment: { id, status, externalReference? } }`. `event: 'PAYMENT_RECEIVED'` ou `'PAYMENT_CONFIRMED'` marca a mensalidade como paga (busca por `asaas_payment_id`, não por `externalReference`).
- Resposta de sucesso (1ª vez): `{ recebido: true, mensalidade_id, status: 'pago' }`, HTTP 200.
- Resposta de duplicado: `{ recebido: true, duplicado: true }`, HTTP 200 (ainda assim `ok()`, só o corpo indica).
- Badge de status "pago" na tabela do Financeiro (`webapp/src/pages/Financeiro.jsx`, `CelulaFinStatusFixa`): texto exato **"PAGO"** (maiúsculo).
- Campo de busca: `placeholder="Buscar aluno..."`; filtro rápido de status "Todos" (mesmos seletores já usados em PED-27).

---

## File Structure

- **Create** `webapp/e2e/webhook-pagamento.spec.js` — o teste.
- **Modify** `.github/workflows/ci.yml` — adiciona `E2E_ASAAS_WEBHOOK_TOKEN` ao bloco `env` do job `e2e` (uma linha; os outros 6 secrets desse bloco já existem, de PED-26).
- **Test:** o próprio spec do Playwright é o teste — sem testes unitários adicionais.

---

### Task 1: Teste E2E do webhook + secret no CI

**Files:**
- Create: `webapp/e2e/webhook-pagamento.spec.js`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `loginComoAdmin(page, host, email, password, nomeEstudio)` de `webapp/e2e/helpers/auth.js` (PED-26, já existe); `TENANT_B_HOST`, `urlFor(host, path)` de `webapp/e2e/constants.js` (PED-26, já existe).

- [ ] **Step 1: Criar `webapp/e2e/webhook-pagamento.spec.js`**

```js
// webapp/e2e/webhook-pagamento.spec.js
import { test, expect } from '@playwright/test';
import { TENANT_B_HOST, urlFor } from './constants.js';
import { loginComoAdmin } from './helpers/auth.js';

const ADMIN_B = {
  email: process.env.E2E_ADMIN_B_EMAIL,
  password: process.env.E2E_ADMIN_B_PASSWORD,
};

const WEBHOOK_URL = 'https://qjmybxkfjkxttggdjxga.supabase.co/functions/v1/webhook-pagamento';
const ASAAS_PAYMENT_ID = 'e2e-webhook-test-payment';

test.beforeAll(() => {
  for (const name of ['E2E_ADMIN_B_EMAIL', 'E2E_ADMIN_B_PASSWORD', 'E2E_ASAAS_WEBHOOK_TOKEN']) {
    if (!process.env[name]) {
      throw new Error(`Missing required env var: ${name}`);
    }
  }
});

// Depende do fixture de staging (estudio "ronaldo", id
// e6657270-4d5c-4e52-a3bd-e389e4b32db2): aluno "E2E Aluno Webhook" (id 3)
// com uma mensalidade (id 123) vinculada a asaas_payment_id
// 'e2e-webhook-test-payment'. Dedicado só a este teste — não reaproveita
// o aluno/mensalidade do PED-27, porque o dedup de webhook_events é
// permanente (não expira por mês como a geração de mensalidade), então
// compartilhar fixture com outro teste tornaria o histórico entre eles
// confuso.
test.describe('Webhook de pagamento', () => {
  test('confirma pagamento e reenvio duplicado é ignorado (idempotência)', async ({ page, request }) => {
    const payload = {
      event: 'PAYMENT_RECEIVED',
      dateCreated: new Date().toISOString(),
      payment: { id: ASAAS_PAYMENT_ID, status: 'RECEIVED' },
    };
    const headers = {
      'Content-Type': 'application/json',
      'asaas-access-token': process.env.E2E_ASAAS_WEBHOOK_TOKEN,
    };

    // 1ª chamada: pode ser o processamento real (1ª vez que este
    // payment_id é visto) ou já um duplicado de uma execução anterior do
    // CI — o dedup de webhook_events não expira por mês. De qualquer
    // forma, deve responder com sucesso (200).
    const resposta1 = await request.post(WEBHOOK_URL, { headers, data: payload });
    expect(resposta1.ok(), await resposta1.text()).toBeTruthy();

    // 2ª chamada, payload idêntico, logo em seguida: essa SEMPRE precisa
    // ser um duplicado, independente do histórico de execuções anteriores
    // — é a asserção real de idempotência (reenvio do Asaas não
    // reprocessa nem duplica efeitos colaterais).
    const resposta2 = await request.post(WEBHOOK_URL, { headers, data: payload });
    expect(resposta2.ok(), await resposta2.text()).toBeTruthy();
    const corpo2 = await resposta2.json();
    expect(corpo2.duplicado).toBe(true);

    // Estado final: a mensalidade aparece como paga na UI.
    await loginComoAdmin(page, TENANT_B_HOST, ADMIN_B.email, ADMIN_B.password, 'Estudio Teste 3');
    await page.goto(urlFor(TENANT_B_HOST, '/financeiro'));
    await page.getByRole('button', { name: 'Todos' }).click();
    await page.getByPlaceholder('Buscar aluno...').fill('E2E Aluno Webhook');

    await expect(page.getByText('E2E Aluno Webhook', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('PAGO')).toBeVisible();
  });
});
```

- [ ] **Step 2: Adicionar o secret ao job `e2e` em `.github/workflows/ci.yml`**

No bloco `env:` do job `e2e` (mesmo bloco que já tem `E2E_ADMIN_B_PASSWORD` etc., de PED-26), adicionar:
```yaml
      E2E_ASAAS_WEBHOOK_TOKEN: ${{ secrets.E2E_ASAAS_WEBHOOK_TOKEN }}
```

- [ ] **Step 3: Verificar que a config reconhece o novo teste**

Rodar dentro de `webapp/`:
```bash
npx playwright test --list
```
Expected: agora lista **5** testes — os 3 de `login-tenant-isolation.spec.js`, o de `geracao-mensalidade.spec.js`, mais o novo `webhook-pagamento.spec.js:*` — "confirma pagamento e reenvio duplicado é ignorado (idempotência)". Sem erro de config.

Também rodar:
```bash
npm run lint
npm run build
npm test
```
Expected: todos passam sem erro novo (53 testes Vitest, sem tentar carregar o novo spec do Playwright — `webapp/vitest.config.js` já exclui `e2e/**` desde PED-27).

**Não** tentar `npm run e2e` completo nesta máquina — sem os hostnames `iluminus.e2e.test`/`ronaldo.e2e.test` resolvendo (exige `/etc/hosts`, só configurado no CI), o teste não navega. A chamada de API (`request.post`) até funcionaria localmente (não depende de hosts file), mas a parte de login/UI não — a verificação de ponta a ponta de verdade acontece no Task 2, via CI.

- [ ] **Step 4: Commit**

```bash
git add webapp/e2e/webhook-pagamento.spec.js .github/workflows/ci.yml
git commit -m "test(e2e): fluxo de webhook de pagamento + idempotência (PED-28)"
```

---

### Task 2: Push, PR e verificação real no GitHub Actions

**Files:** nenhum (só push/PR/monitoramento — sem mudança de código).

- [ ] **Step 1: Push**

```bash
git push -u origin devpedroschuster/ped-28-cicd-fase-2-teste-e2e-playwright-fluxo-de-webhook-de
```

- [ ] **Step 2: Abrir o PR**

```bash
export PATH="$PATH:/c/Program Files/GitHub CLI"
gh pr create --title "test(e2e): fluxo de webhook de pagamento e idempotência (PED-28)" --body "$(cat <<'EOF'
## Summary
- Novo teste E2E (`webapp/e2e/webhook-pagamento.spec.js`) cobrindo o fluxo crítico do webhook de pagamento simulado (`webhook-pagamento`), incluindo reenvio duplicado pra validar idempotência.
- Diferente dos testes anteriores (clique na UI), usa o fixture `request` do Playwright pra chamar o endpoint do webhook diretamente via HTTP — é assim que o Asaas de verdade dispara esse fluxo, sem UI envolvida.
- A 2ª chamada (payload idêntico à 1ª) sempre precisa retornar `duplicado: true` — essa é a asserção de idempotência, robusta ao histórico de execuções anteriores do CI (o dedup de `webhook_events` é permanente, não expira por mês).
- Verifica o estado final na UI do Financeiro (mensalidade aparece como "PAGO"), mesmo padrão de PED-27.
- Fixture dedicado (aluno + mensalidade só pra este teste) — não reaproveita o fixture do PED-27, pra manter os testes independentes.
- Novo secret `E2E_ASAAS_WEBHOOK_TOKEN` (já criado no GitHub e configurado como `ASAAS_WEBHOOK_TOKEN` na Edge Function em staging) adicionado ao job `e2e` do CI.

## Test plan
- [x] `npx playwright test --list` local — 5 testes reconhecidos (4 de PED-26/27 + este)
- [x] `npm run lint` / `npm run build` / `npm test` — sem erro novo
- [ ] Job `E2E (Playwright)` verde neste PR (verificação real — só dá pra confirmar rodando no CI, contra staging)

Closes PED-28

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr checks --watch
```
Expected: os jobs `Lint, Test & Build`, `E2E (Playwright)` e `GitGuardian Security Checks` ficam verdes. Se `E2E (Playwright)` falhar, baixar os logs (`gh run view <run-id> --log-failed`) e o artifact `playwright-report` (`gh run download`) antes de tentar corrigir — não adivinhar a causa, seguir o mesmo processo de investigação usado em PED-27 (checar o banco diretamente, extrair o trace de rede se necessário).

- [ ] **Step 3: Atualizar o ticket no Linear**

Mover PED-28 para "In Review" e linkar o PR (mesmo padrão de PED-25/26/27/29 nesta sessão).
