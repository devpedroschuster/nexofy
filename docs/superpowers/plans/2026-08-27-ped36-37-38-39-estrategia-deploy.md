# Frente 5 — Estratégia de Deploy (PED-36, 37, 38, 39) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Formalizar e, onde fizer sentido, automatizar as quatro práticas da "Frente 5: Estratégia de Deploy" — sequência segura de deploy de backend, cache do Service Worker, regra de merge via Preview Deployment testado, e canary release por tenant.

**Architecture:** Um doc novo e central, `docs/DEPLOY.md` (mesmo padrão de `docs/OBSERVABILIDADE.md`), concentra as quatro práticas; cada task contribui sua seção + o código/config correspondente, quando houver. PED-39 adiciona um guard de rota (`RotaComModulo`) em `App.jsx`, reaproveitando o `moduloAtivo()` que `useTerminologia()` já expõe hoje só pro `Sidebar`. PED-37 substitui o placeholder morto `%%VITE_APP_SLUG%%` do service worker (nunca foi substituído por nada — confirmado comparando `webapp/public/sw.js` com o build real em `webapp/dist/sw.js`, que ainda tem o literal `%%VITE_APP_SLUG%%-v3`) por um `%%CACHE_VERSION%%` de verdade, injetado no build por um plugin Vite novo. PED-36 corrige um required status check já quebrado (nome desatualizado, nunca vai ser satisfeito) na proteção de `main` e adiciona o check "Vercel" como obrigatório.

**Tech Stack:** React Router (guards já existentes em `App.jsx`), Vite (plugin custom via hook `closeBundle`), Service Worker API nativa, GitHub REST API via `gh api`, Vitest.

