# PED-107 / PED-108: Checklist gamificado de onboarding — design

Linear: [PED-107](https://linear.app/pedro-schuster/issue/PED-107/painel-vazio-no-primeiro-login-nao-tem-tour-checklist-ou-orientacao),
[PED-108](https://linear.app/pedro-schuster/issue/PED-108/ordem-de-configuracao-inicial-nao-e-guiada-dependencia-circular)

## Problema

- **PED-107**: um estúdio novo cai direto em sete seções de menu vazias
  (Alunos, Planos, Professores, Modalidades, Agenda, Presença, Feriados) sem
  nenhum tour, checklist ou tooltip — nem pista de por onde começar.
- **PED-108**: a ordem certa de configuração inicial (o que cadastrar antes
  do quê) não é guiada em lugar nenhum.

**Achado da investigação (revisa a premissa original do PED-108):** o schema
real de `planos` (confirmado em staging) não tem `modalidade_id` nem
`professor_id` — o formulário de Plano usa `AREAS_MODALIDADE`, uma lista fixa
de 3 áreas (`Dança`/`Funcional`/`Livre/Todos`, `webapp/src/lib/constants.js`),
não os registros de Modalidade que o estúdio cadastra. O campo "Professor
Responsável (Opcional)" que o PED-108 cita é do formulário de **Modalidade**
(`Modalidades.jsx:217`), não do Plano, e já tem fallback são ("Sem professor
fixo"). Não existe hoje nenhuma dependência técnica dura entre
Modalidade/Professor e Plano. A única dependência dura real é
**Aluno → Plano** (dropdown "Vincular Plano" vazio em `NovoAluno.jsx`
travava a matrícula) — já resolvida pela PED-114 (hint "Nenhum plano
cadastrado ainda. Criar um plano →").

O que as duas issues realmente ainda precisam é uma coisa só: dar propósito
ao painel vazio e estabelecer uma ordem de configuração sugerida (não
tecnicamente travada) — um checklist de onboarding resolve as duas ao mesmo
tempo, como o próprio PED-107 já sugeria.

## Decisões (aprovadas em brainstorming)

- **Escopo**: só o checklist gamificado. O reforço inline nos dropdowns
  vazios que o PED-108 sugere como alternativa já está implementado (PED-114)
  — nada a mexer ali.
- **4 passos**, em ordem fixa e sugerida (recomendação de bom-senso de
  negócio, não uma trava sequencial-bloqueante): Modalidade → Professor
  (opcional) → Plano → Aluno.
- O passo **Professor é opcional**: não conta na fração de conclusão nem
  bloqueia a comemoração final.
- Estado de "dispensado" (colapsado) e "concluído" (já comemorado) fica em
  `localStorage`, por estúdio — sem migração de banco.
- Estilo de gamificação: barra de progresso + confete leve (CSS, sem lib
  nova) + microcopy divertida em PT-BR. Sem sistema de pontos/XP.
- Progresso calculado ao vivo via contagens leves (`count`, sem baixar
  linhas), no cliente — não via view/RPC no banco (volume de dados trivial
  não justifica migração).

## Restrições que guiam o design

- `planos` não tem `modalidade_id`/`professor_id` (confirmado via SQL em
  staging) — a ordem do checklist é sugestão, não trava técnica.
- A única dependência técnica dura real (Aluno → Plano) já foi corrigida na
  PED-114; este design não mexe nela.
- Convenção de teste do projeto (`trial.js`, `rotaModulo.js`,
  `importAlunos.js`, e o `alunosService.test.js` da PED-121): lógica pura em
  `lib/*.js` e métodos de serviço são testados via TDD; componentes React
  ficam sem teste de render automatizado (sem `@testing-library/react` no
  projeto). Este design segue a mesma convenção.
- `dashboardService.obterTudoDashboard` já estabelece o padrão de várias
  queries `count`/`select` paralelas via `Promise.all` — os novos `contar()`
  seguem o mesmo padrão, não introduzem um novo.
- Nenhuma lib de confete/tour existe no `package.json` (sem `react-joyride`,
  `driver.js` ou similar). Adicionar uma dependência nova só para um efeito
  visual pequeno não se justifica; o confete é implementado com um punhado
  de elementos animados via CSS, sem novo pacote.
- Tokens de cor são todos `hsl(var(--token))` semânticos (`primary`,
  `success`, `muted`, etc.) — o componente novo reaproveita esses tokens, sem
  hexadecimais soltos.
- `estudioAtivo?.id ?? estudioId` (suporte a impersonação) é o padrão de
  tenant-scoping já usado em `Dashboard.jsx` — os novos hooks/queries do
  checklist seguem o mesmo `idEfetivo`.

## Design

### 1. Contagens — `contar()` em cada service

Adiciona um método `contar(estudioId)` em `modalidadeService.js`,
`professoresService.js` e `planosService.js`, cada um espelhando exatamente
`dashboardService.obterTotalAlunos` (`dashboardService.js:4-13`):
`supabase.from('<tabela>').select('id', { count: 'exact', head: true
}).eq('estudio_id', estudioId)`, retornando só o número (sem baixar linhas).
A contagem de alunos reaproveita `dashboardService.obterTotalAlunos`
existente — nada novo ali.

### 2. Lógica pura — `src/lib/onboardingChecklist.js`

- `ETAPAS_CHECKLIST`: array fixo de 4 etapas — `{ id, label, ctaLabel,
  ctaPath, opcional }` — nessa ordem: `modalidade` (`/modalidades`),
  `professor` (`/professores`, `opcional: true`), `plano` (`/planos`),
  `aluno` (`/alunos/novo`).
- `calcularProgressoChecklist({ modalidades, professores, planos, alunos })`:
  mapeia cada etapa para `concluida: contagem > 0` (contagens
  ausentes/nulas tratadas como 0), calcula `concluidasObrigatorias` /
  `totalObrigatorias` (3 — ignora a etapa opcional), `percentual =
  round(concluidasObrigatorias / totalObrigatorias * 100)`, `completo =
  concluidasObrigatorias === totalObrigatorias`.
- `calcularEstadoChecklist({ completo, dismissed, seenIncomplete, completedAck })`
  (achado durante o planejamento da implementação): decide entre
  `'expandido' | 'colapsado' | 'comemorando' | 'oculto'`. Existe pra evitar
  que um estúdio **já configurado antes deste deploy** veja a comemoração
  com confete do nada na primeira vez que abrir o painel — `seenIncomplete`
  (gravada só quando o checklist já foi mostrado incompleto ao menos uma vez
  pra esse estúdio/navegador) distingue "acabou de completar agora" de "já
  estava completo desde sempre".

### 3. Componente — `src/components/shared/OnboardingChecklist.jsx`

- Recebe `estudioId` (chave do `localStorage`) e busca as 4 contagens via um
  novo `useQuery(['onboarding-checklist', idEfetivo], ...)` que roda os
  `contar()`/`obterTotalAlunos` em paralelo (`enabled: !!idEfetivo`), mesmo
  padrão do `Dashboard.jsx`.
- 3 estados visuais, controlados por duas chaves de `localStorage`
  (`nexofy:onboarding:<estudioId>:dismissed` e `...:completed`):
  - **Expandido** (padrão, enquanto incompleto e não dispensado): card
    (`Surface`) com título + microcopy, barra de progresso ("X de 3
    concluídos"), 4 linhas de etapa (círculo check/pendente no estilo do
    `StepIndicator` de `NovoAluno.jsx`, label, `Badge` "opcional" na etapa
    Professor, CTA pra etapa não concluída).
  - **Colapsado** (dispensado manualmente, ainda incompleto): pill fixo no
    topo ("Configuração inicial: 2/3 · Continuar →"), clicável, reabre o
    expandido.
  - **Oculto** (completo e já comemorado uma vez): não renderiza nada.
- Transição incompleto → completo dispara uma comemoração única (confete CSS
  + microcopy, ex. "Configuração completa! Seu estúdio tá pronto pra voar
  🎉") com um botão "Show, obrigado!" que grava `...:completed=true` e some
  de vez ao ser clicado — sem timer automático, pra não escapar acidentalmente
  do foco do usuário nem depender de temporização em teste manual.
- Confete respeita `prefers-reduced-motion` (não anima se o usuário pediu
  menos movimento).
- Botão de dispensar (X) grava `...:dismissed=true`; o estado só volta a
  "expandido" quando o próprio usuário clica no pill — nunca reabre sozinho
  ao recarregar a página.

### 4. Integração no Dashboard

`Dashboard.jsx` renderiza `<OnboardingChecklist estudioId={idEfetivo} />` no
topo, acima dos cards de métrica atuais. Sem mudança nas queries/dados já
existentes do painel.

## Testes

- `src/lib/onboardingChecklist.test.js` — TDD genuíno para
  `calcularProgressoChecklist` (casos: zero, parcial, completo ignorando a
  etapa opcional, contagens ausentes/nulas).
- Testes dos novos `contar()` em `modalidadeService`, `professoresService` e
  `planosService`, mockando `supabase` do mesmo jeito que o
  `alunosService.test.js` da PED-121 já estabeleceu.
- `OnboardingChecklist.jsx` fica sem teste de render automatizado, por
  convenção do projeto.
- Verificação manual: `npm run dev`, logar num estúdio de teste vazio,
  percorrer os 4 passos confirmando progresso/confete/dispensar/colapsar, e
  testar com `prefers-reduced-motion` ativado.

## Fora de escopo

- Qualquer mudança em `Planos.jsx`/`Modalidades.jsx` para "exigir" ou
  vincular Modalidade/Professor a Plano — essa dependência não existe hoje, e
  criá-la seria uma mudança de modelo de dados não pedida por nenhuma das
  duas issues.
- Tour guiado com tooltips sobre a UI (biblioteca tipo `react-joyride`) —
  fora do que foi decidido (checklist simples, sem lib nova).
- Sistema de pontos/XP/níveis.
- Persistência do estado do checklist no banco (fica em `localStorage`, por
  navegador).
