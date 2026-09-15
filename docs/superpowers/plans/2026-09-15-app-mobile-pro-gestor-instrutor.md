# App Mobile PRO — Gestor & Instrutor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar `mobile-pro/`, um segundo app Expo dedicado a gestor (`admin`) e instrutor (`professor`), cobrindo Dashboard, Agenda + chamada, Alunos e Financeiro/Comissões — sem nenhuma mudança de backend.

**Architecture:** Mesma stack e convenções do `mobile/` (Área do Aluno): Expo managed + React Navigation (bottom tabs) + TanStack Query + NativeWind + Zustand + Supabase JS direto, sem API própria. Um único app, papel resolvido no login via `estudio_membros`, telas adaptadas por papel através de um `SessaoContext` compartilhado. Todas as queries reaproveitam tabelas/RPCs já usadas pelo webapp (`presencas`, `agenda`, `agenda_fixa`, `alunos`, `mensalidades`, `repasses_lancamentos`, `estudio_membros`, `professores`, `estudios`), protegidas pela mesma RLS.

**Tech Stack:** Expo ~52, React 18.3, React Native 0.76, TypeScript 5.6 (strict), React Navigation 7 (bottom-tabs + native-stack), TanStack Query 5, NativeWind 4 / Tailwind 3, Zustand 5, @supabase/supabase-js ^2.95, Jest 29 (testes de funções puras apenas).

**Spec:** [`docs/superpowers/specs/2026-09-15-app-mobile-pro-gestor-instrutor-design.md`](../specs/2026-09-15-app-mobile-pro-gestor-instrutor-design.md)

## Global Constraints

- Novo projeto em `mobile-pro/`, irmão de `mobile/` e `webapp/` na raiz do repo — não editar `mobile/` (exceto para ler como referência).
- **Nenhuma mudança de schema/RPC.** Toda query usa tabelas/funções que já existem hoje (confirmado ao ler `webapp/src/services/presencaService.js`, `dashboardService.js`, `webapp/src/hooks/useRepasses.js`, `webapp/src/services/repasseService.js`, `webapp/src/pages/Professor/ProfessorAlunos.jsx`, `webapp/src/hooks/useAuth.jsx`).
- Login: e-mail + senha via Supabase Auth. Papel resolvido via `estudio_membros.role` — **somente `admin` e `professor` são suportados**; qualquer outro caso (papel `aluno`/`super_admin`, ou nenhum vínculo) leva à tela `PapelNaoSuportadoScreen`.
- `professorId` é sempre `number | null` (id de `professores`, não o `auth_id`). `estudioId` é sempre `string | null` (uuid).
- Path alias `@/*` → `src/*` (igual ao `mobile/`), configurado em `tsconfig.json` **e** em `jest.config.js` (`moduleNameMapper`).
- Testes automatizados (Jest) só para as funções puras de `src/features/chamada.ts` — mesma limitação de infraestrutura do `mobile/` (zero testes lá hoje). As telas são verificadas manualmente em device/simulador na Tarefa 14, não por teste automatizado — não inventar testes de UI que o resto do repo não usa.
- Todo texto de UI e nome de função em português, seguindo o padrão do `mobile/` e do `webapp/`.
- Componentes de UI (`Card`, `Button`, `Badge`, `Display`, `Body`, `LoadingState`, `ErrorState`, `EmptyState`, `Skeleton`, `CardSkeleton`) são copiados 1:1 de `mobile/src/components/ui.tsx` — não redesenhar.

---

## Task 1: Scaffold do projeto `mobile-pro/`

**Files:**
- Create: `mobile-pro/package.json`
- Create: `mobile-pro/app.json`
- Create: `mobile-pro/babel.config.js`
- Create: `mobile-pro/metro.config.js`
- Create: `mobile-pro/tailwind.config.js`
- Create: `mobile-pro/tsconfig.json`
- Create: `mobile-pro/global.css`
- Create: `mobile-pro/global.d.ts`
- Create: `mobile-pro/nativewind-env.d.ts`
- Create: `mobile-pro/.gitignore`
- Create: `mobile-pro/.env.example`
- Create: `mobile-pro/jest.config.js`
- Create: `mobile-pro/src/lib/supabase.ts`
- Create: `mobile-pro/src/lib/queryClient.ts`
- Create: `mobile-pro/src/lib/typography.ts`
- Create: `mobile-pro/src/lib/theme.ts`
- Create: `mobile-pro/src/types/index.ts`
- Create: `mobile-pro/src/components/ui.tsx`
- Create: `mobile-pro/App.tsx` (placeholder — substituído na Tarefa 8)

**Interfaces:**
- Produces: `supabase` client (`@/lib/supabase`), `queryClient` (`@/lib/queryClient`), `fonts`/`space`/`radius` (`@/lib/typography`), `useThemeStore`/`ThemeTokens` (`@/lib/theme`), tipos `Estudio`/`Aluno`/`Mensalidade`/`Professor` (`@/types`), componentes `Display`/`Body`/`Card`/`Badge`/`Button`/`Skeleton`/`CardSkeleton`/`LoadingState`/`ErrorState`/`EmptyState` (`@/components/ui`).

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "nexofy-mobile-pro",
  "version": "0.1.0",
  "private": true,
  "main": "expo/AppEntry",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "lint": "eslint .",
    "test": "jest"
  },
  "dependencies": {
    "@expo-google-fonts/inter": "^0.2.3",
    "@expo-google-fonts/plus-jakarta-sans": "^0.2.3",
    "@expo/metro-runtime": "~4.0.1",
    "expo-font": "~13.0.1",
    "expo-splash-screen": "~0.29.13",
    "@react-native-async-storage/async-storage": "1.23.1",
    "@react-navigation/bottom-tabs": "^7.0.0",
    "@react-navigation/native": "^7.0.0",
    "@react-navigation/native-stack": "^7.0.0",
    "@supabase/supabase-js": "^2.95.3",
    "@tanstack/react-query": "^5.101.0",
    "date-fns": "^4.1.0",
    "expo": "~52.0.0",
    "expo-asset": "~11.0.0",
    "expo-status-bar": "~2.0.0",
    "expo-web-browser": "~14.0.0",
    "lucide-react-native": "^0.563.0",
    "nativewind": "~4.0.1",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "react-native": "0.76.9",
    "react-native-css-interop": "~0.0.1",
    "react-native-reanimated": "~3.16.1",
    "react-native-safe-area-context": "4.12.0",
    "react-native-screens": "~4.4.0",
    "react-native-svg": "15.8.0",
    "react-native-web": "~0.19.13",
    "zustand": "^5.0.2"
  },
  "devDependencies": {
    "@babel/core": "^7.25.2",
    "@types/jest": "^29.5.12",
    "@types/react": "~18.3.12",
    "babel-jest": "^29.7.0",
    "jest": "^29.7.0",
    "metro": "^0.81.0",
    "metro-config": "^0.81.0",
    "metro-core": "^0.81.0",
    "metro-runtime": "^0.81.0",
    "tailwindcss": "^3.4.14",
    "typescript": "^5.6.3"
  }
}
```

Nota: sem `expo-image-picker`, `expo-secure-store`, `react-native-webview`, `react-hook-form`, `yup` — nenhum dos dois deferidos do V1 (upload de avatar, WebView de pagamento, formulários grandes) precisa deles. Adicionar só quando entrarem em escopo.

- [ ] **Step 2: Criar `app.json`**

```json
{
  "expo": {
    "name": "Nexofy PRO",
    "slug": "nexofy-mobile-pro",
    "scheme": "nexofypro",
    "version": "0.1.0",
    "orientation": "portrait",
    "userInterfaceStyle": "automatic",
    "backgroundColor": "#FDF8F5",
    "newArchEnabled": true,
    "ios": { "supportsTablet": false, "bundleIdentifier": "com.nexofy.mobilepro" },
    "android": {
      "package": "com.nexofy.mobilepro"
    },
    "plugins": [],
    "extra": {
      "eas": { "projectId": "REPLACE_WITH_EAS_PROJECT_ID" }
    }
  }
}
```

- [ ] **Step 3: Copiar `babel.config.js`, `metro.config.js`, `tailwind.config.js`, `tsconfig.json`, `global.css`, `global.d.ts`, `nativewind-env.d.ts`, `.gitignore` de `mobile/` (conteúdo idêntico)**

`mobile-pro/babel.config.js`:
```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // react-native-reanimated exige que o plugin dele seja SEMPRE o último da lista.
    plugins: ['react-native-reanimated/plugin'],
  };
};
```

`mobile-pro/metro.config.js`:
```js
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
```

`mobile-pro/tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        surface: '#FDF8F5',
      },
    },
  },
  plugins: [],
};
```

`mobile-pro/tsconfig.json`:
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@/*": [
        "src/*"
      ]
    }
  },
  "include": [
    "src",
    "App.tsx",
    "global.d.ts",
    "nativewind-env.d.ts"
  ]
}
```

`mobile-pro/global.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`mobile-pro/global.d.ts`:
```ts
/// <reference types="nativewind/types" />
```

`mobile-pro/nativewind-env.d.ts`:
```ts
/// <reference types="nativewind/types" />

// NOTE: This file should not be edited and should be committed with your source code. It is generated by NativeWind.
```

`mobile-pro/.gitignore`:
```
node_modules/
.expo/
dist/
web-build/
*.log
.env
```

- [ ] **Step 4: Criar `.env.example` e `jest.config.js`**

`mobile-pro/.env.example`:
```
EXPO_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key-publica
```

`mobile-pro/jest.config.js`:
```js
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/.expo/'],
};
```

- [ ] **Step 5: Criar `src/lib/supabase.ts` e `src/lib/queryClient.ts` (idênticos ao `mobile/`)**

`mobile-pro/src/lib/supabase.ts`:
```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Mesmo padrão do webapp (webapp/src/lib/supabase.js): client único, sessão
// persistida — em RN usamos AsyncStorage em vez de localStorage.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY são obrigatórias (ver .env.example).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
```

`mobile-pro/src/lib/queryClient.ts`:
```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});
```

- [ ] **Step 6: Criar `src/lib/typography.ts` (idêntico ao `mobile/`)**

```ts
export const fonts = {
  displayBlack: 'PlusJakartaSans_800ExtraBold',
  displayBold: 'PlusJakartaSans_700Bold',
  displaySemibold: 'PlusJakartaSans_600SemiBold',
  bodyRegular: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemibold: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  md: 16,
  lg: 20,
  xl: 24,
} as const;
```

- [ ] **Step 7: Criar `src/lib/theme.ts` (port de `mobile/src/lib/theme.ts`, tipo `Estudio` local em vez de importar de `@/types` do aluno)**

```ts
import { create } from 'zustand';

// Port de webapp/src/lib/corMarca.js — mesma heurística de sombreado/contraste,
// adaptada pra gerar um objeto de tokens (RN não tem CSS custom properties).
// Duplicado intencionalmente do mobile/src/lib/theme.ts — mesma decisão já
// tomada lá (sem monorepo/workspace entre os dois apps mobile).
const REGEX_HEX_COLOR = /^#([0-9A-Fa-f]{6})$/;

function normalizarHex(hex?: string | null): string | null {
  if (typeof hex !== 'string') return null;
  const valor = hex.trim();
  return REGEX_HEX_COLOR.test(valor) ? valor : null;
}

function hexParaRgb(hex: string) {
  const inteiro = parseInt(hex.slice(1), 16);
  return { r: (inteiro >> 16) & 255, g: (inteiro >> 8) & 255, b: inteiro & 255 };
}