**Spec:** Tickets Linear [PED-36](https://linear.app/pedro-schuster/issue/PED-36/deploy-regra-nunca-mergear-direto-em-main-sem-preview-deployment), [PED-37](https://linear.app/pedro-schuster/issue/PED-37/deploy-estrategia-network-first-versionamento-de-cache-no-service), [PED-38](https://linear.app/pedro-schuster/issue/PED-38/deploy-documentar-sequencia-segura-de-deploy-backend-migration), [PED-39](https://linear.app/pedro-schuster/issue/PED-39/deploy-feature-flag-por-tenant-via-estudiosmodulos-ativos-canary) — todos sob "Frente 5. Estratégia de Deploy". Sem brainstorming prévio dedicado — desenho decidido durante a investigação do estado atual do repo que gerou este plano (motivo de cada decisão fica no corpo de cada task, já que não há um design doc separado pra linkar).

## Global Constraints

- Não duplicar a lógica de `moduloAtivo()` — o guard de PED-39 reaproveita `useTerminologia()`, não reimplementa o `.includes()`.
- O guard de módulo deve falhar **fechado** (nega acesso por padrão) — diferente da salvaguarda de lista-vazia do `Sidebar` (que falha aberto de propósito). Ver comentário completo na Task 2.
- `verify_jwt` e demais configs de Edge Functions ficam fora de escopo deste plano — não é assunto de nenhum dos 4 tickets (achado incidental sobre `gerar-mensalidades` já registrado à parte em PED-57).
- Novo doc vive em `docs/DEPLOY.md` — não duplicar conteúdo já existente na seção "🚦 Fluxo de deploy" do `README.md`; a seção do README passa a apontar pra lá em vez de repetir o conteúdo.
- A mudança de branch protection (Task 4) altera configuração viva do GitHub, não arquivo versionado — **não tem commit**, e o `gh api -X PUT` correspondente só deve rodar depois de confirmação explícita do usuário na sessão, mesmo executando este plano de forma autônoma. **Essa confirmação já foi dada nesta sessão: `enforce_admins` fica `false`, e adicionar "Vercel" como obrigatório foi aprovado — o implementador da Task 4 não precisa parar de novo no Step 2, só registrar isso no relatório.**

---

## File Structure

- **Create** `docs/DEPLOY.md` — doc central das 4 práticas (Tasks 1-4 adicionam suas seções incrementalmente, nessa ordem, cada uma em seu próprio commit).
- **Modify** `README.md:80-108` — encurta a seção "🚦 Fluxo de deploy: staging → produção" pra apontar pro novo doc.
- **Create** `webapp/src/lib/rotaModulo.js` + **Test** `webapp/src/lib/rotaModulo.test.js` — lógica pura do guard de módulo (Task 2).
- **Modify** `webapp/src/App.jsx` — novo componente `RotaComModulo` (Task 2), fino, sem lógica própria além de chamar `destinoRotaModulo`.
- **Modify** `webapp/public/sw.js:1-2` — remove placeholder morto, versiona cache de verdade (Task 3).
- **Modify** `webapp/vite.config.js` — plugin novo que injeta a versão no build (Task 3).
- **GitHub (não é arquivo do repo)** — proteção de branch de `main` via `gh api` (Task 4).

---

### Task 1: PED-38 — `docs/DEPLOY.md` com a sequência segura de deploy de backend

**Files:**
- Create: `docs/DEPLOY.md`
- Modify: `README.md:80-108` (seção "🚦 Fluxo de deploy: staging → produção")

**Interfaces:** nenhuma (só documentação).

- [ ] **Step 1: Criar `docs/DEPLOY.md`**

```markdown
# Deploy — Nexofy

Este documento formaliza as práticas de deploy do projeto (Frente 5 do
backlog). Complementa a seção "Como rodar localmente" do `README.md`.

## 1. Sequência segura de deploy de backend

Toda mudança que envolve banco + Edge Function + frontend segue esta ordem,
nesse sentido — nunca ao contrário:

1. **Migration aditiva** em `supabase/migrations/` — só cria (nova coluna
   nullable ou com `DEFAULT`, nova função, novo índice). Nunca `DROP` ou
   `RENAME` de algo que o código em produção ainda lê/escreve. Aplicar em
   staging primeiro (`supabase link --project-ref <staging> && supabase db
   push`), validar, só então promover pra produção (ver `README.md` pra o
   passo a passo de `supabase link`/`db push`).
2. **Deploy da Edge Function nova ou alterada**, já preparada pra conviver
   com o schema pré- *e* pós-migration (a migration do passo 1 já rodou,
   então a function pode contar com a coluna/função nova existir).
3. **Deploy do frontend** que passa a consumir a mudança (nova coluna, novo
   retorno de RPC, etc.) — só depois que a function do passo 2 já está no
   ar, pra nenhum usuário bater num frontend novo contra uma function
   antiga que não entende o novo formato.
4. **Migration de limpeza**, só se necessário e só depois dos passos
   1-3 confirmados em produção — agora sim pode `DROP` a coluna/função
   antiga, já que nada em produção mais depende dela.

Por que essa ordem: um `DROP`/`RENAME` direto no passo 1 quebra a Edge
Function e o frontend *ainda em produção* no instante em que a migration
roda, antes de qualquer deploy de código — a janela de erro começa antes
mesmo do primeiro deploy. Migration aditiva elimina essa janela: código
antigo e novo convivem com o mesmo schema até o passo 4.

## 2. Cache do Service Worker (PWA)

Ver `webapp/public/sw.js`. O `CACHE_NAME`/`STATIC_CACHE_NAME` carregam um
`%%CACHE_VERSION%%` gerado automaticamente a cada build (commit SHA em
produção, timestamp em build local) — isso já garante que cada deploy
troca as caches, sem depender de alguém lembrar de bumpar um número à mão.
Página (`navigate`) e chamadas a `supabase.co`/`/api/` já são
network-first (tenta rede, cai pro cache só se a rede falhar); scripts,
estilos, fontes e imagens continuam cache-first deliberadamente — como o
Vite já dá hash de conteúdo a esses arquivos, um deploy novo gera nomes de
arquivo novos, e cache-first nunca serve um arquivo desatualizado sob um
hash que já existia antes.

## 3. Regra de merge: sempre via Preview Deployment testado

`main` nunca recebe merge sem passar por um **Preview Deployment da
Vercel** já testado manualmente. Cada PR aberto no GitHub já dispara esse
preview automaticamente (integração Git da Vercel). A proteção de branch
de `main` no GitHub exige o check "Vercel" (deployment concluído) e
"Lint, Test & Build" antes de permitir o merge — ver histórico de
configuração real em PED-36.

## 4. Canary release por tenant (feature flags)

Para funcionalidades grandes que não devem ir pra todo mundo de uma vez,
reaproveite o mecanismo de módulos já existente (`estudios.modulos_ativos`,
`text[]`) em vez de inventar um sistema de flags novo:

1. Escolha uma chave nova pro módulo (ex.: `landing_page_builder`) — não
   precisa migration, é só um valor de texto novo dentro do array.
2. Habilite só pro(s) tenant(s) piloto:
   `atualizarEstudio(estudioId, { modulos_ativos: [...modulosAtuais, 'landing_page_builder'] })`
   (`webapp/src/services/estudioService.js`) — os demais tenants nem
   sabem que a chave existe, já que `modulos_ativos` deles não muda.
3. No item de menu (`Sidebar.jsx`), marque `modulo: 'landing_page_builder'`
   — some do menu de quem não tem a chave (com a salvaguarda de "lista
   vazia não esconde nada" já existente, pra não sumir o sidebar inteiro
   numa corrida de carregamento).
4. Na(s) rota(s) da feature em si (`App.jsx`), envolva com
   `<RotaComModulo modulo="landing_page_builder">` (ver PED-39) — sem
   isso, esconder o link do menu não impede acesso direto pela URL.
5. Quando a feature estiver pronta pra todo mundo, adicione a chave ao
   `DEFAULT` da coluna (migration) em vez de ativar tenant por tenant.
```

- [ ] **Step 2: Encurtar a seção equivalente do `README.md`**

Substituir o conteúdo de `README.md:80-108` (do `## 🚦 Fluxo de deploy: staging → produção` até a linha antes de `## 🧩 Principais funcionalidades`) por:

```markdown
## 🚦 Fluxo de deploy: staging → produção

Existem dois projetos Supabase — **staging** (dev local aponta pra cá por padrão) e
**produção**. No front-end, cada PR aberto no GitHub dispara automaticamente um
**Preview Deployment** na Vercel, validável antes do merge em `main`.

Sequência completa (migrations, Edge Functions, cache do Service Worker, regra de
merge e canary release por tenant) documentada em [`docs/DEPLOY.md`](docs/DEPLOY.md).
```

- [ ] **Step 3: Conferir os links**

Abrir `docs/DEPLOY.md` e `README.md` renderizados (preview do editor ou `gh browse` depois do push) e confirmar que o link `docs/DEPLOY.md` do README resolve e que não sobrou nenhuma referência solta à sequência antiga de `supabase link`/`db push` fora do novo doc.

- [ ] **Step 4: Commit**

```bash
git add docs/DEPLOY.md README.md
git commit -m "docs: formaliza sequencia segura de deploy backend (PED-38)"
```

---

### Task 2: PED-39 — Guard de rota por módulo (canary release)

**Files:**
- Create: `webapp/src/lib/rotaModulo.js`
- Test: `webapp/src/lib/rotaModulo.test.js`
- Modify: `webapp/src/App.jsx` (novo componente `RotaComModulo`, sem alterar nenhuma rota existente — nenhuma feature hoje precisa do guard ainda)

**Interfaces:**
- Consumes: `rotaPorPerfil(perfil)` de `webapp/src/lib/navigation.js` (já existe, já importado em `App.jsx`); `useAuth()` (retorna `{ perfil, ... }`, `webapp/src/hooks/useAuth.jsx`); `useTerminologia()` (retorna `{ modulosAtivos, moduloAtivo, ... }`, `webapp/src/hooks/useTerminologia.js`).
- Produces: `destinoRotaModulo(modulosAtivos, moduloExigido, perfil)` — retorna `null` (libera acesso) ou uma string de rota (redireciona pra lá). `RotaComModulo({ modulo })` — componente de rota, mesmo formato de `RotaSuperAdmin` (`App.jsx:163-169`): sem props além de `modulo`, renderiza `<Outlet/>` ou `<Navigate/>`.

- [ ] **Step 1: Escrever o teste (falhando) de `destinoRotaModulo`**

Criar `webapp/src/lib/rotaModulo.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';
import { destinoRotaModulo } from './rotaModulo';

vi.mock('./navigation', () => ({
  rotaPorPerfil: (perfil) => (perfil === 'professor' ? '/agenda' : '/dashboard'),
}));

describe('destinoRotaModulo', () => {
  it('libera acesso (retorna null) quando o módulo está na lista', () => {
    expect(destinoRotaModulo(['agenda', 'landing_page_builder'], 'landing_page_builder', 'admin')).toBeNull();
  });

  it('bloqueia e redireciona pra rota do perfil quando o módulo não está na lista', () => {
    expect(destinoRotaModulo(['agenda', 'financeiro'], 'landing_page_builder', 'admin')).toBe('/dashboard');
  });

  it('bloqueia (fail-closed) quando a lista de módulos está vazia', () => {
    // Diferente da salvaguarda do Sidebar (lista vazia não esconde item de
    // menu) — aqui lista vazia BLOQUEIA. RotaComModulo só renderiza depois
    // que RotaPrivada já resolveu `loading`, então não existe a mesma
    // corrida de carregamento que o Sidebar precisa absorver; e o custo de
    // errar é oposto (liberar de mais é pior que bloquear de mais).
    expect(destinoRotaModulo([], 'landing_page_builder', 'professor')).toBe('/agenda');
  });

  it('bloqueia quando modulosAtivos é null/undefined', () => {
    expect(destinoRotaModulo(undefined, 'landing_page_builder', 'admin')).toBe('/dashboard');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Dentro de `webapp/`:
```bash
npx vitest run src/lib/rotaModulo.test.js
```
Expected: FAIL — `Cannot find module './rotaModulo'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar `destinoRotaModulo`**

Criar `webapp/src/lib/rotaModulo.js`:

```js
// Decide o destino de uma rota protegida por módulo (PED-39 — canary
// release por tenant via estudios.modulos_ativos). Extraído como função
// pura (mesmo padrão de webapp/src/pages/SuperAdmin/components/saudeSistemaHelpers.js)
// pra poder testar a composição com rotaPorPerfil() sem montar componente.
//
// Fail-closed deliberado: diferente da salvaguarda de Sidebar.jsx (lista
// de módulos vazia NÃO esconde item de menu, pra não piscar um sidebar
// incompleto durante a corrida de carregamento do perfil), aqui lista
// vazia ou ausente BLOQUEIA a rota. A diferença de contexto justifica a
// diferença de comportamento: o componente que usa esta função
// (RotaComModulo, em App.jsx) só é renderizado dentro de RotaPrivada, que
// já mostra um spinner e não renderiza nada enquanto `loading` for true —
// não existe, aqui, a mesma corrida que o Sidebar precisa absorver. E o
// custo de errar é oposto: no Sidebar, esconder de mais é pior que
// mostrar de mais (link quebrado); num guard de acesso, liberar de mais é
// pior que bloquear de mais.
import { rotaPorPerfil } from './navigation';

export function destinoRotaModulo(modulosAtivos, moduloExigido, perfil) {
  if ((modulosAtivos ?? []).includes(moduloExigido)) return null;
  return rotaPorPerfil(perfil);
}
```

- [ ] **Step 4: Rodar o teste de novo e confirmar que passa**

```bash
npx vitest run src/lib/rotaModulo.test.js
```
Expected: PASS nos 4 casos.

- [ ] **Step 5: Adicionar o componente `RotaComModulo` em `App.jsx`**

Em `webapp/src/App.jsx`, importar o novo helper junto dos demais imports de `lib/`:

```js
import { rotaPorPerfil } from './lib/navigation';
import { destinoRotaModulo } from './lib/rotaModulo';
```

E adicionar o componente logo depois de `RotaSuperAdmin` (depois da linha 169, mesmo estilo — autocontido, sem props de estado vindas de fora):

```jsx
// Guard de módulo — controla acesso a uma rota inteira por
// estudios.modulos_ativos, pra canary release de features grandes por
// tenant (PED-39). Complementa RotaPrivada (auth/role): usado aninhado
// dentro dela, nunca sozinho, pra também herdar a checagem de
// sessão/perfil/estúdio bloqueado.
function RotaComModulo({ modulo }) {
  const { perfil } = useAuth();
  const { modulosAtivos } = useTerminologia();
  const destino = destinoRotaModulo(modulosAtivos, modulo, perfil);
  if (destino) return <Navigate to={destino} replace />;
  return <Outlet />;
}
```

Adicionar o import de `useTerminologia`:
```js
import { useTerminologia } from './hooks/useTerminologia';
```

Nenhuma rota existente usa `RotaComModulo` ainda — nenhuma feature atual precisa de canary release. Fica pronto pro próximo feature grande (ex.: Landing Page Builder, citado no ticket) se aninhar assim, dentro do bloco de rotas já protegido por `RotaPrivada`:
```jsx
<Route element={<RotaComModulo modulo="landing_page_builder" />}>
  <Route path="/landing-builder" element={<LandingPageBuilder />} />
</Route>
```

- [ ] **Step 6: Rodar lint, build e a suíte inteira**

Dentro de `webapp/`:
```bash
npm run lint
npm run build
npm test
```
Expected: sem erro novo. `npm test` agora roda 64 testes de Vitest (60 existentes + os 4 novos de `rotaModulo.test.js`).

- [ ] **Step 7: Commit**

```bash
git add webapp/src/lib/rotaModulo.js webapp/src/lib/rotaModulo.test.js webapp/src/App.jsx
git commit -m "feat(webapp): guard de rota por modulo pra canary release por tenant (PED-39)"
```

---

### Task 3: PED-37 — Versionamento automático de cache no Service Worker

**Files:**
- Modify: `webapp/public/sw.js:1-2`
- Modify: `webapp/vite.config.js`

**Interfaces:**
- Produces: token `%%CACHE_VERSION%%` em `sw.js`, substituído no build pelo plugin Vite `swCacheVersionPlugin` (sem export — plugin interno de `vite.config.js`, mesmo arquivo onde é usado).

- [ ] **Step 1: Trocar o placeholder morto por um de verdade em `sw.js`**

Em `webapp/public/sw.js`, trocar as linhas 1-2:

```js
const CACHE_NAME = '%%VITE_APP_SLUG%%-v3';
const STATIC_CACHE_NAME = '%%VITE_APP_SLUG%%-static-v3';
```

por:

```js
// %%CACHE_VERSION%% é substituído no build (vite.config.js,
// swCacheVersionPlugin) pelo SHA curto do commit (Vercel) ou um
// timestamp (build local) — cada deploy troca o nome das caches
// automaticamente, sem depender de bumpar um número à mão. Isolamento
// entre tenants já vem de graça do Cache Storage ser escopado por
// origem (cada estúdio é um subdomínio) — não precisa de slug no nome.
const CACHE_NAME = 'nexofy-%%CACHE_VERSION%%';
const STATIC_CACHE_NAME = 'nexofy-static-%%CACHE_VERSION%%';
```

- [ ] **Step 2: Adicionar o plugin de versionamento em `vite.config.js`**

Em `webapp/vite.config.js`, adicionar antes de `export default defineConfig({...})`:

```js
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Substitui %%CACHE_VERSION%% em dist/sw.js depois do build. O Vite copia
// public/sw.js pra dist/ sem processar (comportamento padrão de arquivos
// em public/) — por isso o replace acontece manualmente aqui, em
// closeBundle. Usa closeBundle (não writeBundle) de propósito: a cópia de
// public/ não é um passo do pipeline de plugins do Rollup, então a ordem
// dela em relação a um writeBundle de plugin não é garantida; closeBundle
// é o hook que a própria documentação do Vite recomenda pra pós-processar
// arquivos de output porque só roda depois que tudo — incluindo a cópia
// de public/ — já terminou. SHA do commit em produção (a Vercel injeta
// VERCEL_GIT_COMMIT_SHA em todo build) porque amarra a versão da cache à
// revisão de código real, não a um horário; timestamp como fallback pra
// build local, onde essa env var não existe.
function swCacheVersionPlugin() {
  const versao = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) ?? String(Date.now());
  return {
    name: 'sw-cache-version',
    closeBundle() {
      const caminho = resolve(process.cwd(), 'dist', 'sw.js');
      if (!existsSync(caminho)) return;
      const conteudo = readFileSync(caminho, 'utf-8').replaceAll('%%CACHE_VERSION%%', versao);
      writeFileSync(caminho, conteudo);
    },
  };
}
```

E incluir no array de plugins:
```js
plugins: [react(), swCacheVersionPlugin()],
```

- [ ] **Step 3: Rodar o build e verificar a substituição**

Dentro de `webapp/`:
```bash
npm run build
grep -c "%%CACHE_VERSION%%" dist/sw.js
grep -o "nexofy-[a-z0-9]*" dist/sw.js | sort -u
```
Expected: primeiro `grep` retorna `0` (nenhum placeholder sobrou); segundo mostra `nexofy-<versao>` e `nexofy-static-<versao>` com a mesma `<versao>` (um timestamp numérico, já que é build local sem `VERCEL_GIT_COMMIT_SHA`).

- [ ] **Step 4: Rodar lint e a suíte inteira**

```bash
npm run lint
npm test
```
Expected: sem erro novo (nenhum teste existente toca `sw.js` ou `vite.config.js`).

- [ ] **Step 5: Commit**

```bash
git add webapp/public/sw.js webapp/vite.config.js
git commit -m "fix(webapp): versiona cache do service worker automaticamente no build (PED-37)"
```

---

### Task 4: PED-36 — Corrigir e reforçar a proteção de branch de `main`

**Files:** nenhum arquivo do repo além do doc — mudança de configuração no GitHub via `gh api`.

**Interfaces:** nenhuma.

**Contexto (já levantado, não repetir a investigação):** `gh api repos/devpedroschuster/nexofy/branches/main/protection` hoje mostra `required_status_checks.contexts: ["Lint & Build"]` — esse nome **não bate** com nenhum check real (o job em `.github/workflows/ci.yml` se chama `Lint, Test & Build`; confirmado no PR #10 mais recente, que reportou exatamente `Lint, Test & Build`, `Vercel`, `E2E (Playwright)`, `Vercel Preview Comments` e `GitGuardian Security Checks`). Esse required check nunca é satisfeito por nome — só não trava merges hoje porque `enforce_admins` está `false`, e o único usuário do repo é admin.

**Confirmação já obtida nesta sessão (não perguntar de novo):** o usuário escolheu explicitamente "Corrigir + exigir Vercel" com `enforce_admins` permanecendo `false` — ou seja, o Step 2 abaixo já está resolvido antes de este guard começar; só documentar no relatório que a confirmação veio da sessão que gerou o plano, não re-perguntar.

- [ ] **Step 1: Confirmar o estado atual antes de mudar nada**

```bash
export PATH="$PATH:/c/Program Files/GitHub CLI"
gh api repos/devpedroschuster/nexofy/branches/main/protection
```
Expected: mesmo estado descrito acima (`contexts: ["Lint & Build"]`, `enforce_admins.enabled: false`). Se já tiver mudado desde este plano ter sido escrito, reavaliar antes de continuar (parar e reportar BLOCKED se o estado real divergir do esperado o suficiente pra mudar a decisão).

- [ ] **Step 2: Aplicar a correção**

```bash
gh api repos/devpedroschuster/nexofy/branches/main/protection -X PUT --input - <<'EOF'
{
  "required_status_checks": {
    "strict": false,
    "contexts": ["Lint, Test & Build", "Vercel"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null
}
EOF
```

- [ ] **Step 3: Verificar que a mudança foi aplicada**

```bash
gh api repos/devpedroschuster/nexofy/branches/main/protection -q '.required_status_checks.contexts, .enforce_admins.enabled'
```
Expected: `["Lint, Test & Build", "Vercel"]` e `false`.

- [ ] **Step 4: Adicionar a seção ao `docs/DEPLOY.md`**

Substituir, na seção "## 3. Regra de merge: sempre via Preview Deployment testado" (criada na Task 1), a frase "ver histórico de configuração real em PED-36" por:

```markdown
Checks obrigatórios hoje na proteção de `main` (GitHub → Settings →
Branches): `Lint, Test & Build` e `Vercel`. Confirmar com
`gh api repos/devpedroschuster/nexofy/branches/main/protection` sempre que
um workflow do CI for renomeado — um required check com nome desatualizado
não trava merge nenhum, só fica "pendente" pra sempre (foi o que aconteceu
até aqui com o check antigo "Lint & Build", órfão desde que o job de CI
passou a se chamar "Lint, Test & Build").
```

- [ ] **Step 5: Commit (só o doc — a mudança de proteção de branch não é arquivo)**

```bash
git add docs/DEPLOY.md
git commit -m "docs: registra checks obrigatorios da protecao de main (PED-36)"
```

---

## Self-Review

**Cobertura do spec:** PED-36 → Task 4 (correção + reforço da proteção + doc). PED-37 → Task 3 (versionamento automático de cache). PED-38 → Task 1 (doc da sequência de deploy). PED-39 → Task 2 (guard de rota reaproveitando `modulos_ativos`). As quatro tasks também se linkam de volta pro doc central da Task 1, então nenhuma fica orfã de contexto.

**Placeholders:** nenhum "TBD"/"adicionar tratamento apropriado" — todo código e todo trecho de doc está escrito por extenso em cada step.

**Consistência de tipos/assinaturas:** `destinoRotaModulo(modulosAtivos, moduloExigido, perfil)` é definida na Task 2 Step 3 e usada sem alteração na Task 2 Step 5 (`RotaComModulo`) e nos testes da Task 2 Step 1 — mesma ordem de argumentos e mesmo contrato de retorno (`null` | string) em todo lugar.
