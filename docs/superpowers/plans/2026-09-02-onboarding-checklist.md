# Checklist Gamificado de Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar propósito ao painel vazio de um estúdio novo (PED-107) e estabelecer a ordem de configuração inicial sugerida (PED-108) através de um checklist gamificado no topo do Dashboard.

**Architecture:** Feature 100% frontend. Progresso é calculado ao vivo a partir de 4 contagens leves (`count`, sem baixar linhas) rodadas em paralelo; a lógica de "quanto falta"/"qual estado mostrar" fica isolada em funções puras testáveis (`src/lib/onboardingChecklist.js`); o componente (`OnboardingChecklist.jsx`) só lê essas funções e cuida de `localStorage` (estado de dispensado/concluído, por estúdio). Nenhuma migração de banco, nenhuma dependência nova.

**Tech Stack:** React 19, `@tanstack/react-query`, Tailwind (tokens semânticos `hsl(var(--token))`), Vitest, `lucide-react`.

**Spec:** [docs/superpowers/specs/2026-09-02-onboarding-checklist-design.md](../specs/2026-09-02-onboarding-checklist-design.md)

## Global Constraints

- Sem migração de banco — todo estado (dispensado/concluído) fica em `localStorage`, chaveado por `estudioId`.
- Sem dependência npm nova (sem lib de confete/tour) — confete é CSS puro via Tailwind `keyframes`.
- Lógica pura em `lib/*.js` e métodos de service são testados via TDD; componentes React (`.jsx`) ficam sem teste de render automatizado — convenção já estabelecida no projeto (`trial.js`, `rotaModulo.js`, `importAlunos.js`, `alunosService.test.js` da PED-121).
- 4 etapas fixas, nesta ordem: `modalidade` → `professor` (**opcional**) → `plano` → `aluno`. Só `professor` é opcional — não conta na fração de conclusão nem bloqueia a comemoração.
- Tenant-scoping segue o padrão já usado em `Dashboard.jsx`: `idEfetivo = estudioAtivo?.id ?? estudioId`.
- Cores só via classes Tailwind semânticas já existentes (`primary`, `success`, `muted`, `warning`, `info`, etc.) — nunca hex soltos.
- Confete deve respeitar `prefers-reduced-motion` (usar o utilitário `motion-reduce:` do Tailwind, já disponível sem config extra).

---

### Task 1: `contar()` em `modalidadeService`, `professoresService` e `planosService`

**Files:**
- Modify: `webapp/src/services/modalidadeService.js:17` (insere método logo após `listar`)
- Modify: `webapp/src/services/professoresService.js:25` (insere método logo após `listar`)
- Modify: `webapp/src/services/planosService.js:61` (insere método logo após `listar`)
- Test: `webapp/src/services/modalidadeService.test.js` (novo)
- Test: `webapp/src/services/professoresService.test.js` (novo)
- Test: `webapp/src/services/planosService.test.js` (novo)

**Interfaces:**
- Produces: `modalidadeService.contar(estudioId: string): Promise<number>`, `professoresService.contar(estudioId: string): Promise<number>`, `planosService.contar(estudioId: string): Promise<number>` — cada um resolve para a contagem de linhas da tabela correspondente (`modalidades`/`professores`/`planos`) filtradas por `estudio_id`, via `count: 'exact', head: true` (sem baixar linhas). `0` quando a tabela está vazia para o estúdio. Consumidos pela Task 3 (hook de contagens do `OnboardingChecklist`).

- [ ] **Step 1: Escrever os 3 testes falhando**