function rgbParaHex({ r, g, b }: { r: number; g: number; b: number }) {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function sombrear(hex: string, percentual: number): string {
  const { r, g, b } = hexParaRgb(hex);
  const alvo = percentual > 0 ? 255 : 0;
  const p = Math.abs(percentual);
  return rgbParaHex({ r: r + (alvo - r) * p, g: g + (alvo - g) * p, b: b + (alvo - b) * p });
}

function luminanciaRelativa(hex: string): number {
  const { r, g, b } = hexParaRgb(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function corDeTextoContraste(hex: string): string {
  return luminanciaRelativa(hex) > 0.6 ? '#1f2937' : '#ffffff';
}

export interface ThemeTokens {
  pri: string;
  priDark: string;
  priLight: string;
  priText: string;
  sec: string;
  secDark: string;
  secLight: string;
  secText: string;
  logoUrl: string | null;
}

const NEXOFY_PRI = '#4F46E5';
const NEXOFY_SEC = '#0A0A1A';
const COR_PLACEHOLDER_BANCO = '#FFD600';

const TOKENS_PADRAO: ThemeTokens = {
  pri: NEXOFY_PRI,
  priDark: sombrear(NEXOFY_PRI, -0.18),
  priLight: sombrear(NEXOFY_PRI, 0.35),
  priText: corDeTextoContraste(NEXOFY_PRI),
  sec: NEXOFY_SEC,
  secDark: sombrear(NEXOFY_SEC, -0.18),
  secLight: sombrear(NEXOFY_SEC, 0.35),
  secText: corDeTextoContraste(NEXOFY_SEC),
  logoUrl: null,
};

export interface EstudioParaTema {
  cor_primaria: string;
  cor_secundaria: string | null;
  logo_url: string | null;
}

interface ThemeStore {
  tokens: ThemeTokens;
  aplicarTemaDoEstudio: (estudio: EstudioParaTema) => void;
  resetarTema: () => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  tokens: TOKENS_PADRAO,
  aplicarTemaDoEstudio: (estudio) => {
    const corPrimariaConfigurada =
      estudio.cor_primaria && estudio.cor_primaria !== COR_PLACEHOLDER_BANCO ? estudio.cor_primaria : null;

    const pri = normalizarHex(corPrimariaConfigurada) ?? TOKENS_PADRAO.pri;
    const sec = normalizarHex(estudio.cor_secundaria) ?? TOKENS_PADRAO.sec;
    set({
      tokens: {
        pri,
        priDark: sombrear(pri, -0.18),
        priLight: sombrear(pri, 0.35),
        priText: corDeTextoContraste(pri),
        sec,
        secDark: sombrear(sec, -0.18),
        secLight: sombrear(sec, 0.35),
        secText: corDeTextoContraste(sec),
        logoUrl: estudio.logo_url ?? null,
      },
    });
  },
  resetarTema: () => set({ tokens: TOKENS_PADRAO }),
}));
```

- [ ] **Step 8: Criar `src/types/index.ts` — só os tipos que o app PRO usa (espelha o schema real, ver `supabase/migrations/00000000000000_baseline_current_schema.sql`)**

```ts
export interface Estudio {
  id: string;
  nome: string;
  logo_url: string | null;
  cor_primaria: string;
  cor_secundaria: string | null;
  modulos_ativos: string[];
}

export interface Professor {
  id: number;
  auth_id: string;
  nome: string;
}
```

- [ ] **Step 9: Criar `src/components/ui.tsx` (idêntico ao `mobile/src/components/ui.tsx`, 166 linhas — `Display`, `Body`, `Card`, `Badge`, `Button`, `Skeleton`, `CardSkeleton`, `LoadingState`, `ErrorState`, `EmptyState`)**

Copiar o conteúdo integral de `mobile/src/components/ui.tsx` para `mobile-pro/src/components/ui.tsx`, sem alterações — é um módulo "burro" (sem Supabase, sem lógica de negócio), reaproveitável tal como está.

- [ ] **Step 10: Criar `App.tsx` placeholder (substituído na Tarefa 8)**

```tsx
import './global.css';
import React from 'react';
import { Text, View } from 'react-native';

export default function App() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text>Nexofy PRO — em construção</Text>
    </View>
  );
}
```

- [ ] **Step 11: Instalar dependências e validar o scaffold**

Run: `cd mobile-pro && npm install && npx tsc --noEmit`
Expected: instala sem erro; `tsc --noEmit` passa sem erros de tipo (só os arquivos criados até aqui entram na checagem).

- [ ] **Step 12: Commit**

```bash
git add -f mobile-pro/
git commit -m "feat(mobile-pro): scaffold do app Expo dedicado a gestor/instrutor"
```

---

## Task 2: `src/features/chamada.ts` — helpers puros de chamada (TDD)

**Files:**
- Create: `mobile-pro/src/features/chamada.ts`
- Test: `mobile-pro/src/features/chamada.test.ts`

**Interfaces:**
- Consumes: nada (módulo folha, zero imports externos — importante pra rodar em `testEnvironment: 'node'` sem carregar React Native/AsyncStorage).
- Produces: `AlunoChamada` (tipo), `EstadoChamada` (tipo `'pendente' | 'presente' | 'falta'`), `deriveEstadoChamada(aluno: AlunoChamada): EstadoChamada`, `PayloadPresenca` (tipo), `montarPayloadPresenca(aluno: AlunoChamada, aulaId: number, dataAula: string): PayloadPresenca`. Consumidos pela Tarefa 4 (`features/agenda.ts`) e pela Tarefa 10 (`screens/Agenda/ChamadaScreen.tsx`).

- [ ] **Step 1: Escrever o teste (vai falhar — `chamada.ts` ainda não existe)**

```ts
// mobile-pro/src/features/chamada.test.ts
import { deriveEstadoChamada, montarPayloadPresenca, type AlunoChamada } from './chamada';

function alunoBase(overrides: Partial<AlunoChamada> = {}): AlunoChamada {
  return {
    id_relacao: 1,
    aluno_id: 10,
    lead_id: null,
    nome: 'Aluno Teste',
    tipo: 'fixo',
    status: 'presente',
    registroExiste: false,
    ...overrides,
  };
}

describe('deriveEstadoChamada', () => {
  it('retorna "falta" para falta_justificada', () => {
    expect(deriveEstadoChamada(alunoBase({ status: 'falta_justificada', registroExiste: true }))).toBe('falta');
  });

  it('retorna "falta" para falta_nao_avisada', () => {
    expect(deriveEstadoChamada(alunoBase({ status: 'falta_nao_avisada', registroExiste: true }))).toBe('falta');
  });

  it('retorna "presente" só quando o registro existe de fato', () => {
    expect(deriveEstadoChamada(alunoBase({ status: 'presente', registroExiste: true }))).toBe('presente');
  });

  it('retorna "pendente" para um fixo sem registro do dia, mesmo com status implícito "presente"', () => {
    // Caso crítico: presencaService.listarChamadaCompleta usa status:'presente'
    // por convenção pra um fixo sem linha na tabela — isso NÃO é confirmação
    // real de presença. Sem essa distinção, todo fixo apareceria como já
    // confirmado antes do instrutor tocar em qualquer coisa.
    expect(deriveEstadoChamada(alunoBase({ status: 'presente', registroExiste: false }))).toBe('pendente');
  });

  it('retorna "pendente" para um avulso agendado', () => {
    expect(deriveEstadoChamada(alunoBase({ tipo: 'avulso', status: 'agendado', registroExiste: true }))).toBe('pendente');
  });
});

