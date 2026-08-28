# Achados de hardening pós-deploy PWA/cron (PED-57/58/60/61) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans para implementar este plano task por task. As tasks abaixo são totalmente independentes entre si (arquivos diferentes, sem dependência de execução) — podem ser feitas em qualquer ordem. Steps usam checkbox (`- [ ]`) para tracking.

**Goal:** Resolver quatro achados de robustez/segurança encontrados durante a revisão final das branches de PED-37 (PWA/Service Worker), PED-39 (feature flag por tenant) e PED-47 (fix de `gerar-mensalidades`): um guard de acesso que pode falhar aberto (PED-61), um plugin de build que falha silenciosamente (PED-60), uma PWA que não avisa sobre versão nova (PED-58), e uma possível falha silenciosa do cron mensal de cobranças em produção (PED-57).

**Architecture:** Mudanças pontuais e independentes, sem nenhuma interseção de arquivos entre si: um guard defensivo (`Array.isArray`) em `webapp/src/lib/modulos.js`; uma falha explícita (`this.error`) + resolução de caminho via `configResolved` no plugin `swCacheVersionPlugin` de `webapp/vite.config.js`; um novo hook (`useSWUpdateNotifier`) que reaproveita a infraestrutura de toast já existente (`react-hot-toast` via `showToast.custom`) pra avisar sobre nova versão do Service Worker; e (Task 4) alinhamento de `gerar-mensalidades/config.toml` com o estado real de produção — investigação concluída ao vivo (via Supabase MCP, autorizado pelo usuário): **o cron nunca esteve ativo** (`cron.job` vazio, zero invocações em `function_edge_logs` no dia do agendamento), então não há incidente ativo a corrigir, só documentação a alinhar. Achados registrados em comentário no [PED-57](https://linear.app/pedro-schuster/issue/PED-57) (rebaixado pra Low) e numa issue nova, [PED-68](https://linear.app/pedro-schuster/issue/PED-68), pra decisão de produto sobre habilitar o cron de verdade (fora de escopo aqui).

**Tech Stack:** React 19, Vite 8 (beta, bundler Rolldown), Vitest 4 (ambiente `node`, sem jsdom/@testing-library — ver Global Constraints), Supabase Edge Functions (Deno), react-hot-toast.

**Spec:** Tickets Linear [PED-57](https://linear.app/pedro-schuster/issue/PED-57), [PED-58](https://linear.app/pedro-schuster/issue/PED-58), [PED-60](https://linear.app/pedro-schuster/issue/PED-60), [PED-61](https://linear.app/pedro-schuster/issue/PED-61) — todos achados "[Deploy]" adjacentes a PED-37/39/47, sem relação de bloqueio entre si.

## Global Constraints

- **Sem jsdom/@testing-library neste repo** (`webapp/vitest.config.js` usa `environment: 'node'`) — nenhuma task aqui deve depender de renderizar componentes/hooks React em teste automatizado. Onde a lógica tem uma parte pura (decisão) e uma parte de wiring em DOM/browser API, extrai a parte pura pra uma função testável isoladamente e deixa o wiring pra verificação manual no navegador (mesmo racional já usado em `rotaModulo.js`/`modulos.js`: "extraído pra fora... pra poder testar... sem montar componente").
- Testes rodam com `npm test` (= `vitest run`) de dentro de `webapp/`, ou `npx vitest run <arquivo>` pra um arquivo específico. Lint roda com `npm run lint` (= `eslint .`), também de dentro de `webapp/`.
- Convenção de teste do repo: arquivo `*.test.js` colocado ao lado do arquivo testado (não em `__tests__/`), usando `describe`/`it`/`expect`/`vi` de `vitest`.
- **Produção é o projeto Supabase `tciiepqmnrrcjnqhspvw`** ("Nexofy - production"), staging é `qjmybxkfjkxttggdjxga` — confirmado tanto nos docs do repo quanto ao vivo via `list_projects`. **Nunca aplicar mudança em produção sem confirmação explícita do usuário** (mesma restrição já registrada em `docs/superpowers/plans/2026-08-28-ped52-54-dev-local-supabase.md`).
- Comentários só quando o "porquê" não é óbvio (padrão já seguido em todo o repo — ver `modulos.js`, `rotaModulo.js`); nomes e testes em português, consistente com o resto do código.

---

## File Structure

- **Modify** `webapp/src/lib/modulos.js` — guard `Array.isArray` (PED-61).
- **Create** `webapp/src/lib/modulos.test.js` — cobertura de `moduloEstaAtivo`, incluindo a regressão de string (PED-61).
- **Modify** `webapp/vite.config.js` — `swCacheVersionPlugin` passa a capturar `root`/`outDir` via `configResolved` e falhar alto (`this.error`) em vez de retornar em silêncio; função exportada como named export pra ser testável (PED-60).
- **Create** `webapp/vite.config.test.js` — cobertura do `swCacheVersionPlugin` (caminho customizado + falha alta) (PED-60).
- **Create** `webapp/src/hooks/useSWUpdateNotifier.js` — hook que detecta troca de Service Worker ativo numa aba já aberta e mostra toast "nova versão disponível"; exporta também a função pura de decisão `criarDetectorDeAtualizacao` (PED-58).
- **Create** `webapp/src/hooks/useSWUpdateNotifier.test.js` — cobertura de `criarDetectorDeAtualizacao` (PED-58).
- **Modify** `webapp/src/App.jsx` — chama `useSWUpdateNotifier()` em `AppRoutes()` (PED-58).
- **Modify** `supabase/functions/gerar-mensalidades/config.toml` — corrige typo de placeholder e adiciona aviso explícito "nunca esteve ativo, não habilitar sem resolver X/Y/Z", no mesmo padrão que `gerar-repasses-mensais/config.toml` já usa (PED-57).

---

### Task 1: PED-58 — avisar sobre nova versão do PWA numa aba já aberta

**Files:**
- Create: `webapp/src/hooks/useSWUpdateNotifier.js`
- Create: `webapp/src/hooks/useSWUpdateNotifier.test.js`
- Modify: `webapp/src/App.jsx:11-14` (import), `webapp/src/App.jsx:202-205` (chamada do hook)

**Interfaces:**
- Consumes: `showToast.custom(mensagem: string, onAction: () => void, textoAcao?: string)` de `webapp/src/components/shared/Toast.jsx` (já existe; hoje sem nenhum call site).
- Produces: `useSWUpdateNotifier(): void` (hook React, sem retorno) e `criarDetectorDeAtualizacao(jaTinhaControllerInicial: boolean): () => boolean` (fábrica de função pura), ambos exportados de `webapp/src/hooks/useSWUpdateNotifier.js`.

Contexto técnico: `webapp/public/sw.js` já chama `self.skipWaiting()` (incondicional, no `install`) e `self.clients.claim()` (no `activate`) — ou seja, um Service Worker novo assume o controle de uma aba já aberta sozinho, sem esperar ela fechar. O evento `controllerchange` do `navigator.serviceWorker` dispara exatamente nesse momento (troca de controller), o que o torna o sinal mais direto de "a versão que está no ar mudou embaixo dessa aba". Não existe `vite-plugin-pwa` neste repo (SW é hand-rolled), então não há `virtual:pwa-register`/`onNeedRefresh` disponível — o hook precisa escutar a API nativa diretamente.

- [ ] **Step 1: Escrever o teste que falha**

Criar `webapp/src/hooks/useSWUpdateNotifier.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { criarDetectorDeAtualizacao } from './useSWUpdateNotifier';

// Isola a função pura sob teste do resto do módulo: useSWUpdateNotifier()
// importa showToast (react-hot-toast + ThemeProvider), que não tem relação
// nenhuma com a lógica de criarDetectorDeAtualizacao e não precisa ser
// carregado de verdade pra este teste (mesmo padrão de rotaModulo.test.js).
vi.mock('../components/shared/Toast', () => ({
  showToast: { custom: vi.fn() },
}));

describe('criarDetectorDeAtualizacao', () => {
  it('não avisa na primeira troca de controller quando a aba ainda não tinha controller (primeira ativação do SW, não é atualização)', () => {
    const deveNotificar = criarDetectorDeAtualizacao(false);
    expect(deveNotificar()).toBe(false);
  });

  it('avisa na troca de controller quando a aba já tinha um controller antes (atualização de verdade)', () => {
    const deveNotificar = criarDetectorDeAtualizacao(true);
    expect(deveNotificar()).toBe(true);
  });

  it('avisa em toda troca subsequente após ignorar a primeira ativação', () => {
    const deveNotificar = criarDetectorDeAtualizacao(false);
    expect(deveNotificar()).toBe(false);
    expect(deveNotificar()).toBe(true);
    expect(deveNotificar()).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd webapp && npx vitest run src/hooks/useSWUpdateNotifier.test.js`
Expected: FAIL — `useSWUpdateNotifier.js` ainda não existe (erro de import).

- [ ] **Step 3: Implementar**

Criar `webapp/src/hooks/useSWUpdateNotifier.js`:

```js
import { useEffect } from 'react';
import { showToast } from '../components/shared/Toast';

// sw.js já ativa a versão nova sozinho (skipWaiting no install + clients.claim
// no activate — ver webapp/public/sw.js), então 'controllerchange' é o sinal
// exato do momento em que o JS/CSS já carregado nesta aba passa a divergir
// da versão que o Service Worker está servindo. A primeira troca (sem
// controller antes) é só a ativação inicial, não uma atualização — por isso
// o detector ignora ela e só avisa a partir da segunda troca em diante.
export function criarDetectorDeAtualizacao(jaTinhaControllerInicial) {
  let jaTinhaController = jaTinhaControllerInicial;
  return function aoTrocarController() {
    if (!jaTinhaController) {
      jaTinhaController = true;
      return false;
    }
    return true;
  };
}

export function useSWUpdateNotifier() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const deveNotificar = criarDetectorDeAtualizacao(Boolean(navigator.serviceWorker.controller));

    function aoTrocarController() {
      if (deveNotificar()) {
        showToast.custom('Nova versão disponível.', () => window.location.reload(), 'Atualizar');
      }
    }

    navigator.serviceWorker.addEventListener('controllerchange', aoTrocarController);
    return () => navigator.serviceWorker.removeEventListener('controllerchange', aoTrocarController);
  }, []);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd webapp && npx vitest run src/hooks/useSWUpdateNotifier.test.js`
Expected: PASS (3 testes).

- [ ] **Step 5: Ligar o hook em App.jsx**

Em `webapp/src/App.jsx`, adicionar o import junto aos outros hooks (depois da linha 14, `import { useTerminologia } from './hooks/useTerminologia';`):

```js
import { useSWUpdateNotifier } from './hooks/useSWUpdateNotifier';
```

E chamar o hook logo no início de `AppRoutes()` (antes do `if (loading) return <Spinner />;`, pra respeitar Rules of Hooks — precisa ser chamado incondicionalmente em todo render):

```js
function AppRoutes() {
  const { sessao, perfil, loading, nomeUsuario, estudioId, estudioBloqueado } = useAuth();
  useSWUpdateNotifier();

  if (loading) return <Spinner />;
```

- [ ] **Step 6: Verificação manual no navegador**

```bash
cd webapp
npm run build
npm run preview
```

Abrir a URL do preview (porta padrão 4173) no navegador. Em DevTools → Application → Service Workers, confirmar que o SW está `activated and is running`. **Sem fechar a aba**, rodar `npm run build` de novo em outro terminal (build local usa `Date.now()` como versão, então cada build gera um `sw.js` diferente automaticamente). De volta à aba aberta, em DevTools → Application → Service Workers, clicar em "Update" (ou rodar `navigator.serviceWorker.getRegistration().then(r => r.update())` no console) pra forçar o navegador a checar o novo `sw.js`. Esperado: o toast "Nova versão disponível." aparece no canto superior direito, e clicar em "Atualizar" recarrega a página.

- [ ] **Step 7: Lint**

Run: `cd webapp && npm run lint`
Expected: sem erros novos.

- [ ] **Step 8: Commit**

```bash
git add webapp/src/hooks/useSWUpdateNotifier.js webapp/src/hooks/useSWUpdateNotifier.test.js webapp/src/App.jsx
git commit -m "feat(pwa): avisa sobre nova versao do Service Worker em abas ja abertas (PED-58)"
```

---

### Task 2: PED-60 — `swCacheVersionPlugin` deixa de falhar em silêncio

**Files:**
- Modify: `webapp/vite.config.js:19-36`
- Create: `webapp/vite.config.test.js`

**Interfaces:**
- Produces: `swCacheVersionPlugin(): Plugin` passa a ser named export (além de continuar em uso dentro do `defineConfig` padrão), cujo objeto retornado expõe `configResolved(config)` e `closeBundle()` — `closeBundle` é chamado com `this` contendo um método `error(mensagem)`, no mesmo formato do contexto de plugin do Rollup/Vite.

Contexto técnico: hoje `closeBundle` resolve o caminho via `resolve(process.cwd(), 'dist', 'sw.js')` e faz `if (!existsSync(caminho)) return;` — se o build rodar de outro cwd ou com `build.outDir` customizado, o plugin não encontra o arquivo, não substitui nada, e o build termina "com sucesso" servindo o literal `%%CACHE_VERSION%%` pra sempre. O fix captura `config.root` e `config.build.outDir` (os mesmos valores que o próprio Vite usa pra resolver onde o bundle é escrito) via `configResolved`, e troca o `return` silencioso por `this.error(...)` — que interrompe o build — quando o arquivo ainda assim não for encontrado.

- [ ] **Step 1: Escrever o teste que falha**

Criar `webapp/vite.config.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { swCacheVersionPlugin } from './vite.config';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

describe('swCacheVersionPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('substitui %%CACHE_VERSION%% em sw.js quando o arquivo existe no outDir resolvido', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue('const CACHE_NAME = "nexofy-%%CACHE_VERSION%%";\n');
    const plugin = swCacheVersionPlugin();
    plugin.configResolved({ root: '/app', build: { outDir: 'dist' } });
    const errorFn = vi.fn();

    plugin.closeBundle.call({ error: errorFn });

    expect(errorFn).not.toHaveBeenCalled();
    expect(writeFileSync).toHaveBeenCalledTimes(1);
    const [, conteudoEscrito] = writeFileSync.mock.calls[0];
    expect(conteudoEscrito).not.toContain('%%CACHE_VERSION%%');
  });

  it('resolve o caminho de sw.js a partir de root + build.outDir capturados em configResolved, não de process.cwd()', () => {
    existsSync.mockReturnValue(true);
    readFileSync.mockReturnValue('const CACHE_NAME = "nexofy-%%CACHE_VERSION%%";\n');
    const plugin = swCacheVersionPlugin();
    plugin.configResolved({ root: '/app', build: { outDir: 'build-custom' } });

    plugin.closeBundle.call({ error: vi.fn() });

    const [caminhoLido] = readFileSync.mock.calls[0];
    expect(caminhoLido).toBe(resolve('/app', 'build-custom', 'sw.js'));
  });

  it('chama this.error em vez de retornar em silêncio quando sw.js não existe no outDir resolvido', () => {
    existsSync.mockReturnValue(false);
    const plugin = swCacheVersionPlugin();
    plugin.configResolved({ root: '/app', build: { outDir: 'dist' } });
    const errorFn = vi.fn();

    plugin.closeBundle.call({ error: errorFn });

    expect(errorFn).toHaveBeenCalledTimes(1);
    expect(writeFileSync).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd webapp && npx vitest run vite.config.test.js`
Expected: FAIL — `swCacheVersionPlugin` ainda não é exportado de `vite.config.js` (import retorna `undefined`, chamar `undefined()` estoura `TypeError`).

- [ ] **Step 3: Implementar**

Em `webapp/vite.config.js`, substituir as linhas 19-36 (a função `swCacheVersionPlugin` inteira) por:

```js
export function swCacheVersionPlugin() {
  const versao = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? String(Date.now());
  let root;
  let outDir;
  return {
    name: 'sw-cache-version',
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },
    closeBundle() {
      const caminho = resolve(root, outDir, 'sw.js');
      if (!existsSync(caminho)) {
        // Antes retornava em silêncio: se o build algum dia rodar de outro
        // cwd ou com build.outDir customizado, o sw.js deployado ficava com
        // o literal %%CACHE_VERSION%% pra sempre, sem o build "quebrar" em
        // lugar nenhum (PED-60). this.error interrompe o build de propósito.
        this.error(`sw-cache-version: ${caminho} não encontrado — CACHE_VERSION não foi substituído em sw.js.`);
        return;
      }
      // Restrito às linhas `const ..._NAME = ...`: um replaceAll sobre o
      // arquivo inteiro também atingiria o token %%CACHE_VERSION%% citado
      // no comentário explicativo acima, corrompendo-o (PED-59).
      const conteudo = readFileSync(caminho, 'utf-8').replace(
        /^(const (?:CACHE_NAME|STATIC_CACHE_NAME) = .*)$/gm,
        (linha) => linha.replaceAll('%%CACHE_VERSION%%', versao)
      );
      writeFileSync(caminho, conteudo);
    },
  };
}
```

O restante do arquivo (import do topo, comentário explicativo sobre `closeBundle` vs `writeBundle`, e o `export default defineConfig({...})` com `plugins: [react(), swCacheVersionPlugin()]`) não muda.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd webapp && npx vitest run vite.config.test.js`
Expected: PASS (3 testes).

- [ ] **Step 5: Verificar que o build real de produção continua funcionando**

```bash
cd webapp
npm run build
grep -c '%%CACHE_VERSION%%' dist/sw.js
```

Expected: build termina com sucesso (exit 0) e o `grep -c` retorna `0` (nenhuma ocorrência de `%%CACHE_VERSION%%` restante em `dist/sw.js` — confirma que o plugin, depois do refactor, ainda substitui a versão no caminho feliz, que é o que produção usa hoje).

- [ ] **Step 6: Rodar a suíte completa e lint**

Run: `cd webapp && npm test && npm run lint`
Expected: todos os testes (existentes + os 3 novos) passam, sem erros novos de lint.

- [ ] **Step 7: Commit**

```bash
git add webapp/vite.config.js webapp/vite.config.test.js
git commit -m "fix(build): swCacheVersionPlugin falha alto em vez de silencioso se nao achar sw.js (PED-60)"
```

---

### Task 3: PED-61 — `moduloEstaAtivo` fail-closed pra qualquer tipo inesperado

**Files:**
- Modify: `webapp/src/lib/modulos.js:8-10`
- Create: `webapp/src/lib/modulos.test.js`

**Interfaces:**
- Produces: assinatura de `moduloEstaAtivo(modulosAtivos, chave) => boolean` não muda — só o comportamento fica mais restrito (fail-closed também pra tipos não-array, não só `null`/`undefined`). Consumida hoje por `webapp/src/hooks/useTerminologia.js:55` e `webapp/src/lib/rotaModulo.js:21`, nenhum dos dois precisa mudar.

- [ ] **Step 1: Escrever o teste que falha**

Criar `webapp/src/lib/modulos.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { moduloEstaAtivo } from './modulos';

describe('moduloEstaAtivo', () => {
  it('retorna true quando a chave está na lista', () => {
    expect(moduloEstaAtivo(['agenda', 'landing_page_builder'], 'landing_page_builder')).toBe(true);
  });

  it('retorna false quando a chave não está na lista', () => {
    expect(moduloEstaAtivo(['agenda', 'financeiro'], 'landing_page_builder')).toBe(false);
  });

  it('fail-closed (false) quando modulosAtivos é null', () => {
    expect(moduloEstaAtivo(null, 'landing_page_builder')).toBe(false);
  });

  it('fail-closed (false) quando modulosAtivos é undefined', () => {
    expect(moduloEstaAtivo(undefined, 'landing_page_builder')).toBe(false);
  });

  it('fail-closed (false) quando modulosAtivos vem como string, mesmo contendo a chave como substring', () => {
    // Regressão (PED-61): `.includes()` em string faz busca de substring, não
    // de elemento — 'landing_page_builder_v2'.includes('landing_page_builder')
    // é true, o que inverteria este guard de fail-closed pra fail-open.
    expect(moduloEstaAtivo('landing_page_builder_v2', 'landing_page_builder')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd webapp && npx vitest run src/lib/modulos.test.js`
Expected: FAIL só no último teste (string) — `'landing_page_builder_v2'.includes('landing_page_builder')` é `true` na implementação atual; os outros 4 já passam.

- [ ] **Step 3: Implementar**

Em `webapp/src/lib/modulos.js`, trocar a linha 9:

```js
export function moduloEstaAtivo(modulosAtivos, chave) {
  return Array.isArray(modulosAtivos) && modulosAtivos.includes(chave);
}
```

(O comentário de cabeçalho do arquivo, linhas 1-7, continua válido e não precisa mudar.)

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `cd webapp && npx vitest run src/lib/modulos.test.js`
Expected: PASS (5 testes).

- [ ] **Step 5: Rodar a suíte completa e lint**

Run: `cd webapp && npm test && npm run lint`
Expected: todos os testes passam, sem erros novos de lint.

- [ ] **Step 6: Commit**

```bash
git add webapp/src/lib/modulos.js webapp/src/lib/modulos.test.js
git commit -m "fix(seguranca): moduloEstaAtivo fail-closed se modulos_ativos nao for array (PED-61)"
```

---

### Task 4: PED-57 — alinhar `gerar-mensalidades/config.toml` com o estado real de produção

**Files:**
- Modify: `supabase/functions/gerar-mensalidades/config.toml` (arquivo inteiro, 7 linhas)

**Interfaces:** N/A — mudança de configuração/documentação, sem código nem função nova.

**Investigação (já concluída ao vivo, via Supabase MCP autorizado pelo usuário — não repetir):**
- `get_edge_function` (produção, `tciiepqmnrrcjnqhspvw`): `verify_jwt: true`, divergente do `config.toml` local (`false`).
- `select jobid, schedule, command, active, jobname from cron.job` (produção): resultado vazio — nenhum pg_cron job registrado.
- `query_logs` em `function_edge_logs`, filtrado por `gerar-mensalidades`, janela `2026-08-01T00:00:00Z`–`2026-08-01T23:59:59Z` (dia do `schedule = "0 8 1 * *"`): zero entradas — o cron nunca disparou, nem com sucesso nem com 401.
- **Conclusão: o `[[cron]]` deste arquivo nunca esteve ligado a um scheduler real em produção** — confirma `docs/RUNBOOK_INCIDENTE.md` ("hoje não existe nenhum cron ativo em produção"), que contradizia a premissa original de PED-57. Além disso, o `command` não envia o `estudioId` que `handleRequest()` exige no payload (400 garantido, independente do gateway) e tem um typo de sintaxe (`<tciiepqmnrrcjnqhspvw>` com colchetes literais em vez de hostname válido).
- Registrado em comentário em [PED-57](https://linear.app/pedro-schuster/issue/PED-57) (rebaixado pra Low — não é mais um incidente ativo) e na issue de acompanhamento [PED-68](https://linear.app/pedro-schuster/issue/PED-68) (decisão de produto sobre iteração por estúdio + quando habilitar de verdade, fora de escopo aqui).
- **Achado da revisão final (28/08/2026, análise estática do repo, não MCP):** o `supabase/config.toml` da RAIZ do repo — o arquivo que a documentação oficial da Supabase confirma que a CLI lê pra blocos `[functions.*]` — só tem entradas pra `[functions.lembretes-aula]` e `[functions.criar-subconta-asaas]`; nunca teve uma pra `[functions.gerar-mensalidades]`. Isso deixa incerto se o `config.toml` POR-FUNCTION (este arquivo, em `supabase/functions/gerar-mensalidades/`) é sequer lido por `supabase functions deploy` — um redeploy simples pode não mudar o `verify_jwt` de produção. Ver a nota em Step 3 antes de executá-lo.

Esta task **não inclui nenhum redeploy de produção** — só alinha a documentação local pra refletir a realidade e evitar que alguém assuma que o cron existe. O passo de redeploy fica como Step 3, manual e não executado por este plano (ver nota).

- [x] **Step 1: Atualizar `supabase/functions/gerar-mensalidades/config.toml`**

Substituir o conteúdo inteiro do arquivo por:

```toml
[functions.gerar-mensalidades]
verify_jwt = false  # Permite chamada do cron sem auth (autorização real é o check de
                    # x-cron-secret dentro da própria function — ver AUTORIZAÇÃO em
                    # index.ts). PED-57: o deploy em produção está com verify_jwt=true.
                    # INCERTEZA (revisão final, 28/08/2026): não está confirmado que este
                    # config.toml POR-FUNCTION seja lido por `supabase functions deploy` —
                    # o `supabase/config.toml` da RAIZ (o arquivo que a doc oficial da
                    # Supabase confirma que a CLI lê) só tem blocos [functions.*] pra
                    # lembretes-aula e criar-subconta-asaas, nunca teve um pra
                    # gerar-mensalidades. Um redeploy simples pode não mudar nada. Antes
                    # de tentar sincronizar produção, confirmar se é preciso adicionar
                    # [functions.gerar-mensalidades] verify_jwt=false no config.toml da
                    # RAIZ, ou usar a flag --no-verify-jwt no deploy, em vez de assumir
                    # que só redeployar com este arquivo basta.

# ATENÇÃO (PED-57/PED-68): este [[cron]] NUNCA esteve ativo em produção — confirmado
# em 28/08/2026 via cron.job vazio (evidência definitiva: uma tabela pg_cron não
# expira nem é podada, então vazio = nunca existiu um job aqui). function_edge_logs
# também não mostrou nenhuma invocação em 01/08/2026, mas essa evidência é mais fraca
# (retenção de log pode ser curta no plano free) — cron.job é a prova que sustenta a
# conclusão. Não é só o verify_jwt: o command abaixo não envia corpo nenhum, mas
# handleRequest() em index.ts exige `estudioId` no payload (400 sem ele), e a
# function só processa UM estudioId por chamada — um cron real precisaria iterar
# sobre todos os estúdios ativos, o que ela não faz hoje (mesma lacuna já registrada
# em gerar-repasses-mensais/config.toml, PED-33/PED-18). Ver PED-68 pra decisão de
# produto antes de habilitar isto de verdade.
[[cron]]
name = "cobrancas-mensais"
schedule = "0 8 1 * *"   # Dia 1 de cada mês, às 08h
command = "POST https://tciiepqmnrrcjnqhspvw.supabase.co/functions/v1/gerar-mensalidades -H 'x-cron-secret: ${CRON_SECRET}'"
```

- [x] **Step 2: Commit**

```bash
git add supabase/functions/gerar-mensalidades/config.toml
git commit -m "docs(gerar-mensalidades): alinha config.toml com estado real de producao (PED-57)"
```

- [ ] **Step 3 (MANUAL — requer confirmação explícita do usuário, não executar sem perguntar): sincronizar `verify_jwt` no deploy de produção**

O `config.toml` já diz `verify_jwt = false`; produção ainda está com `true`. Corrigir isso exige um redeploy real da function contra `tciiepqmnrrcjnqhspvw`:

```bash
supabase functions deploy gerar-mensalidades --project-ref tciiepqmnrrcjnqhspvw
```

**INCERTEZA (revisão final, 28/08/2026):** não está confirmado que este comando, do jeito que está escrito, realmente aplique `verify_jwt = false` em produção — ele depende do `config.toml` POR-FUNCTION ser lido por `supabase functions deploy`, mas o `supabase/config.toml` da RAIZ (o arquivo que a doc oficial confirma que a CLI lê) nunca teve um bloco `[functions.gerar-mensalidades]`. Antes de rodar este passo, confirmar qual é o mecanismo certo — adicionar `[functions.gerar-mensalidades]` com `verify_jwt = false` no `config.toml` da raiz, usar a flag `--no-verify-jwt` no deploy, ou confirmar que o arquivo por-function já é suficiente — em vez de assumir que o comando acima, sozinho, resolve.

(Alternativa disponível: a tool MCP `deploy_edge_function`.) Como o cron não está ligado a nada hoje (Step 1), isto não corrige um incidente ativo — só deixa o deploy coerente com a documentação, antecipando PED-68. Por isso fica como passo manual, separado do commit local, e só deve rodar se o usuário confirmar explicitamente que quer sincronizar produção agora.