Crie `webapp/src/services/modalidadeService.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const selectMock = vi.fn();
const fromMock = vi.fn(() => ({ select: (...args) => selectMock(...args) }));

vi.mock('../lib/supabase', () => ({
  supabase: { from: (...args) => fromMock(...args) },
}));

const { modalidadeService } = await import('./modalidadeService');

describe('modalidadeService.contar', () => {
  beforeEach(() => {
    fromMock.mockClear();
    selectMock.mockClear();
  });

  it('conta modalidades do estúdio via count exact/head, sem baixar linhas', async () => {
    const eqMock = vi.fn(async () => ({ count: 3, error: null }));
    selectMock.mockReturnValue({ eq: eqMock });

    const total = await modalidadeService.contar('estudio-1');

    expect(fromMock).toHaveBeenCalledWith('modalidades');
    expect(selectMock).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(eqMock).toHaveBeenCalledWith('estudio_id', 'estudio-1');
    expect(total).toBe(3);
  });

  it('retorna 0 quando count vem null (tabela vazia pro estúdio)', async () => {
    selectMock.mockReturnValue({ eq: vi.fn(async () => ({ count: null, error: null })) });

    expect(await modalidadeService.contar('estudio-1')).toBe(0);
  });
});
```

Crie `webapp/src/services/professoresService.test.js` (idêntico, trocando `modalidadeService`→`professoresService` e `'modalidades'`→`'professores'`):

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const selectMock = vi.fn();
const fromMock = vi.fn(() => ({ select: (...args) => selectMock(...args) }));

vi.mock('../lib/supabase', () => ({
  supabase: { from: (...args) => fromMock(...args) },
}));

const { professoresService } = await import('./professoresService');

describe('professoresService.contar', () => {
  beforeEach(() => {
    fromMock.mockClear();
    selectMock.mockClear();
  });

  it('conta professores do estúdio via count exact/head, sem baixar linhas', async () => {
    const eqMock = vi.fn(async () => ({ count: 2, error: null }));
    selectMock.mockReturnValue({ eq: eqMock });

    const total = await professoresService.contar('estudio-1');

    expect(fromMock).toHaveBeenCalledWith('professores');
    expect(selectMock).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(eqMock).toHaveBeenCalledWith('estudio_id', 'estudio-1');
    expect(total).toBe(2);
  });

  it('retorna 0 quando count vem null (tabela vazia pro estúdio)', async () => {
    selectMock.mockReturnValue({ eq: vi.fn(async () => ({ count: null, error: null })) });

    expect(await professoresService.contar('estudio-1')).toBe(0);
  });
});
```

Crie `webapp/src/services/planosService.test.js` (idêntico, trocando para `planosService`/`'planos'`):

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const selectMock = vi.fn();
const fromMock = vi.fn(() => ({ select: (...args) => selectMock(...args) }));

vi.mock('../lib/supabase', () => ({
  supabase: { from: (...args) => fromMock(...args) },
}));

const { planosService } = await import('./planosService');

describe('planosService.contar', () => {
  beforeEach(() => {
    fromMock.mockClear();
    selectMock.mockClear();
  });

  it('conta planos do estúdio via count exact/head, sem baixar linhas', async () => {
    const eqMock = vi.fn(async () => ({ count: 1, error: null }));
    selectMock.mockReturnValue({ eq: eqMock });

    const total = await planosService.contar('estudio-1');

    expect(fromMock).toHaveBeenCalledWith('planos');
    expect(selectMock).toHaveBeenCalledWith('id', { count: 'exact', head: true });
    expect(eqMock).toHaveBeenCalledWith('estudio_id', 'estudio-1');
    expect(total).toBe(1);
  });

  it('retorna 0 quando count vem null (tabela vazia pro estúdio)', async () => {
    selectMock.mockReturnValue({ eq: vi.fn(async () => ({ count: null, error: null })) });

    expect(await planosService.contar('estudio-1')).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar os 3 testes e confirmar que falham**

Run (dentro de `webapp/`): `npx vitest run src/services/modalidadeService.test.js src/services/professoresService.test.js src/services/planosService.test.js`
Expected: FAIL nos 3 arquivos, erro do tipo `modalidadeService.contar is not a function` (idem para os outros dois) — o método ainda não existe.

- [ ] **Step 3: Implementar os 3 métodos**

Em `webapp/src/services/modalidadeService.js`, insira logo após o fechamento do método `listar` (depois da linha `17`, antes de `async buscarPerfil`):

```js
  async contar(estudioId) {
    const { count, error } = await supabase
      .from('modalidades')
      .select('id', { count: 'exact', head: true })
      .eq('estudio_id', estudioId);
    if (error) throw error;
    return count || 0;
  },