describe('montarPayloadPresenca', () => {
  it('monta payload sem presencaId quando o registro ainda não existe (fixo)', () => {
    const aluno = alunoBase({ tipo: 'fixo', registroExiste: false, id_relacao: 99 });
    expect(montarPayloadPresenca(aluno, 5, '2026-09-20')).toEqual({
      presencaId: null,
      alunoId: 10,
      aulaId: 5,
      dataAula: '2026-09-20',
      origem: 'fixo',
    });
  });

  it('monta payload com presencaId quando o registro já existe (avulso)', () => {
    const aluno = alunoBase({ tipo: 'avulso', registroExiste: true, id_relacao: 42 });
    expect(montarPayloadPresenca(aluno, 5, '2026-09-20')).toEqual({
      presencaId: 42,
      alunoId: 10,
      aulaId: 5,
      dataAula: '2026-09-20',
      origem: 'avulso',
    });
  });

  it('usa origem "avulso" para tipo "experimental" (lead)', () => {
    const aluno = alunoBase({ tipo: 'experimental', registroExiste: true, id_relacao: 7, aluno_id: null, lead_id: 3 });
    expect(montarPayloadPresenca(aluno, 5, '2026-09-20').origem).toBe('avulso');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd mobile-pro && npx jest src/features/chamada.test.ts`
Expected: FAIL — `Cannot find module './chamada' from 'src/features/chamada.test.ts'`

- [ ] **Step 3: Implementar `chamada.ts` — port de `webapp/src/pages/Agenda/hooks/useListaPresenca.js` (`montarPayloadPresenca`/`deriveEstadoChamada`) e `webapp/src/services/presencaService.js` (`listarChamadaCompleta`)**

```ts
// mobile-pro/src/features/chamada.ts
// Port de webapp/src/pages/Agenda/hooks/useListaPresenca.js — só as funções
// puras (sem Supabase). Módulo folha: zero imports externos de propósito,
// pra poder ser testado em testEnvironment:'node' sem carregar React Native.

export type TipoAlunoChamada = 'fixo' | 'avulso' | 'experimental';
export type StatusPresenca = 'agendado' | 'presente' | 'falta_justificada' | 'falta_nao_avisada';
export type EstadoChamada = 'pendente' | 'presente' | 'falta';

export interface AlunoChamada {
  id_relacao: number;
  aluno_id: number | null;
  lead_id: number | null;
  nome: string;
  tipo: TipoAlunoChamada;
  status: StatusPresenca;
  /** Diz se já existe uma linha em `presencas` pra esse aluno/aula/data — ver deriveEstadoChamada. */
  registroExiste: boolean;
}

// Deriva o estado visual da chamada a partir da linha do aluno. `status`
// sozinho não basta: presencaService.listarChamadaCompleta retorna
// status:'presente' por convenção pra um fixo sem registro do dia, o que
// NÃO é uma confirmação real de presença — só `registroExiste` diz se a
// linha existe de fato.
export function deriveEstadoChamada(aluno: AlunoChamada): EstadoChamada {
  if (aluno.status === 'falta_justificada' || aluno.status === 'falta_nao_avisada') {
    return 'falta';
  }
  if (aluno.registroExiste && aluno.status === 'presente') {
    return 'presente';
  }
  return 'pendente';
}

export interface PayloadPresenca {
  presencaId: number | null;
  alunoId: number | null;
  aulaId: number;
  dataAula: string;
  origem: 'fixo' | 'avulso';
}

// Monta o payload de mutação de presença (check-in ou falta) a partir da
// linha exibida na chamada.
export function montarPayloadPresenca(aluno: AlunoChamada, aulaId: number, dataAula: string): PayloadPresenca {
  return {
    presencaId: aluno.registroExiste ? aluno.id_relacao : null,
    alunoId: aluno.aluno_id,
    aulaId,
    dataAula,
    origem: aluno.tipo === 'fixo' ? 'fixo' : 'avulso',
  };
}
```

- [ ] **Step 4: Rodar o teste de novo e confirmar que passa**

Run: `cd mobile-pro && npx jest src/features/chamada.test.ts`
Expected: PASS — 8 testes.

- [ ] **Step 5: Commit**

```bash
git add mobile-pro/src/features/chamada.ts mobile-pro/src/features/chamada.test.ts
git commit -m "feat(mobile-pro): helpers puros de chamada com testes (deriveEstadoChamada/montarPayloadPresenca)"
```

---

## Task 3: `src/features/auth.ts` + `src/features/estudio.ts` — sessão, papel e contexto

**Files:**
- Create: `mobile-pro/src/features/auth.ts`
- Create: `mobile-pro/src/features/estudio.ts`

**Interfaces:**
- Consumes: `supabase` (`@/lib/supabase`), `Estudio` (`@/types`).
- Produces: `Papel` (tipo `'admin' | 'professor'`), `useSession()`, `entrar(email, senha)`, `sair()`, `useSessaoComPapel()` retornando `{ papel: Papel | null; estudioId: string | null; professorId: number | null; nomeUsuario: string | null; carregando: boolean; papelNaoSuportado: boolean }`, `SessaoAtual` (tipo), `SessaoContext`, `useSessaoAtual()` (`@/features/auth`); `EstudioResumo` (tipo), `useEstudio(estudioId)` (`@/features/estudio`). Consumidos pela Tarefa 7 (Login/PapelNaoSuportado), Tarefa 8 (navigation/App.tsx) e por todas as telas das Tarefas 9-13 via `useSessaoAtual()`.

- [ ] **Step 1: Criar `src/features/auth.ts`**

```ts
// mobile-pro/src/features/auth.ts
import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

// ── Sessão bruta (idêntico a mobile/src/features/auth.ts) ─────────────────
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCarregando(false);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, novaSession) => {
      setSession(novaSession);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  return { session, carregando };
}

export async function entrar(email: string, senha: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (error) throw error;
  return data;
}

export async function sair() {
  await supabase.auth.signOut();
}

// ── Papel (admin/professor) ─────────────────────────────────────────────
// Port do trecho relevante de webapp/src/hooks/useAuth.jsx: resolve o papel
// a partir de estudio_membros, restrito a admin/professor (super_admin e
// aluno não são suportados neste app — ver spec).
export type Papel = 'admin' | 'professor';

interface EstadoSessaoComPapel {
  papel: Papel | null;
  estudioId: string | null;
  professorId: number | null;
  nomeUsuario: string | null;
  papelNaoSuportado: boolean;
}

const ESTADO_INICIAL: EstadoSessaoComPapel = {
  papel: null,
  estudioId: null,
  professorId: null,
  nomeUsuario: null,
  papelNaoSuportado: false,
};

export interface SessaoComPapel extends EstadoSessaoComPapel {
  carregando: boolean;
}

export function useSessaoComPapel(): SessaoComPapel {
  const { session, carregando: carregandoSessao } = useSession();
  const [estado, setEstado] = useState<EstadoSessaoComPapel>(ESTADO_INICIAL);
  const [resolvendo, setResolvendo] = useState(true);

  useEffect(() => {
    let cancelado = false;
    const authId = session?.user?.id;

    if (!authId) {
      setEstado(ESTADO_INICIAL);
      setResolvendo(false);
      return;
    }

    setResolvendo(true);
    (async () => {
      // Mesmo padrão de webapp/src/hooks/useAuth.jsx: ordena por created_at
      // ascendente, pega o primeiro vínculo admin/professor.
      const { data: membros, error } = await supabase
        .from('estudio_membros')
        .select('estudio_id, role, created_at')
        .eq('user_id', authId)
        .order('created_at', { ascending: true })
        .limit(5);

      if (cancelado) return;

      if (error) {
        console.error('[useSessaoComPapel] erro ao resolver papel', error);
        setEstado({ ...ESTADO_INICIAL, papelNaoSuportado: true });
        setResolvendo(false);
        return;
      }

      const membro = (membros ?? []).find((m) => m.role === 'admin' || m.role === 'professor') ?? null;

      if (!membro) {
        setEstado({ ...ESTADO_INICIAL, papelNaoSuportado: true });
        setResolvendo(false);
        return;
      }

      if (membro.role === 'admin') {
        setEstado({
          papel: 'admin',
          estudioId: membro.estudio_id,
          professorId: null,
          nomeUsuario: null,
          papelNaoSuportado: false,
        });
        setResolvendo(false);
        return;
      }

      // role === 'professor'
      const { data: professor, error: errProf } = await supabase
        .from('professores')
        .select('id, nome')
        .eq('auth_id', authId)
        .maybeSingle();

      if (cancelado) return;

      if (errProf && errProf.code !== 'PGRST116') {
        console.error('[useSessaoComPapel] erro ao buscar professor', errProf);
      }

      setEstado({
        papel: 'professor',
        estudioId: membro.estudio_id,
        professorId: professor?.id ?? null,
        nomeUsuario: professor?.nome ?? null,
        papelNaoSuportado: false,
      });
      setResolvendo(false);
    })();

    return () => {
      cancelado = true;
    };
  }, [session?.user?.id]);

  return { ...estado, carregando: carregandoSessao || resolvendo };
}

// ── Contexto de sessão resolvida — evita prop-drilling de papel/estudioId/
// professorId por todas as telas. Provido uma vez em AppTabs (Tarefa 8),
// consumido por cada tela via useSessaoAtual() (mesmo racional de
// mobile/src/features/aluno.ts, onde cada tela chama seu próprio hook).
export interface SessaoAtual {
  papel: Papel;
  estudioId: string;
  professorId: number | null;
  nomeUsuario: string | null;
}

export const SessaoContext = createContext<SessaoAtual | null>(null);

export function useSessaoAtual(): SessaoAtual {
  const contexto = useContext(SessaoContext);
  if (!contexto) {
    throw new Error('useSessaoAtual precisa estar dentro de <SessaoContext.Provider> (ver AppTabs em src/navigation).');
  }
  return contexto;
}
```

- [ ] **Step 2: Criar `src/features/estudio.ts`**

```ts
// mobile-pro/src/features/estudio.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Estudio } from '@/types';

export function useEstudio(estudioId: string | null) {
  return useQuery<Estudio>({
    queryKey: ['estudio', estudioId],
    enabled: !!estudioId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estudios')
        .select('id, nome, logo_url, cor_primaria, cor_secundaria, modulos_ativos')
        .eq('id', estudioId!)
        .single();
      if (error) throw error;
      return data as Estudio;
    },
  });
}
```

- [ ] **Step 3: Checar tipos**

Run: `cd mobile-pro && npx tsc --noEmit`
Expected: sem erros novos (os hooks ainda não são consumidos por nenhuma tela, mas devem tipar corretamente sozinhos).

- [ ] **Step 4: Commit**

```bash
git add mobile-pro/src/features/auth.ts mobile-pro/src/features/estudio.ts
git commit -m "feat(mobile-pro): resolucao de papel (admin/professor) e contexto de sessao"
```

---

## Task 4: `src/features/agenda.ts` — aulas do dia + hooks de chamada

**Files:**
- Create: `mobile-pro/src/features/agenda.ts`

**Interfaces:**
- Consumes: `supabase` (`@/lib/supabase`), `useSession` (`@/features/auth`), `AlunoChamada`/`deriveEstadoChamada`/`montarPayloadPresenca` (`@/features/chamada`, Tarefa 2).
- Produces: `AulaAgenda` (tipo), `useAulasDoDia(estudioId, professorId, dataIso, diaSemanaBanco)`, `useListaChamada(aulaId, dataAula, estudioId)`, `useMarcarPresenca(aulaId, dataAula, estudioId)`, `useRegistrarFalta(aulaId, dataAula, estudioId)`, `useDesfazerRegistro(estudioId)`. Consumidos pelas Tarefas 9 (Dashboard), 10 (Agenda/Chamada).

- [ ] **Step 1: Implementar `src/features/agenda.ts`**

```ts
// mobile-pro/src/features/agenda.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/features/auth';
import { deriveEstadoChamada, montarPayloadPresenca, type AlunoChamada } from '@/features/chamada';

export interface AulaAgenda {
  id: number;
  atividade: string;
  dia_semana: string | null;
  data_especifica: string | null;
  horario: string;
  capacidade: number;
  vagas_ocupadas: number;
  professor_id: number | null;
  professores?: { nome: string } | null;
  modalidades?: { area: string } | null;
}

// Port da query de webapp/src/pages/Agenda + webapp/src/pages/Presenca.jsx —
// grade do dia (dia_semana OU data_especifica), filtrada por professor
// quando o papel é instrutor (professorId != null); gestor vê tudo (null).
export function useAulasDoDia(
  estudioId: string | null,
  professorId: number | null,
  dataIso: string,
  diaSemanaBanco: string
) {
  return useQuery<AulaAgenda[]>({
    queryKey: ['agenda', estudioId, professorId, dataIso],
    enabled: !!estudioId,
    queryFn: async () => {
      const diaCurto = diaSemanaBanco.split('-')[0];
      let query = supabase
        .from('agenda')
        .select('id, atividade, dia_semana, data_especifica, horario, capacidade, vagas_ocupadas, professor_id, professores(nome), modalidades(area)')
        .eq('estudio_id', estudioId!)
        .eq('ativa', true)
        .or(`dia_semana.ilike.*${diaCurto}*,data_especifica.eq.${dataIso}`)
        .order('horario', { ascending: true });
      if (professorId) query = query.eq('professor_id', professorId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as AulaAgenda[];
    },
  });
}

// ── Chamada de uma aula específica — port de webapp/src/services/presencaService.js
// (listarChamadaCompleta/registrarCheckin/registrarFalta/desfazerCheckin) +
// webapp/src/pages/Agenda/hooks/useListaPresenca.js. ──────────────────────

export function useListaChamada(aulaId: number | undefined, dataAula: string | undefined, estudioId: string | null) {
  return useQuery<AlunoChamada[]>({
    queryKey: ['chamada', estudioId, aulaId, dataAula],
    enabled: !!aulaId && !!dataAula && !!estudioId,
    queryFn: async () => {
      const [{ data: fixos, error: errFixos }, { data: registros, error: errRegistros }] = await Promise.all([
        supabase
          .from('agenda_fixa')
          .select('id, aluno_id, alunos(id, nome_completo)')
          .eq('aula_id', aulaId!)
          .eq('estudio_id', estudioId!),
        supabase
          .from('presencas')
          .select('id, aluno_id, lead_id, origem, status, alunos(id, nome_completo), leads(id, nome_visitante)')
          .eq('estudio_id', estudioId!)
          .eq('aula_id', aulaId!)
          .eq('data_aula', dataAula!),
      ]);

      if (errFixos) throw errFixos;
      if (errRegistros) throw errRegistros;

      const registrosPorAluno = new Map(
        (registros ?? [])
          .filter((r: any) => r.origem === 'fixo' && r.aluno_id)
          .map((r: any) => [r.aluno_id, r])
      );

      const lista: AlunoChamada[] = [];

      (fixos ?? []).forEach((f: any) => {
        const registroDoDia = registrosPorAluno.get(f.aluno_id);
        lista.push({
          id_relacao: registroDoDia?.id ?? f.id,
          aluno_id: f.aluno_id,
          lead_id: null,
          nome: f.alunos?.nome_completo ?? 'Aluno',
          tipo: 'fixo',
          status: registroDoDia?.status ?? 'presente',
          registroExiste: !!registroDoDia,
        });
      });

      (registros ?? [])
        .filter((r: any) => r.origem !== 'fixo')
        .forEach((r: any) => {
          lista.push({
            id_relacao: r.id,
            aluno_id: r.aluno_id,
            lead_id: r.lead_id,
            nome: r.alunos?.nome_completo ?? r.leads?.nome_visitante ?? 'Visitante',
            tipo: r.origem === 'lead' ? 'experimental' : 'avulso',
            status: r.status,
            registroExiste: true,
          });
        });

      return lista;
    },
  });
}

export function useMarcarPresenca(aulaId: number | undefined, dataAula: string | undefined, estudioId: string | null) {
  const queryClient = useQueryClient();
  const { session } = useSession();
  return useMutation({
    mutationFn: async (aluno: AlunoChamada) => {
      const payload = montarPayloadPresenca(aluno, aulaId!, dataAula!);
      const agora = new Date().toISOString();
      const registradoPor = session?.user?.id ?? null;

      if (payload.presencaId) {
        const { error } = await supabase
          .from('presencas')
          .update({ status: 'presente', data_checkin: agora, registrado_por: registradoPor })
          .eq('id', payload.presencaId)
          .eq('estudio_id', estudioId!);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from('presencas').upsert(
        [{
          estudio_id: estudioId,
          aluno_id: payload.alunoId,
          aula_id: payload.aulaId,
          data_aula: payload.dataAula,
          origem: payload.origem,
          status: 'presente',
          data_checkin: agora,
          registrado_por: registradoPor,
        }],
        { onConflict: 'aluno_id,aula_id,data_aula', ignoreDuplicates: false }
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chamada'] }),
  });
}

export function useRegistrarFalta(aulaId: number | undefined, dataAula: string | undefined, estudioId: string | null) {
  const queryClient = useQueryClient();
  const { session } = useSession();
  return useMutation({
    mutationFn: async ({ aluno, tipoFalta }: { aluno: AlunoChamada; tipoFalta: 'justificada' | 'nao_avisada' }) => {
      const payload = montarPayloadPresenca(aluno, aulaId!, dataAula!);
      const status = tipoFalta === 'justificada' ? 'falta_justificada' : 'falta_nao_avisada';
      const registradoPor = session?.user?.id ?? null;

      if (payload.presencaId) {
        const { error } = await supabase
          .from('presencas')
          .update({ status, data_checkin: null, registrado_por: registradoPor })
          .eq('id', payload.presencaId)
          .eq('estudio_id', estudioId!);
        if (error) throw error;
        return;
      }

      const { error } = await supabase.from('presencas').upsert(
        [{
          estudio_id: estudioId,
          aluno_id: payload.alunoId,
          aula_id: payload.aulaId,
          data_aula: payload.dataAula,
          origem: payload.origem,
          status,
          registrado_por: registradoPor,
        }],
        { onConflict: 'aluno_id,aula_id,data_aula', ignoreDuplicates: false }
      );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chamada'] }),
  });
}

// Desfaz check-in ou falta: fixo volta ao estado implícito (apaga a linha);
// avulso/lead não pode sumir (perderia o rastro do agendamento), volta pra
// 'agendado'. Port de presencaService.desfazerCheckin/removerFalta.
export function useDesfazerRegistro(estudioId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (aluno: AlunoChamada) => {
      if (!aluno.registroExiste) return;

      const { data: registro, error: errBusca } = await supabase
        .from('presencas')
        .select('id, origem')
        .eq('id', aluno.id_relacao)
        .eq('estudio_id', estudioId!)
        .single();
      if (errBusca) throw errBusca;

      if (registro.origem === 'fixo') {
        const { error } = await supabase
          .from('presencas')
          .delete()
          .eq('id', aluno.id_relacao)
          .eq('estudio_id', estudioId!);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from('presencas')
        .update({ status: 'agendado', data_checkin: null, registrado_por: null })
        .eq('id', aluno.id_relacao)
        .eq('estudio_id', estudioId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chamada'] }),
  });
}

export { deriveEstadoChamada };
export type { AlunoChamada };
```

- [ ] **Step 2: Checar tipos**

Run: `cd mobile-pro && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add mobile-pro/src/features/agenda.ts
git commit -m "feat(mobile-pro): aulas do dia e chamada (check-in/falta/desfazer)"
```

---

## Task 5: `src/features/alunos.ts`

**Files:**
- Create: `mobile-pro/src/features/alunos.ts`

**Interfaces:**
- Consumes: `supabase` (`@/lib/supabase`).
- Produces: `AlunoResumo` (tipo), `useAlunosDoEstudio(estudioId, busca)`, `useMeusAlunos(professorId, estudioId, busca)`. Consumidos pela Tarefa 11.

- [ ] **Step 1: Implementar**

```ts
// mobile-pro/src/features/alunos.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface AlunoResumo {
  id: number;
  nome_completo: string;
  email: string | null;
  telefone: string | null;
  status_pagamento: string;
  planos?: { nome: string } | null;
}

// Gestor: todos os alunos ativos do estúdio. Port da consulta base usada em
// webapp/src/pages/Alunos.jsx.
export function useAlunosDoEstudio(estudioId: string | null, busca: string) {
  return useQuery<AlunoResumo[]>({
    queryKey: ['alunos-estudio', estudioId, busca],
    enabled: !!estudioId,
    queryFn: async () => {
      let query = supabase
        .from('alunos')
        .select('id, nome_completo, email, telefone, status_pagamento, planos(nome)')
        .eq('estudio_id', estudioId!)
        .eq('ativo', true)
        .eq('role', 'aluno')
        .order('nome_completo');
      if (busca.trim()) query = query.ilike('nome_completo', `%${busca.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as AlunoResumo[];
    },
  });
}

// Instrutor: só os alunos das próprias modalidades — port 1:1 de
// webapp/src/pages/Professor/ProfessorAlunos.jsx (carregarAlunos).
export function useMeusAlunos(professorId: number | null, estudioId: string | null, busca: string) {
  return useQuery<AlunoResumo[]>({
    queryKey: ['meus-alunos', estudioId, professorId, busca],
    enabled: !!estudioId && !!professorId,
    queryFn: async () => {
      const [{ data: modalidadesOwn }, { data: aulasDoProf }] = await Promise.all([
        supabase.from('modalidades').select('id').eq('professor_id', professorId!).eq('estudio_id', estudioId!),
        supabase.from('agenda').select('modalidade_id').eq('professor_id', professorId!).eq('estudio_id', estudioId!),
      ]);

      const idsModalidades = [
        ...new Set([
          ...(modalidadesOwn ?? []).map((m: any) => m.id),
          ...(aulasDoProf ?? []).map((a: any) => a.modalidade_id).filter(Boolean),
        ]),
      ];

      if (idsModalidades.length === 0) return [];

      let query = supabase
        .from('alunos')
        .select('id, nome_completo, email, telefone, status_pagamento, planos(nome), modalidades_selecionadas')
        .eq('estudio_id', estudioId!)
        .eq('ativo', true)
        .eq('role', 'aluno')
        .overlaps('modalidades_selecionadas', idsModalidades)
        .order('nome_completo');
      if (busca.trim()) query = query.ilike('nome_completo', `%${busca.trim()}%`);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as AlunoResumo[];
    },
  });
}
```

- [ ] **Step 2: Checar tipos**

Run: `cd mobile-pro && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add mobile-pro/src/features/alunos.ts
git commit -m "feat(mobile-pro): lista de alunos (gestor: todos, instrutor: meus alunos)"
```

---

## Task 6: `src/features/dashboard.ts` + `src/features/financeiro.ts`

**Files:**
- Create: `mobile-pro/src/features/financeiro.ts`
- Create: `mobile-pro/src/features/dashboard.ts`

**Interfaces:**
- Consumes: `supabase` (`@/lib/supabase`).
- Produces: `ItemInadimplente` (tipo), `useInadimplencia(estudioId)`, `RepasseProfessor` (tipo), `useRepassesProfessor(professorId, estudioId, mesAno)` (`@/features/financeiro`); `KpisDashboardAdmin` (tipo), `useDashboardAdmin(estudioId)` (`@/features/dashboard`). Consumidos pelas Tarefas 9 (Dashboard) e 12 (Financeiro).

- [ ] **Step 1: Implementar `src/features/financeiro.ts`**

```ts
// mobile-pro/src/features/financeiro.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface ItemInadimplente {
  id: number;
  valor_pago: number | null;
  data_vencimento: string;
  alunos?: { nome_completo: string; telefone: string | null } | null;
}

// Port de dashboardService.obterInadimplentes (webapp).
export function useInadimplencia(estudioId: string | null) {
  return useQuery<ItemInadimplente[]>({
    queryKey: ['inadimplencia', estudioId],
    enabled: !!estudioId,
    queryFn: async () => {
      const hojeIso = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('mensalidades')
        .select('id, valor_pago, data_vencimento, alunos(nome_completo, telefone)')
        .eq('estudio_id', estudioId!)
        .in('status', ['pendente', 'atrasado'])
        .lt('data_vencimento', hojeIso)
        .order('data_vencimento', { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ItemInadimplente[];
    },
  });
}

export interface RepasseProfessor {
  id: number;
  valor: number;
  tipo_aula: string;
  modalidade: string | null;
  data_referencia: string;
  status: 'pago' | 'pendente' | 'cancelado' | string;
  pago_em: string | null;
  alunos?: { nome_completo: string } | null;
}

// Port de webapp/src/services/repasseService.js (listarRepassesProfessor).
export function useRepassesProfessor(professorId: number | null, estudioId: string | null, mesAno: string) {
  return useQuery<RepasseProfessor[]>({
    queryKey: ['repasses', estudioId, professorId, mesAno],
    enabled: !!estudioId && !!professorId,
    queryFn: async () => {
      const inicio = `${mesAno}-01`;
      const [ano, mes] = mesAno.split('-').map(Number);
      const ultimoDia = new Date(ano, mes, 0).getDate();
      const fim = `${mesAno}-${String(ultimoDia).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('repasses_lancamentos')
        .select('id, valor, tipo_aula, modalidade, data_referencia, status, pago_em, alunos(nome_completo)')
        .eq('professor_id', professorId!)
        .eq('estudio_id', estudioId!)
        .gte('data_referencia', inicio)
        .lte('data_referencia', fim)
        .order('data_referencia', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as RepasseProfessor[];
    },
  });
}
```

- [ ] **Step 2: Implementar `src/features/dashboard.ts`**

```ts
// mobile-pro/src/features/dashboard.ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ItemInadimplente } from '@/features/financeiro';

export interface KpisDashboardAdmin {
  totalAlunos: number;
  faturamentoMes: number;
  inadimplentes: ItemInadimplente[];
}

// Port reduzido de webapp/src/services/dashboardService.js
// (obterTotalAlunos + obterPagamentosMes + obterInadimplentes), em paralelo.
export function useDashboardAdmin(estudioId: string | null) {
  const agora = new Date();
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString();
  const hojeIso = agora.toISOString().split('T')[0];

  return useQuery<KpisDashboardAdmin>({
    queryKey: ['dashboard-admin', estudioId, hojeIso, inicioMes],
    enabled: !!estudioId,
    queryFn: async () => {
      const [
        { count: totalAlunos, error: errTotal },
        { data: pagamentosMes, error: errPag },
        { data: inadimplentes, error: errInad },
      ] = await Promise.all([
        supabase
          .from('alunos')
          .select('*', { count: 'exact', head: true })
          .eq('estudio_id', estudioId!)
          .eq('ativo', true)
          .eq('role', 'aluno'),
        supabase
          .from('mensalidades')
          .select('valor_pago')
          .eq('estudio_id', estudioId!)
          .eq('status', 'pago')
          .gte('data_pagamento', inicioMes),
        supabase
          .from('mensalidades')
          .select('id, valor_pago, data_vencimento, alunos(nome_completo, telefone)')
          .eq('estudio_id', estudioId!)
          .in('status', ['pendente', 'atrasado'])
          .lt('data_vencimento', hojeIso)
          .order('data_vencimento', { ascending: true }),
      ]);

      if (errTotal) throw errTotal;
      if (errPag) throw errPag;
      if (errInad) throw errInad;

      const faturamentoMes = (pagamentosMes ?? []).reduce((acc: number, m: any) => acc + Number(m.valor_pago ?? 0), 0);

      return {
        totalAlunos: totalAlunos ?? 0,
        faturamentoMes,
        inadimplentes: (inadimplentes ?? []) as unknown as ItemInadimplente[],
      };
    },
  });
}
```

- [ ] **Step 3: Checar tipos**

Run: `cd mobile-pro && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add mobile-pro/src/features/financeiro.ts mobile-pro/src/features/dashboard.ts
git commit -m "feat(mobile-pro): KPIs do dashboard, inadimplencia e repasses do professor"
```

---

## Task 7: Telas de autenticação — `LoginScreen` e `PapelNaoSuportadoScreen`

**Files:**
- Create: `mobile-pro/src/screens/Auth/LoginScreen.tsx`
- Create: `mobile-pro/src/screens/PapelNaoSuportado/PapelNaoSuportadoScreen.tsx`

**Interfaces:**
- Consumes: `entrar`, `sair` (`@/features/auth`), `Body`/`Button`/`Display` (`@/components/ui`), `fonts` (`@/lib/typography`), `useThemeStore` (`@/lib/theme`).
- Produces: `LoginScreen` (default export), `PapelNaoSuportadoScreen` (default export). Consumidos pela Tarefa 8.

- [ ] **Step 1: Criar `LoginScreen.tsx` (port de `mobile/src/screens/Auth/LoginScreen.tsx`, texto ajustado pro público PRO)**

```tsx
// mobile-pro/src/screens/Auth/LoginScreen.tsx
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput } from 'react-native';
import { entrar } from '@/features/auth';
import { Body, Button, Display } from '@/components/ui';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const handleEntrar = async () => {
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email.trim(), senha);
      // onAuthStateChange (useSession) reage sozinho — sem navigate manual aqui.
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar. Verifique seus dados.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-white justify-center px-8"
    >
      <Display style={{ fontSize: 26, marginBottom: 4 }}>Nexofy PRO</Display>
      <Body style={{ color: '#9ca3af', marginBottom: 32 }}>
        Acesso de gestor e instrutor — entre com seu e-mail e senha do Nexofy
      </Body>

      <TextInput
        className="border border-gray-200 rounded-2xl px-4 py-3 mb-3 text-base"
        placeholder="E-mail"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        className="border border-gray-200 rounded-2xl px-4 py-3 mb-4 text-base"
        placeholder="Senha"
        secureTextEntry
        value={senha}
        onChangeText={setSenha}
      />

      {erro && <Body style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{erro}</Body>}

      <Button onPress={handleEntrar} loading={enviando} disabled={!email || !senha}>
        Entrar
      </Button>
    </KeyboardAvoidingView>
  );
}
```

- [ ] **Step 2: Criar `PapelNaoSuportadoScreen.tsx`**

```tsx
// mobile-pro/src/screens/PapelNaoSuportado/PapelNaoSuportadoScreen.tsx
import React from 'react';
import { View } from 'react-native';
import { sair } from '@/features/auth';
import { Body, Button, Display } from '@/components/ui';

export default function PapelNaoSuportadoScreen() {
  return (
    <View className="flex-1 bg-white justify-center px-8">
      <Display style={{ fontSize: 22, marginBottom: 8 }}>Este app é exclusivo para gestores e instrutores</Display>
      <Body style={{ color: '#9ca3af', marginBottom: 32 }}>
        Não encontramos um vínculo de gestor ou instrutor pra essa conta neste estúdio. Se você é aluno, use o app
        Área do Aluno. Se acha que isso é um erro, fale com o administrador do seu estúdio.
      </Body>
      <Button variant="outline" onPress={sair}>Sair</Button>
    </View>
  );
}
```

- [ ] **Step 3: Checar tipos**

Run: `cd mobile-pro && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add mobile-pro/src/screens/Auth mobile-pro/src/screens/PapelNaoSuportado
git commit -m "feat(mobile-pro): telas de login e bloqueio de papel nao suportado"
```

---

## Task 8: Navegação e `App.tsx` final — integra tudo, app deve bootar

**Files:**
- Create: `mobile-pro/src/navigation/index.tsx`
- Modify: `mobile-pro/App.tsx` (substitui o placeholder da Tarefa 1)

**Interfaces:**
- Consumes: `useSessaoComPapel`, `SessaoContext`, `sair` (`@/features/auth`), `useEstudio` (`@/features/estudio`), `useThemeStore` (`@/lib/theme`), `LoadingState` (`@/components/ui`), `LoginScreen`, `PapelNaoSuportadoScreen` (Tarefa 7). Referencia (ainda não existem até as Tarefas 9-13, mas os imports já ficam corretos): `DashboardScreen`, `AgendaScreen`, `ChamadaScreen`, `AlunosScreen`, `FinanceiroScreen`, `PerfilScreen`.
- Produces: `RootNavigator` (export nomeado), `AgendaStackParamList` (tipo, export nomeado — usado pela Tarefa 10 pra tipar `route.params` de `ChamadaScreen`).

**Nota de ordem:** esta tarefa referencia arquivos de tela que só existem a partir da Tarefa 9. Para o `tsc --noEmit` deste passo passar, criar primeiro *stubs* mínimos dessas telas (substituídos integralmente pelas tarefas seguintes) — ver Step 1.

- [ ] **Step 1: Criar stubs mínimos das telas que ainda não existem**

```tsx
// mobile-pro/src/screens/Dashboard/DashboardScreen.tsx (stub — implementado na Tarefa 9)
import React from 'react';
import { Text, View } from 'react-native';
export default function DashboardScreen() {
  return <View className="flex-1 items-center justify-center bg-white"><Text>Dashboard</Text></View>;
}
```

```tsx
// mobile-pro/src/screens/Agenda/AgendaScreen.tsx (stub — implementado na Tarefa 10)
import React from 'react';
import { Text, View } from 'react-native';
export default function AgendaScreen() {
  return <View className="flex-1 items-center justify-center bg-white"><Text>Agenda</Text></View>;
}
```

```tsx
// mobile-pro/src/screens/Agenda/ChamadaScreen.tsx (stub — implementado na Tarefa 10)
import React from 'react';
import { Text, View } from 'react-native';
export default function ChamadaScreen() {
  return <View className="flex-1 items-center justify-center bg-white"><Text>Chamada</Text></View>;
}
```

```tsx
// mobile-pro/src/screens/Alunos/AlunosScreen.tsx (stub — implementado na Tarefa 11)
import React from 'react';
import { Text, View } from 'react-native';
export default function AlunosScreen() {
  return <View className="flex-1 items-center justify-center bg-white"><Text>Alunos</Text></View>;
}
```

```tsx
// mobile-pro/src/screens/Financeiro/FinanceiroScreen.tsx (stub — implementado na Tarefa 12)
import React from 'react';
import { Text, View } from 'react-native';
export default function FinanceiroScreen() {
  return <View className="flex-1 items-center justify-center bg-white"><Text>Financeiro</Text></View>;
}
```

```tsx
// mobile-pro/src/screens/Perfil/PerfilScreen.tsx (stub — implementado na Tarefa 13)
import React from 'react';
import { Text, View } from 'react-native';
export default function PerfilScreen() {
  return <View className="flex-1 items-center justify-center bg-white"><Text>Perfil</Text></View>;
}
```

- [ ] **Step 2: Criar `src/navigation/index.tsx`**

```tsx
// mobile-pro/src/navigation/index.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Calendar, CreditCard, Home, User, Users } from 'lucide-react-native';
import { SessaoContext, useSessaoComPapel, type SessaoAtual } from '@/features/auth';
import { useEstudio } from '@/features/estudio';
import { useThemeStore } from '@/lib/theme';
import { LoadingState } from '@/components/ui';
import LoginScreen from '@/screens/Auth/LoginScreen';
import PapelNaoSuportadoScreen from '@/screens/PapelNaoSuportado/PapelNaoSuportadoScreen';
import DashboardScreen from '@/screens/Dashboard/DashboardScreen';
import AgendaScreen from '@/screens/Agenda/AgendaScreen';
import ChamadaScreen from '@/screens/Agenda/ChamadaScreen';
import AlunosScreen from '@/screens/Alunos/AlunosScreen';
import FinanceiroScreen from '@/screens/Financeiro/FinanceiroScreen';
import PerfilScreen from '@/screens/Perfil/PerfilScreen';

export type AgendaStackParamList = {
  ListaAulas: undefined;
  Chamada: { aulaId: number; dataAula: string; atividade: string; horario: string };
};

const AuthStackNav = createNativeStackNavigator();
function AuthStack() {
  return (
    <AuthStackNav.Navigator screenOptions={{ headerShown: false }}>
      <AuthStackNav.Screen name="Login" component={LoginScreen} />
    </AuthStackNav.Navigator>
  );
}

const AgendaStackNav = createNativeStackNavigator<AgendaStackParamList>();
function AgendaStack() {
  return (
    <AgendaStackNav.Navigator>
      <AgendaStackNav.Screen name="ListaAulas" component={AgendaScreen} options={{ headerShown: false }} />
      <AgendaStackNav.Screen
        name="Chamada"
        component={ChamadaScreen}
        options={({ route }) => ({ title: route.params.atividade, presentation: 'modal' })}
      />
    </AgendaStackNav.Navigator>
  );
}

const Tab = createBottomTabNavigator();
function AppTabs({ sessao }: { sessao: SessaoAtual }) {
  const { tokens } = useThemeStore();
  const { data: estudio } = useEstudio(sessao.estudioId);

  const modulos = estudio?.modulos_ativos ?? ['agenda', 'financeiro', 'alunos'];
  const mostrarAgenda = modulos.includes('agenda');
  const mostrarAlunos = modulos.includes('alunos');
  const mostrarFinanceiro = modulos.includes('financeiro');

  return (
    <SessaoContext.Provider value={sessao}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: tokens.pri,
          tabBarInactiveTintColor: '#9ca3af',
        }}
      >
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ tabBarIcon: ({ color, size }) => <Home color={color} size={size} /> }}
        />
        {mostrarAgenda && (
          <Tab.Screen
            name="Agenda"
            component={AgendaStack}
            options={{ tabBarIcon: ({ color, size }) => <Calendar color={color} size={size} /> }}
          />
        )}
        {mostrarAlunos && (
          <Tab.Screen
            name="Alunos"
            component={AlunosScreen}
            options={{ tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }}
          />
        )}
        {mostrarFinanceiro && (
          <Tab.Screen
            name="Financeiro"
            component={FinanceiroScreen}
            options={{ tabBarIcon: ({ color, size }) => <CreditCard color={color} size={size} /> }}
          />
        )}
        <Tab.Screen
          name="Perfil"
          component={PerfilScreen}
          options={{ tabBarIcon: ({ color, size }) => <User color={color} size={size} /> }}
        />
      </Tab.Navigator>
    </SessaoContext.Provider>
  );
}

export function RootNavigator() {
  const { papel, estudioId, professorId, nomeUsuario, carregando, papelNaoSuportado } = useSessaoComPapel();

  if (carregando) return <LoadingState label="Verificando sessão..." />;

  let conteudo: React.ReactNode;
  if (!papel && !papelNaoSuportado) {
    conteudo = <AuthStack />;
  } else if (papelNaoSuportado || !papel || !estudioId) {
    conteudo = <PapelNaoSuportadoScreen />;
  } else {
    conteudo = <AppTabs sessao={{ papel, estudioId, professorId, nomeUsuario }} />;
  }

  return <NavigationContainer>{conteudo}</NavigationContainer>;
}
```

- [ ] **Step 3: Substituir `App.tsx` pelo definitivo (aplica o tema do estúdio, igual a `mobile/App.tsx`)**

```tsx
// mobile-pro/App.tsx
import './global.css';
import React, { useCallback, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts as useInterFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import {
  useFonts as usePlusJakartaFonts,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { queryClient } from '@/lib/queryClient';
import { useThemeStore } from '@/lib/theme';
import { useSessaoComPapel } from '@/features/auth';
import { useEstudio } from '@/features/estudio';
import { RootNavigator } from '@/navigation';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Aplica o tema do estúdio assim que o papel/estudioId resolve — mesmo
// racional de mobile/App.tsx (TemaDoEstudio), fonte trocada de
// "estúdio do aluno" para "estúdio do gestor/instrutor logado".
function TemaDoEstudio() {
  const { estudioId } = useSessaoComPapel();
  const { data: estudio } = useEstudio(estudioId);
  const aplicarTemaDoEstudio = useThemeStore((s) => s.aplicarTemaDoEstudio);
  const resetarTema = useThemeStore((s) => s.resetarTema);

  useEffect(() => {
    if (estudio) aplicarTemaDoEstudio(estudio);
    else resetarTema();
  }, [estudio, aplicarTemaDoEstudio, resetarTema]);

  return null;
}

export default function App() {
  const [interCarregada] = useInterFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [jakartaCarregada] = usePlusJakartaFonts({
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  const fontesProntas = interCarregada && jakartaCarregada;

  const onLayoutRootView = useCallback(() => {
    if (fontesProntas) SplashScreen.hideAsync().catch(() => {});
  }, [fontesProntas]);

  if (!fontesProntas) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider onLayout={onLayoutRootView}>
        <StatusBar style="dark" />
        <TemaDoEstudio />
        <RootNavigator />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 4: Checar tipos**

Run: `cd mobile-pro && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add mobile-pro/src/navigation mobile-pro/App.tsx mobile-pro/src/screens
git commit -m "feat(mobile-pro): navegacao por papel e integracao final do App.tsx"
```

---

## Task 9: Telas de Dashboard

**Files:**
- Modify: `mobile-pro/src/screens/Dashboard/DashboardScreen.tsx` (substitui o stub da Tarefa 8)
- Create: `mobile-pro/src/screens/Dashboard/DashboardAdmin.tsx`
- Create: `mobile-pro/src/screens/Dashboard/DashboardProfessor.tsx`

**Interfaces:**
- Consumes: `useSessaoAtual` (`@/features/auth`), `useDashboardAdmin` (`@/features/dashboard`), `useAulasDoDia` (`@/features/agenda`), `useRepassesProfessor` (`@/features/financeiro`), componentes de `@/components/ui`.
- Produces: `DashboardScreen` (default export, decide por papel).

- [ ] **Step 1: Criar `DashboardAdmin.tsx`**

```tsx
// mobile-pro/src/screens/Dashboard/DashboardAdmin.tsx
import React from 'react';
import { Linking, RefreshControl, ScrollView, Text, View } from 'react-native';
import { AlertCircle, MessageCircle, Users, Wallet } from 'lucide-react-native';
import { useDashboardAdmin } from '@/features/dashboard';
import { useThemeStore } from '@/lib/theme';
import { Body, Card, CardSkeleton, Display, ErrorState, LoadingState } from '@/components/ui';
import { fonts } from '@/lib/typography';

function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function gerarLinkWhatsApp(telefone: string | null | undefined, mensagem: string): string | null {
  const num = (telefone ?? '').replace(/\D/g, '');
  if (!num) return null;
  return `https://wa.me/55${num}?text=${encodeURIComponent(mensagem)}`;
}

export default function DashboardAdmin({ estudioId }: { estudioId: string }) {
  const { tokens } = useThemeStore();
  const { data, isLoading, isError, error, refetch } = useDashboardAdmin(estudioId);

  if (isLoading) return <LoadingState label="Carregando painel..." />;
  if (isError || !data) {
    return (
      <View className="flex-1 justify-center px-6" style={{ backgroundColor: '#FDF8F5' }}>
        <ErrorState mensagem={error instanceof Error ? error.message : 'Tente novamente.'} onRetry={() => refetch()} />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: '#FDF8F5' }}
      contentContainerStyle={{ padding: 20, gap: 16 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => refetch()} />}
    >
      <Display style={{ fontSize: 24 }}>Painel do estúdio</Display>

      <View className="flex-row gap-3">
        <Card className="flex-1">
          <Wallet color={tokens.pri} size={18} />
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', marginTop: 8 }}>
            Receita do mês
          </Text>
          <Display style={{ fontSize: 18, marginTop: 4 }}>{formatarMoeda(data.faturamentoMes)}</Display>
        </Card>
        <Card className="flex-1">
          <Users color={tokens.pri} size={18} />
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', marginTop: 8 }}>
            Alunos ativos
          </Text>
          <Display style={{ fontSize: 18, marginTop: 4 }}>{data.totalAlunos}</Display>
        </Card>
      </View>

      <Card>
        <View className="flex-row items-center gap-2 mb-3">
          <AlertCircle color="#dc2626" size={18} />
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase' }}>
            Em atraso · {data.inadimplentes.length}
          </Text>
        </View>
        {data.inadimplentes.length === 0 ? (
          <Body style={{ color: '#9ca3af' }}>Nenhum pagamento em atraso. 🎉</Body>
        ) : (
          data.inadimplentes.slice(0, 8).map((item) => {
            const link = gerarLinkWhatsApp(
              item.alunos?.telefone,
              `Olá, ${item.alunos?.nome_completo?.split(' ')[0] ?? ''}! Seu pagamento de ${formatarMoeda(Number(item.valor_pago ?? 0))} está em aberto. Podemos verificar juntos?`
            );
            return (
              <View key={item.id} className="flex-row items-center justify-between py-2 border-b border-gray-100">
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-bold text-gray-800">{item.alunos?.nome_completo ?? '—'}</Text>
                  <Text className="text-xs text-gray-400">{formatarMoeda(Number(item.valor_pago ?? 0))}</Text>
                </View>
                {link && (
                  <Text
                    onPress={() => Linking.openURL(link)}
                    style={{ color: '#16a34a', fontFamily: fonts.bodyBold, fontSize: 12 }}
                  >
                    <MessageCircle size={13} /> Cobrar
                  </Text>
                )}
              </View>
            );
          })
        )}
      </Card>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Criar `DashboardProfessor.tsx`**

```tsx
// mobile-pro/src/screens/Dashboard/DashboardProfessor.tsx
import React, { useMemo } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { CalendarClock, TrendingUp } from 'lucide-react-native';
import { useAulasDoDia } from '@/features/agenda';
import { useRepassesProfessor } from '@/features/financeiro';
import { useThemeStore } from '@/lib/theme';
import { Body, Card, CardSkeleton, Display, EmptyState } from '@/components/ui';
import { fonts } from '@/lib/typography';

const NOMES_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_BANCO = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function paraDataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function mesAnoAtual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function DashboardProfessor({
  estudioId,
  professorId,
  nomeUsuario,
}: {
  estudioId: string;
  professorId: number | null;
  nomeUsuario: string | null;
}) {
  const { tokens } = useThemeStore();
  const hoje = useMemo(() => new Date(), []);
  const dataIso = paraDataLocalStr(hoje);
  const diaBanco = DIAS_BANCO[hoje.getDay()];

  const { data: aulasHoje, isLoading: carregandoAulas, refetch: refetchAulas } = useAulasDoDia(
    estudioId,
    professorId,
    dataIso,
    diaBanco
  );
  const { data: repasses, isLoading: carregandoRepasses, refetch: refetchRepasses } = useRepassesProfessor(
    professorId,
    estudioId,
    mesAnoAtual()
  );

  const resumoComissoes = useMemo(() => {
    if (!repasses) return { total: 0, pendente: 0 };
    return repasses.reduce(
      (acc, r) => {
        acc.total += r.valor ?? 0;
        if (r.status !== 'pago') acc.pendente += r.valor ?? 0;
        return acc;
      },
      { total: 0, pendente: 0 }
    );
  }, [repasses]);

  return (
    <ScrollView
      className="flex-1"
      style={{ backgroundColor: '#FDF8F5' }}
      contentContainerStyle={{ padding: 20, gap: 16 }}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => { refetchAulas(); refetchRepasses(); }} />}
    >
      <Display style={{ fontSize: 24 }}>Olá, {nomeUsuario?.split(' ')[0] ?? 'instrutor(a)'} 👋</Display>

      <Card>
        <View className="flex-row items-center gap-2 mb-3">
          <CalendarClock color={tokens.pri} size={18} />
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase' }}>
            Suas aulas hoje
          </Text>
        </View>
        {carregandoAulas ? (
          <CardSkeleton />
        ) : !aulasHoje || aulasHoje.length === 0 ? (
          <EmptyState titulo="Nada marcado hoje" descricao="Sem aulas suas na grade de hoje." />
        ) : (
          aulasHoje.map((aula) => (
            <View key={aula.id} className="flex-row items-center justify-between py-2 border-b border-gray-100">
              <Text className="text-sm font-bold text-gray-800">{aula.atividade}</Text>
              <Text style={{ color: tokens.pri, fontFamily: fonts.bodyBold, fontSize: 13 }}>
                {aula.horario?.substring(0, 5)}
              </Text>
            </View>
          ))
        )}
      </Card>

      <Card>
        <View className="flex-row items-center gap-2 mb-3">
          <TrendingUp color={tokens.pri} size={18} />
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase' }}>
            Comissões do mês
          </Text>
        </View>
        {carregandoRepasses ? (
          <CardSkeleton />
        ) : (
          <View className="flex-row justify-between">
            <View>
              <Body style={{ color: '#9ca3af', fontSize: 12 }}>Total</Body>
              <Display style={{ fontSize: 18 }}>{formatarMoeda(resumoComissoes.total)}</Display>
            </View>
            <View>
              <Body style={{ color: '#9ca3af', fontSize: 12 }}>Pendente</Body>
              <Display style={{ fontSize: 18 }}>{formatarMoeda(resumoComissoes.pendente)}</Display>
            </View>
          </View>
        )}
      </Card>
    </ScrollView>
  );
}
```

- [ ] **Step 3: Reescrever `DashboardScreen.tsx` (troca o stub — decide por papel)**

```tsx
// mobile-pro/src/screens/Dashboard/DashboardScreen.tsx
import React from 'react';
import { useSessaoAtual } from '@/features/auth';
import DashboardAdmin from '@/screens/Dashboard/DashboardAdmin';
import DashboardProfessor from '@/screens/Dashboard/DashboardProfessor';

export default function DashboardScreen() {
  const { papel, estudioId, professorId, nomeUsuario } = useSessaoAtual();
  return papel === 'admin'
    ? <DashboardAdmin estudioId={estudioId} />
    : <DashboardProfessor estudioId={estudioId} professorId={professorId} nomeUsuario={nomeUsuario} />;
}
```

- [ ] **Step 4: Checar tipos**

Run: `cd mobile-pro && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add mobile-pro/src/screens/Dashboard
git commit -m "feat(mobile-pro): telas de dashboard (gestor e instrutor)"
```

---

## Task 10: Telas de Agenda e Chamada

**Files:**
- Modify: `mobile-pro/src/screens/Agenda/AgendaScreen.tsx` (substitui o stub da Tarefa 8)
- Modify: `mobile-pro/src/screens/Agenda/ChamadaScreen.tsx` (substitui o stub da Tarefa 8)

**Interfaces:**
- Consumes: `useSessaoAtual` (`@/features/auth`), `useAulasDoDia`, `useListaChamada`, `useMarcarPresenca`, `useRegistrarFalta`, `useDesfazerRegistro`, `deriveEstadoChamada` (`@/features/agenda`), `AgendaStackParamList` (`@/navigation`, Tarefa 8), `useNavigation`/`useRoute` do React Navigation.

- [ ] **Step 1: Reescrever `AgendaScreen.tsx` — porta o seletor "próximos 7 dias" de `mobile/src/screens/Agenda/AgendaScreen.tsx`, trocando "agendar" por "abrir chamada"**

```tsx
// mobile-pro/src/screens/Agenda/AgendaScreen.tsx
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Users } from 'lucide-react-native';
import { useSessaoAtual } from '@/features/auth';
import { useAulasDoDia, type AulaAgenda } from '@/features/agenda';
import { useThemeStore } from '@/lib/theme';
import { Body, Card, CardSkeleton, Display, EmptyState, ErrorState } from '@/components/ui';
import { fonts } from '@/lib/typography';
import type { AgendaStackParamList } from '@/navigation';

const NOMES_DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_BANCO = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function paraDataLocalStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function gerarProximosDias() {
  const dias = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    dias.push({
      dataIso: paraDataLocalStr(d),
      diaSemana: i === 0 ? 'Hoje' : NOMES_DIAS[d.getDay()],
      diaMes: paraDataLocalStr(d).split('-').slice(1).reverse().join('/'),
      diaBanco: DIAS_BANCO[d.getDay()],
    });
  }
  return dias;
}

type Navegacao = NativeStackNavigationProp<AgendaStackParamList, 'ListaAulas'>;

function AulaCard({ aula, dataIso, onAbrirChamada }: { aula: AulaAgenda; dataIso: string; onAbrirChamada: () => void }) {
  const { tokens } = useThemeStore();
  return (
    <Pressable onPress={onAbrirChamada}>
      <Card className="mb-3">
        <View className="flex-row justify-between items-center">
          <View className="flex-1 pr-3">
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: tokens.pri }}>{aula.horario?.substring(0, 5)}</Text>
            <Text style={{ fontFamily: fonts.displaySemibold, fontSize: 16, color: '#0A0A1A', marginTop: 2 }}>{aula.atividade}</Text>
            <Body style={{ color: '#9ca3af', fontSize: 12, marginTop: 2 }}>
              Prof. {aula.professores?.nome?.split(' ')[0] ?? 'A definir'}
            </Body>
            <View className="flex-row items-center gap-1 mt-2">
              <Users color="#9ca3af" size={13} />
              <Text className="text-gray-400 text-xs">{aula.vagas_ocupadas ?? 0}/{aula.capacidade} vagas</Text>
            </View>
          </View>
          <Text style={{ color: tokens.pri, fontFamily: fonts.bodyBold, fontSize: 13 }}>Fazer chamada ›</Text>
        </View>
      </Card>
    </Pressable>
  );
}

export default function AgendaScreen() {
  const navigation = useNavigation<Navegacao>();
  const { estudioId, professorId } = useSessaoAtual();
  const proximosDias = useMemo(() => gerarProximosDias(), []);
  const [diaAtivo, setDiaAtivo] = useState(proximosDias[0]);
  const { tokens } = useThemeStore();

  const { data: aulas, isLoading, isError, refetch } = useAulasDoDia(estudioId, professorId, diaAtivo.dataIso, diaAtivo.diaBanco);

  return (
    <View className="flex-1" style={{ backgroundColor: '#FDF8F5' }}>
      <View className="px-5 pt-4 pb-2">
        <Display style={{ fontSize: 24 }}>Agenda</Display>
        <Body style={{ color: '#9ca3af', marginTop: 2 }}>Toque numa aula pra fazer a chamada</Body>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-5 mb-2" contentContainerStyle={{ gap: 8 }}>
        {proximosDias.map((dia) => {
          const ativo = dia.dataIso === diaAtivo.dataIso;
          return (
            <Pressable
              key={dia.dataIso}
              onPress={() => setDiaAtivo(dia)}
              className="px-4 py-2 rounded-2xl items-center"
              style={{ backgroundColor: ativo ? tokens.pri : '#fff', borderWidth: 1, borderColor: ativo ? tokens.pri : '#e5e7eb' }}
            >
              <Text style={{ color: ativo ? tokens.priText : '#374151' }} className="text-sm font-bold">{dia.diaSemana}</Text>
              <Text style={{ color: ativo ? tokens.priText : '#9ca3af' }} className="text-xs">{dia.diaMes}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <View className="px-5 pt-2" style={{ gap: 12 }}>
          <CardSkeleton /><CardSkeleton /><CardSkeleton />
        </View>
      ) : isError ? (
        <View className="px-5"><ErrorState mensagem="Não foi possível carregar as aulas." onRetry={() => refetch()} /></View>
      ) : !aulas || aulas.length === 0 ? (
        <View className="px-5"><EmptyState titulo="Sem aulas neste dia" descricao="Toca em outro dia ali em cima." /></View>
      ) : (
        <FlatList
          data={aulas}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 20, paddingTop: 8 }}
          renderItem={({ item }) => (
            <AulaCard
              aula={item}
              dataIso={diaAtivo.dataIso}
              onAbrirChamada={() => navigation.navigate('Chamada', {
                aulaId: item.id,
                dataAula: diaAtivo.dataIso,
                atividade: item.atividade,
                horario: item.horario,
              })}
            />
          )}
        />
      )}
    </View>
  );
}
```

- [ ] **Step 2: Reescrever `ChamadaScreen.tsx`**

```tsx
// mobile-pro/src/screens/Agenda/ChamadaScreen.tsx
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useSessaoAtual } from '@/features/auth';
import {
  deriveEstadoChamada,
  useDesfazerRegistro,
  useListaChamada,
  useMarcarPresenca,
  useRegistrarFalta,
  type AlunoChamada,
} from '@/features/agenda';
import { useThemeStore } from '@/lib/theme';
import { Badge, Body, Button, Display, EmptyState, ErrorState, LoadingState } from '@/components/ui';
import type { AgendaStackParamList } from '@/navigation';

type Rota = RouteProp<AgendaStackParamList, 'Chamada'>;

function LinhaAluno({ aluno }: { aluno: AlunoChamada }) {
  const { estudioId } = useSessaoAtual();
  const route = useRoute<Rota>();
  const { aulaId, dataAula } = route.params;

  const marcarPresenca = useMarcarPresenca(aulaId, dataAula, estudioId);
  const registrarFalta = useRegistrarFalta(aulaId, dataAula, estudioId);
  const desfazer = useDesfazerRegistro(estudioId);

  const estado = deriveEstadoChamada(aluno);
  const processando = marcarPresenca.isPending || registrarFalta.isPending || desfazer.isPending;

  return (
    <View className="flex-row items-center justify-between py-3 border-b border-gray-100">
      <View className="flex-1 pr-3">
        <Text className="text-sm font-bold text-gray-800">{aluno.nome}</Text>
        <Badge tone={estado === 'presente' ? 'ok' : estado === 'falta' ? 'err' : 'warn'}>
          {estado === 'presente' ? 'Presente' : estado === 'falta' ? 'Faltou' : 'Pendente'}
        </Badge>
      </View>
      {estado === 'pendente' ? (
        <View className="flex-row gap-2">
          <Button variant="primary" loading={marcarPresenca.isPending} disabled={processando} onPress={() => marcarPresenca.mutate(aluno)}>
            Presente
          </Button>
          <Button variant="danger" loading={registrarFalta.isPending} disabled={processando} onPress={() => registrarFalta.mutate({ aluno, tipoFalta: 'nao_avisada' })}>
            Falta
          </Button>
        </View>
      ) : (
        <Button variant="outline" loading={desfazer.isPending} disabled={processando} onPress={() => desfazer.mutate(aluno)}>
          Desfazer
        </Button>
      )}
    </View>
  );
}

export default function ChamadaScreen() {
  const route = useRoute<Rota>();
  const { estudioId } = useSessaoAtual();
  const { tokens } = useThemeStore();
  const { aulaId, dataAula, atividade, horario } = route.params;

  const { data: lista, isLoading, isError, refetch } = useListaChamada(aulaId, dataAula, estudioId);

  if (isLoading) return <LoadingState label="Carregando chamada..." />;
  if (isError || !lista) {
    return (
      <View className="flex-1 justify-center px-6 bg-white">
        <ErrorState mensagem="Não foi possível carregar a lista de presença." onRetry={() => refetch()} />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 20 }}>
      <Display style={{ fontSize: 20 }}>{atividade}</Display>
      <Body style={{ color: '#9ca3af', marginBottom: 16 }}>{horario?.substring(0, 5)} · {dataAula}</Body>

      {lista.length === 0 ? (
        <EmptyState titulo="Sem alunos nessa aula" descricao="Não há fixos, avulsos ou leads agendados pra essa data." />
      ) : (
        lista.map((aluno) => <LinhaAluno key={aluno.id_relacao} aluno={aluno} />)
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 3: Checar tipos**

Run: `cd mobile-pro && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add mobile-pro/src/screens/Agenda
git commit -m "feat(mobile-pro): agenda por papel e chamada (check-in/falta) de uma aula"
```

---

## Task 11: Tela de Alunos

**Files:**
- Modify: `mobile-pro/src/screens/Alunos/AlunosScreen.tsx` (substitui o stub da Tarefa 8)

**Interfaces:**
- Consumes: `useSessaoAtual` (`@/features/auth`), `useAlunosDoEstudio`, `useMeusAlunos` (`@/features/alunos`).

- [ ] **Step 1: Implementar**

```tsx
// mobile-pro/src/screens/Alunos/AlunosScreen.tsx
import React, { useState } from 'react';
import { FlatList, Linking, Text, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';
import { useSessaoAtual } from '@/features/auth';
import { useAlunosDoEstudio, useMeusAlunos, type AlunoResumo } from '@/features/alunos';
import { Badge, Card, Display, EmptyState, ErrorState, LoadingState } from '@/components/ui';

function formatarWhatsApp(telefone: string | null) {
  if (!telefone) return null;
  const digits = telefone.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if (digits.length === 12 || digits.length === 13) return digits;
  return null;
}

function LinhaAluno({ aluno }: { aluno: AlunoResumo }) {
  const whatsapp = formatarWhatsApp(aluno.telefone);
  return (
    <Card className="mb-3">
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-sm font-bold text-gray-800">{aluno.nome_completo}</Text>
          {aluno.planos?.nome && <Text className="text-xs text-gray-400 mt-1">{aluno.planos.nome}</Text>}
        </View>
        <Badge tone={aluno.status_pagamento === 'atrasado' ? 'err' : 'ok'}>
          {aluno.status_pagamento === 'atrasado' ? 'Atrasado' : 'Em dia'}
        </Badge>
      </View>
      {whatsapp && (
        <Text
          onPress={() => Linking.openURL(`https://wa.me/${whatsapp}`)}
          className="text-xs text-emerald-600 font-bold mt-3"
        >
          Abrir WhatsApp
        </Text>
      )}
    </Card>
  );
}

export default function AlunosScreen() {
  const { papel, estudioId, professorId } = useSessaoAtual();
  const [busca, setBusca] = useState('');

  const queryAdmin = useAlunosDoEstudio(papel === 'admin' ? estudioId : null, busca);
  const queryProfessor = useMeusAlunos(papel === 'professor' ? professorId : null, estudioId, busca);
  const { data: alunos, isLoading, isError, refetch } = papel === 'admin' ? queryAdmin : queryProfessor;

  return (
    <View className="flex-1" style={{ backgroundColor: '#FDF8F5' }}>
      <View className="px-5 pt-4 pb-2">
        <Display style={{ fontSize: 24 }}>{papel === 'admin' ? 'Alunos' : 'Meus alunos'}</Display>
      </View>

      <View className="px-5 pb-2">
        <View className="flex-row items-center border border-gray-200 rounded-2xl px-3 bg-white">
          <Search size={16} color="#9ca3af" />
          <TextInput
            className="flex-1 px-2 py-3 text-sm"
            placeholder="Buscar por nome..."
            value={busca}
            onChangeText={setBusca}
          />
        </View>
      </View>

      {isLoading ? (
        <LoadingState label="Carregando alunos..." />
      ) : isError ? (
        <View className="px-5"><ErrorState mensagem="Não foi possível carregar os alunos." onRetry={() => refetch()} /></View>
      ) : !alunos || alunos.length === 0 ? (
        <View className="px-5">
          <EmptyState
            titulo="Nenhum aluno encontrado"
            descricao={papel === 'admin' ? 'Nenhum aluno ativo no estúdio ainda.' : 'Você ainda não tem alunos nas suas modalidades.'}
          />
        </View>
      ) : (
        <FlatList
          data={alunos}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 20, paddingTop: 8 }}
          renderItem={({ item }) => <LinhaAluno aluno={item} />}
        />
      )}
    </View>
  );
}
```

- [ ] **Step 2: Checar tipos**

Run: `cd mobile-pro && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add mobile-pro/src/screens/Alunos
git commit -m "feat(mobile-pro): tela de alunos (gestor: todos, instrutor: meus alunos)"
```

---

## Task 12: Telas de Financeiro

**Files:**
- Modify: `mobile-pro/src/screens/Financeiro/FinanceiroScreen.tsx` (substitui o stub da Tarefa 8)
- Create: `mobile-pro/src/screens/Financeiro/InadimplenciaAdmin.tsx`
- Create: `mobile-pro/src/screens/Financeiro/RepassesProfessor.tsx`

**Interfaces:**
- Consumes: `useSessaoAtual` (`@/features/auth`), `useInadimplencia`, `useRepassesProfessor` (`@/features/financeiro`).

- [ ] **Step 1: Criar `InadimplenciaAdmin.tsx`**

```tsx
// mobile-pro/src/screens/Financeiro/InadimplenciaAdmin.tsx
import React from 'react';
import { FlatList, Linking, Text, View } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { useInadimplencia } from '@/features/financeiro';
import { Card, Display, EmptyState, ErrorState, LoadingState } from '@/components/ui';

function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function gerarLinkWhatsApp(telefone: string | null | undefined, mensagem: string): string | null {
  const num = (telefone ?? '').replace(/\D/g, '');
  if (!num) return null;
  return `https://wa.me/55${num}?text=${encodeURIComponent(mensagem)}`;
}

export default function InadimplenciaAdmin({ estudioId }: { estudioId: string }) {
  const { data: itens, isLoading, isError, refetch } = useInadimplencia(estudioId);

  if (isLoading) return <LoadingState label="Carregando inadimplência..." />;
  if (isError || !itens) {
    return (
      <View className="flex-1 justify-center px-6" style={{ backgroundColor: '#FDF8F5' }}>
        <ErrorState mensagem="Não foi possível carregar a inadimplência." onRetry={() => refetch()} />
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#FDF8F5' }}>
      <View className="px-5 pt-4 pb-2">
        <Display style={{ fontSize: 24 }}>Inadimplência</Display>
      </View>
      {itens.length === 0 ? (
        <View className="px-5"><EmptyState titulo="Tudo em dia" descricao="Nenhum pagamento em atraso no momento." /></View>
      ) : (
        <FlatList
          data={itens}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 20, paddingTop: 8 }}
          renderItem={({ item }) => {
            const link = gerarLinkWhatsApp(
              item.alunos?.telefone,
              `Olá, ${item.alunos?.nome_completo?.split(' ')[0] ?? ''}! Seu pagamento de ${formatarMoeda(Number(item.valor_pago ?? 0))} está em aberto. Podemos verificar juntos?`
            );
            return (
              <Card className="mb-3">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-3">
                    <Text className="text-sm font-bold text-gray-800">{item.alunos?.nome_completo ?? '—'}</Text>
                    <Text className="text-xs text-gray-400 mt-1">
                      Venc: {new Date(`${item.data_vencimento}T12:00:00`).toLocaleDateString('pt-BR')} · {formatarMoeda(Number(item.valor_pago ?? 0))}
                    </Text>
                  </View>
                  {link && (
                    <Text onPress={() => Linking.openURL(link)} style={{ color: '#16a34a' }} className="text-xs font-bold">
                      <MessageCircle size={13} /> Cobrar
                    </Text>
                  )}
                </View>
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}
```

- [ ] **Step 2: Criar `RepassesProfessor.tsx`**

```tsx
// mobile-pro/src/screens/Financeiro/RepassesProfessor.tsx
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useRepassesProfessor } from '@/features/financeiro';
import { useThemeStore } from '@/lib/theme';
import { Badge, Card, Display, EmptyState, ErrorState, LoadingState } from '@/components/ui';

function mesAnoAtual() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
function navegarMes(mesAno: string, delta: number) {
  const [ano, mes] = mesAno.split('-').map(Number);
  const d = new Date(ano, mes - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function mesAnoLabel(mesAno: string) {
  const [ano, mes] = mesAno.split('-').map(Number);
  return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}
function formatarMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function RepassesProfessor({ estudioId, professorId }: { estudioId: string; professorId: number | null }) {
  const { tokens } = useThemeStore();
  const [mesAno, setMesAno] = useState(mesAnoAtual);
  const { data: repasses, isLoading, isError, refetch } = useRepassesProfessor(professorId, estudioId, mesAno);

  const kpis = useMemo(() => {
    if (!repasses) return { total: 0, qtdPaga: 0, qtdPendente: 0 };
    return repasses.reduce(
      (acc, r) => {
        acc.total += r.valor ?? 0;
        if (r.status === 'pago') acc.qtdPaga += 1;
        else acc.qtdPendente += 1;
        return acc;
      },
      { total: 0, qtdPaga: 0, qtdPendente: 0 }
    );
  }, [repasses]);

  const podeFuturo = mesAno < mesAnoAtual();

  if (isLoading) return <LoadingState label="Carregando repasses..." />;
  if (isError || !repasses) {
    return (
      <View className="flex-1 justify-center px-6" style={{ backgroundColor: '#FDF8F5' }}>
        <ErrorState mensagem="Não foi possível carregar seus repasses." onRetry={() => refetch()} />
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#FDF8F5' }}>
      <View className="px-5 pt-4 pb-2">
        <Display style={{ fontSize: 24 }}>Meus repasses</Display>
        <View className="flex-row items-center gap-3 mt-2">
          <Pressable onPress={() => setMesAno((m) => navegarMes(m, -1))}><ChevronLeft color={tokens.pri} size={20} /></Pressable>
          <Text className="text-sm font-bold text-gray-700 capitalize">{mesAnoLabel(mesAno)}</Text>
          <Pressable disabled={!podeFuturo} onPress={() => setMesAno((m) => navegarMes(m, 1))}>
            <ChevronRight color={podeFuturo ? tokens.pri : '#d1d5db'} size={20} />
          </Pressable>
        </View>
      </View>

      <View className="px-5 pb-2">
        <Card>
          <View className="flex-row justify-between">
            <View>
              <Text className="text-xs text-gray-400">Total a receber</Text>
              <Display style={{ fontSize: 18 }}>{formatarMoeda(kpis.total)}</Display>
            </View>
            <View>
              <Text className="text-xs text-gray-400">Pago / Pendente</Text>
              <Display style={{ fontSize: 18 }}>{kpis.qtdPaga} / {kpis.qtdPendente}</Display>
            </View>
          </View>
        </Card>
      </View>

      {repasses.length === 0 ? (
        <View className="px-5"><EmptyState titulo="Nenhum repasse" descricao={`Seus repasses de ${mesAnoLabel(mesAno)} aparecem aqui após o fechamento do mês.`} /></View>
      ) : (
        <FlatList
          data={repasses}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ padding: 20, paddingTop: 8 }}
          renderItem={({ item }) => (
            <Card className="mb-3">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-3">
                  <Text className="text-sm font-bold text-gray-800">{item.alunos?.nome_completo ?? '—'}</Text>
                  <Text className="text-xs text-gray-400 mt-1">{item.modalidade ?? '—'}</Text>
                </View>
                <View className="items-end">
                  <Text className="text-sm font-bold text-gray-800">{formatarMoeda(item.valor)}</Text>
                  <Badge tone={item.status === 'pago' ? 'ok' : 'warn'}>{item.status === 'pago' ? 'Pago' : 'Pendente'}</Badge>
                </View>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}
```

- [ ] **Step 3: Reescrever `FinanceiroScreen.tsx`**

```tsx
// mobile-pro/src/screens/Financeiro/FinanceiroScreen.tsx
import React from 'react';
import { useSessaoAtual } from '@/features/auth';
import InadimplenciaAdmin from '@/screens/Financeiro/InadimplenciaAdmin';
import RepassesProfessor from '@/screens/Financeiro/RepassesProfessor';

export default function FinanceiroScreen() {
  const { papel, estudioId, professorId } = useSessaoAtual();
  return papel === 'admin'
    ? <InadimplenciaAdmin estudioId={estudioId} />
    : <RepassesProfessor estudioId={estudioId} professorId={professorId} />;
}
```

- [ ] **Step 4: Checar tipos**

Run: `cd mobile-pro && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add mobile-pro/src/screens/Financeiro
git commit -m "feat(mobile-pro): financeiro por papel (inadimplencia do gestor, repasses do instrutor)"
```

---

## Task 13: Tela de Perfil

**Files:**
- Modify: `mobile-pro/src/screens/Perfil/PerfilScreen.tsx` (substitui o stub da Tarefa 8)

**Interfaces:**
- Consumes: `useSessaoAtual`, `sair` (`@/features/auth`), `useEstudio` (`@/features/estudio`).

- [ ] **Step 1: Implementar**

```tsx
// mobile-pro/src/screens/Perfil/PerfilScreen.tsx
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSessaoAtual, sair } from '@/features/auth';
import { useEstudio } from '@/features/estudio';
import { Body, Button, Card, Display } from '@/components/ui';

const LABEL_PAPEL: Record<'admin' | 'professor', string> = {
  admin: 'Gestor(a)',
  professor: 'Instrutor(a)',
};

export default function PerfilScreen() {
  const { papel, estudioId, nomeUsuario } = useSessaoAtual();
  const { data: estudio } = useEstudio(estudioId);

  return (
    <ScrollView className="flex-1" style={{ backgroundColor: '#FDF8F5' }} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Card>
        <Display style={{ fontSize: 18 }}>{nomeUsuario ?? LABEL_PAPEL[papel]}</Display>
        <Body style={{ color: '#9ca3af', marginTop: 2 }}>{LABEL_PAPEL[papel]}</Body>
        <View className="mt-4">
          <Text className="text-xs text-gray-400 mb-1">Estúdio</Text>
          <Text className="text-gray-700 font-semibold">{estudio?.nome ?? 'Carregando...'}</Text>
        </View>
      </Card>

      <Button variant="outline" onPress={sair}>Sair</Button>
    </ScrollView>
  );
}
```

- [ ] **Step 2: Checar tipos**

Run: `cd mobile-pro && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add mobile-pro/src/screens/Perfil
git commit -m "feat(mobile-pro): tela de perfil (dados basicos + logout)"
```

---

## Task 14: README e verificação final

**Files:**
- Create: `mobile-pro/README.md`

**Interfaces:**
- Nenhuma — tarefa de documentação e verificação, não introduz código novo.

- [ ] **Step 1: Criar `mobile-pro/README.md` (mesmo formato de `mobile/README.md`)**

```markdown
# Nexofy Mobile PRO — Gestor & Instrutor

App React Native (Expo) dedicado a gestor (`admin`) e instrutor (`professor`)
— espelha o modelo "Next Fit Pro" do concorrente. Fala direto com o Supabase
do backend do Nexofy, mesmas credenciais do webapp — sem API intermediária e
sem nenhuma mudança de backend.

Design completo em [`docs/superpowers/specs/2026-09-15-app-mobile-pro-gestor-instrutor-design.md`](../docs/superpowers/specs/2026-09-15-app-mobile-pro-gestor-instrutor-design.md).

## Setup

\`\`\`bash
cd mobile-pro
npm install
cp .env.example .env   # preencher com o projeto Supabase de staging
npx expo start
\`\`\`

## Status do V1

- [x] Scaffold (config, tema dinâmico, navegação por papel, tipos)
- [x] Resolução de papel (admin/professor) via `estudio_membros`, bloqueio de papéis não suportados
- [x] Dashboard (gestor: KPIs + inadimplência · instrutor: aulas do dia + resumo de comissões)
- [x] Agenda + Chamada (check-in/falta/desfazer) — reaproveita RLS e RPCs já existentes
- [x] Alunos (gestor: todos · instrutor: meus alunos)
- [x] Financeiro (gestor: inadimplência + cobrar via WhatsApp · instrutor: meus repasses)
- [x] Perfil (dados básicos + logout)
- [ ] Testar em device/simulador (`npm install && npx expo start`)
- [ ] Promover para produção depois de validar em staging

## Fora do escopo do V1

Treinos/WOD, Comandas, Leads/funil de vendas no mobile (Linear PED-197,
PED-198, PED-199), criar/editar aula, feriados, espaços, lançar pagamento
manual, gerar repasses mensais, criar/editar aluno.
```

- [ ] **Step 2: Verificação final — checagem de tipos e testes de todo o projeto**

Run: `cd mobile-pro && npx tsc --noEmit && npx jest`
Expected: `tsc` sem erros; `jest` com os 8 testes de `chamada.test.ts` passando.

- [ ] **Step 3: Commit**

```bash
git add mobile-pro/README.md
git commit -m "docs(mobile-pro): README com status do V1 e link para a spec"
```

- [ ] **Step 4: Teste manual em device/simulador (checklist, não automatizável)**

Rodar `npx expo start` dentro de `mobile-pro/`, abrir no Expo Go (ou simulador
iOS/Android) apontando pro projeto Supabase de **staging**, e confirmar
manualmente:
1. Login com um usuário `admin` de staging → cai na Dashboard do gestor.
2. Login com um usuário `professor` de staging → cai na Dashboard do instrutor.
3. Login com um usuário `aluno` de staging → cai na tela de bloqueio de papel.
4. Agenda mostra as aulas certas por papel; abrir uma aula e marcar presença/falta/desfazer funciona e reflete na lista.
5. Alunos, Financeiro e Perfil carregam sem erro pros dois papéis.
6. Tema do estúdio (cor/logo) aplica corretamente.

Isso substitui testes automatizados de UI — mesma limitação de infraestrutura do `mobile/` (ver Global Constraints).