```

Em `webapp/src/services/professoresService.js`, insira logo após o fechamento do método `listar` (depois da linha `25`, antes do comentário `// Sprint 02: estudioId obrigatório no INSERT de professores.`):

```js
  async contar(estudioId) {
    const { count, error } = await supabase
      .from('professores')
      .select('id', { count: 'exact', head: true })
      .eq('estudio_id', estudioId);
    if (error) throw error;
    return count || 0;
  },

```

Em `webapp/src/services/planosService.js`, insira logo após o fechamento do método `listar` (depois da linha `61`, antes do comentário `// Sprint 02: estudioId obrigatório no INSERT de planos.`):

```js
  async contar(estudioId) {
    const { count, error } = await supabase
      .from('planos')
      .select('id', { count: 'exact', head: true })
      .eq('estudio_id', estudioId);
    if (error) throw error;
    return count || 0;
  },

```

- [ ] **Step 4: Rodar os 3 testes e confirmar que passam**

Run: `npx vitest run src/services/modalidadeService.test.js src/services/professoresService.test.js src/services/planosService.test.js`
Expected: PASS nos 3 arquivos (2 testes cada, 6 no total).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/services/modalidadeService.js webapp/src/services/modalidadeService.test.js webapp/src/services/professoresService.js webapp/src/services/professoresService.test.js webapp/src/services/planosService.js webapp/src/services/planosService.test.js
git commit -m "feat(onboarding): adiciona contar() em modalidade/professor/plano services"
```

---

### Task 2: Lógica pura do checklist — `src/lib/onboardingChecklist.js`

**Files:**
- Create: `webapp/src/lib/onboardingChecklist.js`
- Test: `webapp/src/lib/onboardingChecklist.test.js`

**Interfaces:**
- Consumes: nada (módulo puro, sem dependências externas).
- Produces:
  - `ETAPAS_CHECKLIST: Array<{ id: string, label: string, ctaLabel: string, ctaPath: string, opcional: boolean }>` — na ordem `modalidade`, `professor` (`opcional: true`), `plano`, `aluno`.
  - `calcularProgressoChecklist(contagens: { modalidade?, professor?, plano?, aluno?: number }): { etapas: Array<Etapa & { concluida: boolean }>, concluidasObrigatorias: number, totalObrigatorias: number, percentual: number, completo: boolean }`.
  - `calcularEstadoChecklist({ completo: boolean, dismissed: boolean, seenIncomplete: boolean, completedAck: boolean }): { estado: 'expandido' | 'colapsado' | 'comemorando' | 'oculto', marcarConcluido: boolean }`.
  - Consumidos pela Task 3 (`OnboardingChecklist.jsx`).

**Por que `calcularEstadoChecklist` existe** (achado durante o planejamento, não estava no design original): um estúdio **já existente e já configurado** (com modalidade/plano/aluno cadastrados há meses) vai ter `completo: true` na primeiríssima vez que carregar o Dashboard depois deste deploy — sem essa função, ele veria a comemoração com confete do nada, como se tivesse acabado de terminar algo. A flag `seenIncomplete` (gravada em `localStorage` só quando o checklist já foi mostrado incompleto pelo menos uma vez) distingue "acabou de completar" (mostra a comemoração) de "já estava completo desde sempre" (não mostra nada, só marca concluído silenciosamente).

- [ ] **Step 1: Escrever os testes falhando**

Crie `webapp/src/lib/onboardingChecklist.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { ETAPAS_CHECKLIST, calcularProgressoChecklist, calcularEstadoChecklist } from './onboardingChecklist';

describe('ETAPAS_CHECKLIST', () => {
  it('define as 4 etapas na ordem Modalidade -> Professor -> Plano -> Aluno', () => {
    expect(ETAPAS_CHECKLIST.map(e => e.id)).toEqual(['modalidade', 'professor', 'plano', 'aluno']);
  });

  it('marca só o professor como opcional', () => {
    expect(ETAPAS_CHECKLIST.filter(e => e.opcional).map(e => e.id)).toEqual(['professor']);
  });
});

describe('calcularProgressoChecklist', () => {
  it('com todas as contagens zeradas, nada concluído e 0%', () => {
    const progresso = calcularProgressoChecklist({});
    expect(progresso.etapas.every(e => !e.concluida)).toBe(true);
    expect(progresso.concluidasObrigatorias).toBe(0);
    expect(progresso.totalObrigatorias).toBe(3);
    expect(progresso.percentual).toBe(0);
    expect(progresso.completo).toBe(false);
  });

  it('conclusão parcial calcula o percentual só sobre as etapas obrigatórias', () => {
    const progresso = calcularProgressoChecklist({ modalidade: 1, professor: 0, plano: 0, aluno: 0 });
    expect(progresso.concluidasObrigatorias).toBe(1);
    expect(progresso.percentual).toBe(33);
    expect(progresso.completo).toBe(false);
  });

  it('fica completo com as 3 etapas obrigatórias feitas, mesmo sem professor', () => {
    const progresso = calcularProgressoChecklist({ modalidade: 2, professor: 0, plano: 1, aluno: 5 });
    expect(progresso.completo).toBe(true);
    expect(progresso.percentual).toBe(100);
    expect(progresso.etapas.find(e => e.id === 'professor').concluida).toBe(false);
  });

  it('trata contagens ausentes/nulas como zero, sem lançar erro', () => {
    const progresso = calcularProgressoChecklist({ modalidade: null, plano: undefined, aluno: 0 });
    expect(progresso.completo).toBe(false);
    expect(progresso.etapas.every(e => typeof e.concluida === 'boolean')).toBe(true);
  });

  it('a etapa opcional fica concluída quando tem contagem, mesmo não contando pro percentual', () => {
    const progresso = calcularProgressoChecklist({ modalidade: 1, professor: 2, plano: 1, aluno: 1 });
    expect(progresso.etapas.find(e => e.id === 'professor').concluida).toBe(true);
    expect(progresso.percentual).toBe(100);
  });
});

describe('calcularEstadoChecklist', () => {
  it('oculta se já foi reconhecido (completedAck), não importa o resto', () => {
    expect(calcularEstadoChecklist({ completo: false, dismissed: false, seenIncomplete: true, completedAck: true }))
      .toEqual({ estado: 'oculto', marcarConcluido: false });
  });

  it('comemora quando completou e já tinha sido visto incompleto antes', () => {
    expect(calcularEstadoChecklist({ completo: true, dismissed: false, seenIncomplete: true, completedAck: false }))
      .toEqual({ estado: 'comemorando', marcarConcluido: false });
  });

  it('oculta e marca concluído em silêncio quando já estava completo sem nunca ter sido visto incompleto', () => {
    expect(calcularEstadoChecklist({ completo: true, dismissed: false, seenIncomplete: false, completedAck: false }))
      .toEqual({ estado: 'oculto', marcarConcluido: true });
  });

  it('mostra colapsado quando incompleto e dispensado', () => {
    expect(calcularEstadoChecklist({ completo: false, dismissed: true, seenIncomplete: true, completedAck: false }))
      .toEqual({ estado: 'colapsado', marcarConcluido: false });
  });

  it('mostra expandido quando incompleto e não dispensado', () => {
    expect(calcularEstadoChecklist({ completo: false, dismissed: false, seenIncomplete: false, completedAck: false }))
      .toEqual({ estado: 'expandido', marcarConcluido: false });
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/lib/onboardingChecklist.test.js`
Expected: FAIL — `Cannot find module './onboardingChecklist'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar**

Crie `webapp/src/lib/onboardingChecklist.js`:

```js
// webapp/src/lib/onboardingChecklist.js
export const ETAPAS_CHECKLIST = [
  {
    id: 'modalidade',
    label: 'Crie sua primeira modalidade',
    ctaLabel: 'Criar modalidade',
    ctaPath: '/modalidades',
    opcional: false,
  },
  {
    id: 'professor',
    label: 'Cadastre um professor',
    ctaLabel: 'Cadastrar professor',
    ctaPath: '/professores',
    opcional: true,
  },
  {
    id: 'plano',
    label: 'Monte um plano',
    ctaLabel: 'Criar plano',
    ctaPath: '/planos',
    opcional: false,
  },
  {
    id: 'aluno',
    label: 'Adicione seu primeiro aluno',
    ctaLabel: 'Cadastrar aluno',
    ctaPath: '/alunos/novo',
    opcional: false,
  },
];

export function calcularProgressoChecklist(contagens = {}) {
  const etapas = ETAPAS_CHECKLIST.map(etapa => ({
    ...etapa,
    concluida: (Number(contagens[etapa.id]) || 0) > 0,
  }));

  const obrigatorias = etapas.filter(e => !e.opcional);
  const concluidasObrigatorias = obrigatorias.filter(e => e.concluida).length;
  const totalObrigatorias = obrigatorias.length;
  const percentual = totalObrigatorias === 0
    ? 100
    : Math.round((concluidasObrigatorias / totalObrigatorias) * 100);

  return {
    etapas,
    concluidasObrigatorias,
    totalObrigatorias,
    percentual,
    completo: concluidasObrigatorias === totalObrigatorias,
  };
}

// Ver "Por que calcularEstadoChecklist existe" no plano de implementação:
// distingue "acabou de completar" (comemora) de "já estava completo desde
// sempre, nunca visto incompleto neste navegador" (marca concluído em
// silêncio, sem confete surpresa pra estúdio antigo já configurado).
export function calcularEstadoChecklist({ completo, dismissed, seenIncomplete, completedAck }) {
  if (completedAck) {
    return { estado: 'oculto', marcarConcluido: false };
  }
  if (completo) {
    return seenIncomplete
      ? { estado: 'comemorando', marcarConcluido: false }
      : { estado: 'oculto', marcarConcluido: true };
  }
  return { estado: dismissed ? 'colapsado' : 'expandido', marcarConcluido: false };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/lib/onboardingChecklist.test.js`
Expected: PASS (11 testes).

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/onboardingChecklist.js webapp/src/lib/onboardingChecklist.test.js
git commit -m "feat(onboarding): logica pura do checklist (progresso + estado visual)"
```

---

### Task 3: Componente `OnboardingChecklist.jsx` + keyframe de confete

**Files:**
- Modify: `webapp/tailwind.config.js:143-149` (novo keyframe/animação `confetti-fall`)
- Create: `webapp/src/components/shared/OnboardingChecklist.jsx`

**Interfaces:**
- Consumes: `modalidadeService.contar`, `professoresService.contar`, `planosService.contar` (Task 1); `dashboardService.obterTotalAlunos` (já existe, `webapp/src/services/dashboardService.js:4`); `calcularProgressoChecklist`, `calcularEstadoChecklist` (Task 2); `Surface` (`webapp/src/components/ui/Surface.jsx`), `Badge` (`webapp/src/components/ui/Badge.jsx`), `Button` (`webapp/src/components/ui/Button.jsx`).
- Produces: `export default function OnboardingChecklist({ estudioId: string })` — componente React, sem retorno de valor além do JSX. Consumido pela Task 4 (`Dashboard.jsx`).

Sem teste automatizado neste componente (convenção do projeto — ver Global Constraints). Verificação é manual, feita na Task 5.

- [ ] **Step 1: Adicionar o keyframe de confete no Tailwind config**

Em `webapp/tailwind.config.js`, dentro do bloco `keyframes` (depois de `'slide-in-left'`, linha `143`):

```js
        'confetti-fall': {
          '0%':   { transform: 'translateY(-10px) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(120px) rotate(360deg)', opacity: '0' },
        },
```

E dentro do bloco `animation` (depois de `'slide-in-left'`, linha `148`):

```js
      'confetti-fall':   'confetti-fall 900ms ease-in forwards',
```

- [ ] **Step 2: Criar o componente**

Crie `webapp/src/components/shared/OnboardingChecklist.jsx`:

```jsx
// webapp/src/components/shared/OnboardingChecklist.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckCircle2, Circle, PartyPopper, X, ChevronRight } from 'lucide-react';
import Surface from '../ui/Surface';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { modalidadeService } from '../../services/modalidadeService';
import { professoresService } from '../../services/professoresService';
import { planosService } from '../../services/planosService';
import { dashboardService } from '../../services/dashboardService';
import { calcularProgressoChecklist, calcularEstadoChecklist } from '../../lib/onboardingChecklist';

const chaveDismissed      = (estudioId) => `nexofy:onboarding:${estudioId}:dismissed`;
const chaveCompleted      = (estudioId) => `nexofy:onboarding:${estudioId}:completed`;
const chaveSeenIncomplete = (estudioId) => `nexofy:onboarding:${estudioId}:seen-incomplete`;

// localStorage pode lançar em modo privado/cookies bloqueados — degrada
// graciosamente (o checklist só volta a aparecer no próximo carregamento).
function lerFlag(chave) {
  try {
    return localStorage.getItem(chave) === 'true';
  } catch {
    return false;
  }
}
function gravarFlag(chave) {
  try {
    localStorage.setItem(chave, 'true');
  } catch {
    // ignorado de propósito — ver comentário acima.
  }
}

function Confetti() {
  const pecas = useMemo(
    () => Array.from({ length: 18 }, (_, i) => ({
      id: i,
      esquerda: Math.round(Math.random() * 100),
      atraso: Math.round(Math.random() * 300),
      cor: ['bg-primary', 'bg-success', 'bg-warning', 'bg-info'][i % 4],
    })),
    []
  );

  return (
    <div
      className="absolute inset-x-0 top-0 h-24 overflow-hidden pointer-events-none motion-reduce:hidden"
      aria-hidden="true"
    >
      {pecas.map(p => (
        <span
          key={p.id}
          className={`absolute top-0 w-1.5 h-1.5 rounded-sm ${p.cor} animate-confetti-fall`}
          style={{ left: `${p.esquerda}%`, animationDelay: `${p.atraso}ms` }}
        />
      ))}
    </div>
  );
}

export default function OnboardingChecklist({ estudioId }) {
  const [dismissed, setDismissed] = useState(() => lerFlag(chaveDismissed(estudioId)));
  const [completedAck, setCompletedAck] = useState(() => lerFlag(chaveCompleted(estudioId)));
  const [seenIncomplete, setSeenIncomplete] = useState(() => lerFlag(chaveSeenIncomplete(estudioId)));

  const { data: contagens, isLoading } = useQuery({
    queryKey: ['onboarding-checklist', estudioId],
    queryFn: async () => {
      const [modalidade, professor, plano, aluno] = await Promise.all([
        modalidadeService.contar(estudioId),
        professoresService.contar(estudioId),
        planosService.contar(estudioId),
        dashboardService.obterTotalAlunos(estudioId),
      ]);
      return { modalidade, professor, plano, aluno };
    },
    enabled: !!estudioId,
    staleTime: 1000 * 60 * 5,
  });

  const progresso = useMemo(() => calcularProgressoChecklist(contagens || {}), [contagens]);

  const { estado, marcarConcluido } = useMemo(
    () => calcularEstadoChecklist({
      completo: progresso.completo,
      dismissed,
      seenIncomplete,
      completedAck,
    }),
    [progresso.completo, dismissed, seenIncomplete, completedAck]
  );

  useEffect(() => {
    if (isLoading) return;
    if (marcarConcluido) {
      gravarFlag(chaveCompleted(estudioId));
      setCompletedAck(true);
      return;
    }
    if ((estado === 'expandido' || estado === 'colapsado') && !seenIncomplete) {
      gravarFlag(chaveSeenIncomplete(estudioId));
      setSeenIncomplete(true);
    }
  }, [isLoading, marcarConcluido, estado, seenIncomplete, estudioId]);

  if (isLoading || !estudioId || estado === 'oculto') return null;

  if (estado === 'comemorando') {
    return (
      <Surface variant="elevated" padding="lg" className="relative overflow-hidden border-success/40">
        <Confetti />
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-success-soft flex items-center justify-center shrink-0">
              <PartyPopper size={22} className="text-success" />
            </div>
            <div>
              <p className="font-black text-foreground">Configuração completa!</p>
              <p className="text-sm text-muted-foreground">Seu estúdio tá pronto pra voar. 🚀</p>
            </div>
          </div>
          <Button
            variant="success"
            size="sm"
            onClick={() => {
              gravarFlag(chaveCompleted(estudioId));
              setCompletedAck(true);
            }}
          >
            Show, obrigado!
          </Button>
        </div>
      </Surface>
    );
  }

  if (estado === 'colapsado') {
    return (
      <button
        type="button"
        onClick={() => setDismissed(false)}
        className="inline-flex items-center gap-2 text-xs font-bold text-muted-foreground
          bg-muted hover:bg-accent transition-colors rounded-full px-3 py-1.5"
      >
        Configuração inicial: {progresso.concluidasObrigatorias}/{progresso.totalObrigatorias}
        <span className="text-primary">Continuar →</span>
      </button>
    );
  }

  return (
    <Surface variant="card" padding="lg" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-black text-foreground">Vamos deixar seu estúdio pronto! 🚀</p>
          <p className="text-sm text-muted-foreground">
            {progresso.concluidasObrigatorias} de {progresso.totalObrigatorias} concluídos
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            gravarFlag(chaveDismissed(estudioId));
            setDismissed(true);
          }}
          aria-label="Dispensar checklist"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all duration-500"
          style={{ width: `${progresso.percentual}%` }}
        />
      </div>

      <ul className="space-y-2">
        {progresso.etapas.map(etapa => (
          <li key={etapa.id} className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              {etapa.concluida
                ? <CheckCircle2 size={18} className="text-success shrink-0" />
                : <Circle size={18} className="text-muted-foreground shrink-0" />}
              <span className={etapa.concluida ? 'text-muted-foreground line-through' : 'text-foreground font-medium'}>
                {etapa.label}
              </span>
              {etapa.opcional && <Badge tone="neutral" variant="soft">opcional</Badge>}
            </div>
            {!etapa.concluida && (
              <Link to={etapa.ctaPath}>
                <Button variant="outline" size="sm" rightIcon={<ChevronRight size={14} />}>
                  {etapa.ctaLabel}
                </Button>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Surface>
  );
}
```

- [ ] **Step 3: Lint**

Run: `npx eslint src/components/shared/OnboardingChecklist.jsx`
Expected: exit 0, sem erros.

- [ ] **Step 4: Commit**

```bash
git add webapp/tailwind.config.js webapp/src/components/shared/OnboardingChecklist.jsx
git commit -m "feat(onboarding): componente OnboardingChecklist com confete via CSS"
```

---

### Task 4: Integração no Dashboard

**Files:**
- Modify: `webapp/src/pages/Dashboard.jsx:15` (import), `webapp/src/pages/Dashboard.jsx:226-234` (render)

**Interfaces:**
- Consumes: `OnboardingChecklist` (Task 3), `idEfetivo` (já existe em `Dashboard.jsx:121`).
- Produces: nada consumido por outra task — ponto de integração final.

- [ ] **Step 1: Importar o componente**

Em `webapp/src/pages/Dashboard.jsx`, logo após a linha `15` (`import Button from '../components/ui/Button';`), adicione:

```js
import OnboardingChecklist from '../components/shared/OnboardingChecklist';
```

- [ ] **Step 2: Renderizar no topo do painel**

Troque (linhas `226`–`234`):

```jsx
        <Link to="/resultado-financeiro">
          <Button variant="outline" size="sm" rightIcon={<ChevronRight size={16} />}>
            Ver DRE do mês
          </Button>
        </Link>
      </div>

      {/* Métricas rápidas do mês */}
```

por:

```jsx
        <Link to="/resultado-financeiro">
          <Button variant="outline" size="sm" rightIcon={<ChevronRight size={16} />}>
            Ver DRE do mês
          </Button>
        </Link>
      </div>

      <OnboardingChecklist estudioId={idEfetivo} key={idEfetivo} />

      {/* Métricas rápidas do mês */}
```

(`key={idEfetivo}` força o componente a remontar — e portanto reler o `localStorage` do zero — quando o admin troca de estúdio via impersonation, em vez de arrastar o estado de dispensado/concluído de um estúdio pro outro.)

- [ ] **Step 3: Lint**

Run: `npx eslint src/pages/Dashboard.jsx`
Expected: exit 0, sem erros.

- [ ] **Step 4: Commit**

```bash
git add webapp/src/pages/Dashboard.jsx
git commit -m "feat(onboarding): integra OnboardingChecklist no topo do Dashboard"
```

---

### Task 5: Verificação final

**Files:** nenhum (só verificação — sem mudança de código).

- [ ] **Step 1: Suíte de testes completa**

Run (em `webapp/`): `npx vitest run`
Expected: todos os arquivos passam (os 132 já existentes da PED-121 + os novos desta feature).

- [ ] **Step 2: Lint completo**

Run: `npx eslint .`
Expected: exit 0.

- [ ] **Step 3: Build de produção**

Run: `npm run build`
Expected: exit 0, sem erros/warnings novos além dos já existentes (aviso de `browserslist` desatualizado é pré-existente, ignorar).

- [ ] **Step 4: Verificação manual no navegador — estúdio novo (vazio)**

Com `npm run dev` rodando, logar num estúdio de teste sem nenhuma modalidade/professor/plano/aluno cadastrado e no Dashboard confirmar:
- Checklist expandido aparece no topo, 0 de 3 concluídos, barra de progresso vazia.
- Cada etapa não concluída tem um botão CTA que leva pra tela certa (`/modalidades`, `/professores`, `/planos`, `/alunos/novo`).
- Etapa "Cadastre um professor" mostra o badge "opcional".
- Clicar no X dispensa o card e mostra o pill colapsado ("Configuração inicial: 0/3 · Continuar →"); recarregar a página mantém o pill colapsado (não volta a expandir sozinho).
- Clicar no pill reabre o card expandido.
- Cadastrar uma Modalidade, um Plano e um Aluno (nessa ordem ou não) e voltar ao Dashboard: cada etapa concluída aparece riscada com ✓; ao completar a 3ª etapa obrigatória, aparece o card de comemoração com confete.
- Clicar em "Show, obrigado!" fecha a comemoração; recarregar a página confirma que o checklist não aparece mais (nem expandido, nem colapsado, nem a comemoração de novo).

- [ ] **Step 5: Verificação manual — estúdio já configurado (caso do achado da Task 2)**

Logar num estúdio de teste que já tenha modalidade, plano e aluno cadastrados **antes** desta feature existir (ou simular limpando o `localStorage` desse estúdio e recarregando): confirmar que **não aparece confete nem card nenhum** — o painel renderiza normal, sem surpresa.

- [ ] **Step 6: Verificação manual — `prefers-reduced-motion`**

No DevTools do navegador, emular `prefers-reduced-motion: reduce` (Rendering tab → Emulate CSS media feature), repetir o fluxo de completar o checklist e confirmar que o card de comemoração aparece **sem** as peças de confete animadas (o texto e o botão continuam normais).

- [ ] **Step 7: Commit final (se algo precisar de ajuste fino após a verificação manual)**

Se a verificação manual não pedir nenhum ajuste, esta task não gera commit — as Tasks 1-4 já cobrem todo o código.
