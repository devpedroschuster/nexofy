# LGPD: gate de aceite + registro de consentimento + textos de saúde — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar 4 achados da auditoria LGPD (PED-135, 136, 137, 138): o cadastro via Google não respeita o checkbox de Termos/Privacidade, nenhum aceite é persistido em lugar nenhum, dado de saúde de alunos (observações médicas / anamnese) não tem base legal nem menção na Política, e os documentos legais não têm data de vigência/versão.

**Architecture:** Um par de helpers puros (`webapp/src/lib/consentimento.js`) constrói/valida o payload de consentimento pendente. Para o caminho e-mail/senha, a versão aceita viaja em `options.data` no `signUp()` e uma trigger em `auth.users` (nova migration) grava em `public.consentimentos` no exato momento em que a linha de auth é criada — não depende de sessão. Para o caminho Google (sem `options.data` disponível em `signInWithOAuth`), o clique grava um marcador em `sessionStorage` *antes* do redirect; ao voltar autenticado, `useAuth.jsx` (único listener global de `SIGNED_IN`) lê o marcador e insere via client autenticado (RLS: só a própria linha). O gate de aceite (PED-135) vira um "soft gate": o botão do Google continua clicável, mas o clique só dispara OAuth se `aceitaTermos` for `true` — senão chama `onBlocked` e mostra o mesmo erro inline do formulário. `/login` não passa nenhuma dessas props novas, então seu botão do Google continua sem gate, como hoje.

**Tech Stack:** React 18 + Vite (webapp), Supabase (Postgres + Auth + RLS), Vitest para testes de unidade de funções puras (não há testes de componente React neste repo — convenção existente, mantida).

**Spec:** Linear PED-135, PED-136, PED-137, PED-138 (auditoria pré-flight de Segurança & Compliance, 2026-09-03).

## Global Constraints

- Zero downtime / zero breaking change em `/login` — o gate de Termos vale só em `/cadastro`.
- Nenhuma tabela nova sem RLS habilitada (convenção do projeto: toda tabela em `public` tem `rls_enabled = true`).
- Nenhuma migration com `GRANT` explícito — o projeto usa apenas RLS sobre os privilégios default do schema (confirmado: nenhuma migration existente tem `GRANT`).
- Toda migration destrutiva ou de schema novo ganha um par em `supabase/migrations-down/` com o mesmo timestamp (convenção documentada em `supabase/migrations-down/README.md`).
- Versão dos documentos legais: string `'2026-09-03'` (data de hoje), única fonte em `DOCUMENTOS_LEGAIS` (`webapp/src/lib/constants.js`).
- Projeto Supabase alvo: aplicar primeiro em staging (`qjmybxkfjkxttggdjxga` — "Nexofy - staging", é o que `webapp/.env` aponta) e, depois de validado, replicar em produção (`tciiepqmnrrcjnqhspvw` — "Nexofy - production").
- Não remover o banner "isso é rascunho" de Termos/Política — a correção mínima pedida pela PED-138 é só a linha de vigência/versão; o texto final depende de revisão jurídica fora de escopo deste plano.
- Não alterar/remover a coluna `alunos.observacoes_medicas` (item 4 da PED-137 é uma avaliação de produto, não uma ação de código — fica só como recomendação no PR, não implementada aqui).

---

## File Structure

- **Create:** `webapp/src/lib/consentimento.js` — helpers puros: monta e valida o payload `{ termos_versao, privacidade_versao }` guardado em `sessionStorage` no caminho Google.
- **Create:** `webapp/src/lib/consentimento.test.js` — testes de unidade dos helpers acima.
- **Create:** `supabase/migrations/20260903210000_create_consentimentos.sql` — tabela `public.consentimentos`, RLS, trigger em `auth.users`.
- **Create:** `supabase/migrations-down/20260903210000_create_consentimentos.sql` — reverte a migration acima.
- **Modify:** `webapp/src/lib/constants.js` — adiciona `DOCUMENTOS_LEGAIS`.
- **Modify:** `webapp/src/components/shared/EntrarComGoogle.jsx` — novas props `disabled`, `onBlocked`, `consentimentoPendente`.
- **Modify:** `webapp/src/pages/Cadastro.jsx` — move o checkbox pra fora do `<form>`, acima do botão do Google; passa versão do consentimento no `signUp()` e no `EntrarComGoogle`.
- **Modify:** `webapp/src/hooks/useAuth.jsx` — consome o marcador de consentimento pendente no evento `SIGNED_IN`.
- **Modify:** `webapp/src/pages/PoliticaPrivacidade.jsx` — linha de vigência/versão + seção sobre dado de saúde de alunos.
- **Modify:** `webapp/src/pages/TermosDeUso.jsx` — linha de vigência/versão + cláusula controlador (estúdio) / operador (Nexofy).
- **Modify:** `webapp/src/pages/PerfilAluno.jsx` (`AbaAnamnese`) — aviso de dado sensível acima dos campos de anamnese/observações médicas.

## Interfaces produzidas (para as tarefas que vêm depois)

- `construirConsentimentoPendente(): { termos_versao: string, privacidade_versao: string }`
- `parseConsentimentoPendente(bruto: string | null): { termos_versao: string, privacidade_versao: string } | null`
- `CONSENTIMENTO_PENDENTE_KEY: string` (chave do `sessionStorage`)
- `DOCUMENTOS_LEGAIS.TERMOS.versao` / `DOCUMENTOS_LEGAIS.PRIVACIDADE.versao`: `string`
- `<EntrarComGoogle disabled? onBlocked? consentimentoPendente? texto? className? />`

---

### Task 1: Constante de versionamento dos documentos legais (PED-138)

**Files:**
- Modify: `webapp/src/lib/constants.js`
- Modify: `webapp/src/pages/TermosDeUso.jsx`
- Modify: `webapp/src/pages/PoliticaPrivacidade.jsx`

**Interfaces:**
- Produces: `DOCUMENTOS_LEGAIS.TERMOS.{versao,vigenteDesde}`, `DOCUMENTOS_LEGAIS.PRIVACIDADE.{versao,vigenteDesde}`

- [ ] **Step 1: Adicionar `DOCUMENTOS_LEGAIS` em `constants.js`**

Logo abaixo do bloco `LINKS`:

```js
// ── DOCUMENTOS_LEGAIS ────────────────────────────────────────────────────
// Fonte única de versão/vigência de Termos e Política — referenciada pelas
// próprias páginas (linha de vigência) e pelo registro de consentimento
// (public.consentimentos.versao), para que um aceite antigo nunca seja
// confundido com a versão vigente do texto (PED-136, PED-138).
export const DOCUMENTOS_LEGAIS = {
  TERMOS:      { versao: '2026-09-03', vigenteDesde: '2026-09-03' },
  PRIVACIDADE: { versao: '2026-09-03', vigenteDesde: '2026-09-03' },
};
```

E no `export default` do fim do arquivo, adicionar `DOCUMENTOS_LEGAIS` à lista exportada.

- [ ] **Step 2: Exibir vigência em `TermosDeUso.jsx`**

Importar `DOCUMENTOS_LEGAIS` e inserir logo abaixo do `<h1>`:

```jsx
import { LINKS, DOCUMENTOS_LEGAIS } from '../lib/constants';
```

```jsx
<h1 className="font-display mt-8 text-3xl font-bold tracking-tight">Termos de Uso</h1>
<p className="mt-2 text-xs font-medium text-muted-foreground">
  Versão {DOCUMENTOS_LEGAIS.TERMOS.versao} · vigente desde{' '}
  {new Date(`${DOCUMENTOS_LEGAIS.TERMOS.vigenteDesde}T00:00:00`).toLocaleDateString('pt-BR')}
</p>
```

- [ ] **Step 3: Mesmo padrão em `PoliticaPrivacidade.jsx`**

```jsx
import { LINKS, DOCUMENTOS_LEGAIS } from '../lib/constants';
```

```jsx
<h1 className="font-display mt-8 text-3xl font-bold tracking-tight">Política de Privacidade</h1>
<p className="mt-2 text-xs font-medium text-muted-foreground">
  Versão {DOCUMENTOS_LEGAIS.PRIVACIDADE.versao} · vigente desde{' '}
  {new Date(`${DOCUMENTOS_LEGAIS.PRIVACIDADE.vigenteDesde}T00:00:00`).toLocaleDateString('pt-BR')}
</p>
```

- [ ] **Step 4: Rodar lint**

Run: `npm --prefix webapp run lint`
Expected: sem novos erros nos 3 arquivos tocados.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/constants.js webapp/src/pages/TermosDeUso.jsx webapp/src/pages/PoliticaPrivacidade.jsx
git commit -m "feat(lgpd): adiciona versao/vigencia de Termos e Politica (PED-138)"
```

---

### Task 2: Helpers puros de consentimento pendente (base de PED-136)

**Files:**
- Create: `webapp/src/lib/consentimento.js`
- Test: `webapp/src/lib/consentimento.test.js`

**Interfaces:**
- Consumes: `DOCUMENTOS_LEGAIS` (Task 1)
- Produces: `construirConsentimentoPendente()`, `parseConsentimentoPendente(bruto)`, `CONSENTIMENTO_PENDENTE_KEY`

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `webapp/src/lib/consentimento.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  construirConsentimentoPendente,
  parseConsentimentoPendente,
  CONSENTIMENTO_PENDENTE_KEY,
} from './consentimento';
import { DOCUMENTOS_LEGAIS } from './constants';

describe('construirConsentimentoPendente', () => {
  it('retorna as versões vigentes de termos e privacidade', () => {
    expect(construirConsentimentoPendente()).toEqual({
      termos_versao: DOCUMENTOS_LEGAIS.TERMOS.versao,
      privacidade_versao: DOCUMENTOS_LEGAIS.PRIVACIDADE.versao,
    });
  });
});

describe('parseConsentimentoPendente', () => {
  it('faz round-trip com o que construirConsentimentoPendente gera', () => {
    const original = construirConsentimentoPendente();
    const bruto = JSON.stringify(original);
    expect(parseConsentimentoPendente(bruto)).toEqual(original);
  });

  it('retorna null para null/undefined/string vazia', () => {
    expect(parseConsentimentoPendente(null)).toBeNull();
    expect(parseConsentimentoPendente(undefined)).toBeNull();
    expect(parseConsentimentoPendente('')).toBeNull();
  });

  it('retorna null para JSON inválido', () => {
    expect(parseConsentimentoPendente('{não é json')).toBeNull();
  });

  it('retorna null quando faltam campos ou têm tipo errado', () => {
    expect(parseConsentimentoPendente(JSON.stringify({ termos_versao: '2026-09-03' }))).toBeNull();
    expect(parseConsentimentoPendente(JSON.stringify({ termos_versao: 1, privacidade_versao: '2026-09-03' }))).toBeNull();
    expect(parseConsentimentoPendente(JSON.stringify('string solta'))).toBeNull();
  });

  it('exporta uma chave de sessionStorage estável', () => {
    expect(CONSENTIMENTO_PENDENTE_KEY).toBe('nexofy_consentimento_pendente');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm --prefix webapp run test -- src/lib/consentimento.test.js`
Expected: FAIL — `Cannot find module './consentimento'`

- [ ] **Step 3: Implementar `consentimento.js`**

```js
// src/lib/consentimento.js
// Consentimento de Termos/Privacidade no fluxo de cadastro via Google
// (PED-135, PED-136). No caminho e-mail/senha a versão aceita viaja em
// options.data do signUp() e uma trigger em auth.users grava direto em
// public.consentimentos — não precisa deste módulo. Mas signInWithOAuth()
// não aceita metadata customizada, então aqui o clique grava um marcador
// em sessionStorage ANTES do redirect pro Google; ao voltar autenticado,
// useAuth.jsx lê esse marcador (parseConsentimentoPendente) e insere via
// client autenticado, já com RLS garantindo user_id = auth.uid().
import { DOCUMENTOS_LEGAIS } from './constants';

export const CONSENTIMENTO_PENDENTE_KEY = 'nexofy_consentimento_pendente';

export function construirConsentimentoPendente() {
  return {
    termos_versao: DOCUMENTOS_LEGAIS.TERMOS.versao,
    privacidade_versao: DOCUMENTOS_LEGAIS.PRIVACIDADE.versao,
  };
}

export function parseConsentimentoPendente(bruto) {
  if (!bruto) return null;

  let dados;
  try {
    dados = JSON.parse(bruto);
  } catch {
    return null;
  }

  if (!dados || typeof dados !== 'object') return null;

  const { termos_versao, privacidade_versao } = dados;
  if (typeof termos_versao !== 'string' || !termos_versao) return null;
  if (typeof privacidade_versao !== 'string' || !privacidade_versao) return null;

  return { termos_versao, privacidade_versao };
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm --prefix webapp run test -- src/lib/consentimento.test.js`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/consentimento.js webapp/src/lib/consentimento.test.js
git commit -m "feat(lgpd): helpers puros de consentimento pendente para o fluxo Google (PED-136)"
```

---

### Task 3: Tabela `consentimentos` + trigger de auth.users (PED-136)

**Files:**
- Create: `supabase/migrations/20260903210000_create_consentimentos.sql`
- Create: `supabase/migrations-down/20260903210000_create_consentimentos.sql`

- [ ] **Step 1: Escrever a migration "up"**

```sql
-- supabase/migrations/20260903210000_create_consentimentos.sql
--
-- PED-136: registra o aceite de Termos de Uso / Política de Privacidade
-- no momento da criação da conta, com identificação do titular, timestamp
-- e versão do documento — hoje isso não existia em lugar nenhum (o
-- aceitaTermos do Cadastro.jsx era um useState que morria no unmount).
--
-- Append-only de propósito: sem policy de UPDATE/DELETE. É registro de
-- prova de consentimento (art. 8º §2º LGPD) — alterar ou apagar uma linha
-- depois de criada destruiria o próprio valor probatório do registro. Um
-- reaceite (ex: nova versão do texto) é sempre uma linha NOVA, nunca um
-- update na antiga.

create table if not exists public.consentimentos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  documento   text not null check (documento in ('termos', 'privacidade')),
  versao      text not null,
  aceito_em   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists idx_consentimentos_user_id on public.consentimentos(user_id);

alter table public.consentimentos enable row level security;

create policy "consentimentos_select_own"
  on public.consentimentos
  for select
  to authenticated
  using (user_id = auth.uid());

create policy "consentimentos_insert_own"
  on public.consentimentos
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Caminho e-mail/senha (Cadastro.jsx signUp): a versão aceita viaja em
-- options.data (raw_user_meta_data) e esta trigger grava direto em
-- public.consentimentos no momento em que auth.users ganha a linha —
-- funciona mesmo com o e-mail ainda não confirmado, sem depender de sessão.
-- (Caminho Google: signInWithOAuth não aceita metadata customizada, por
-- isso aquele caminho é resolvido no client, em useAuth.jsx, não aqui.)
create or replace function public.handle_new_user_consentimento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.raw_user_meta_data ? 'termos_versao')
     and (new.raw_user_meta_data->>'termos_versao' <> '') then
    insert into public.consentimentos (user_id, documento, versao)
    values (new.id, 'termos', new.raw_user_meta_data->>'termos_versao');
  end if;

  if (new.raw_user_meta_data ? 'privacidade_versao')
     and (new.raw_user_meta_data->>'privacidade_versao' <> '') then
    insert into public.consentimentos (user_id, documento, versao)
    values (new.id, 'privacidade', new.raw_user_meta_data->>'privacidade_versao');
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_consentimento on auth.users;

create trigger on_auth_user_created_consentimento
  after insert on auth.users
  for each row execute function public.handle_new_user_consentimento();
```

- [ ] **Step 2: Escrever a migration "down"**

```sql
-- supabase/migrations-down/20260903210000_create_consentimentos.sql
drop trigger if exists on_auth_user_created_consentimento on auth.users;
drop function if exists public.handle_new_user_consentimento();
drop table if exists public.consentimentos;
```

- [ ] **Step 3: Aplicar em staging via MCP do Supabase**

Usar `apply_migration` (project_id `qjmybxkfjkxttggdjxga`, nome `create_consentimentos`, com o SQL do Step 1).

- [ ] **Step 4: Verificar no staging**

Rodar `list_tables` (schema `public`, verbose) e confirmar `consentimentos` com `rls_enabled: true`; rodar `get_advisors` (tipo `security`) e confirmar que não surgiu nenhum aviso novo sobre a tabela/trigger nova.

- [ ] **Step 5: Testar o trigger manualmente em staging**

Criar um usuário de teste via signUp com `options.data` incluindo `termos_versao`/`privacidade_versao` (feito na prática no Task 10, testando a UI) e confirmar com `execute_sql`:

```sql
select documento, versao, aceito_em from public.consentimentos order by aceito_em desc limit 5;
```

Expected: linhas aparecem para o usuário recém-criado.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260903210000_create_consentimentos.sql supabase/migrations-down/20260903210000_create_consentimentos.sql
git commit -m "feat(lgpd): tabela consentimentos + trigger auth.users (PED-136)"
```

---

### Task 4: Gate de aceite no `EntrarComGoogle` (PED-135 + caminho Google de PED-136)

**Files:**
- Modify: `webapp/src/components/shared/EntrarComGoogle.jsx`

**Interfaces:**
- Consumes: `CONSENTIMENTO_PENDENTE_KEY` (Task 2)
- Produces: props `disabled`, `onBlocked`, `consentimentoPendente` (consumidas na Task 5, por `Cadastro.jsx`)

- [ ] **Step 1: Adicionar as 3 props novas com defaults que preservam o comportamento atual**

```jsx
import { CONSENTIMENTO_PENDENTE_KEY } from '../../lib/consentimento';

export default function EntrarComGoogle({
  texto = 'Continuar com Google',
  className,
  disabled = false,
  onBlocked,
  consentimentoPendente,
}) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (loading) return;

    // Gate "soft": o botão continua clicável (assim o clique consegue
    // revelar o erro inline de Termos, igual ao submit do form) — só
    // bloqueia o INÍCIO do OAuth. /login não passa `disabled`, então este
    // ramo nunca roda lá.
    if (disabled) {
      onBlocked?.();
      return;
    }

    setLoading(true);
    try {
      // Marca a intenção de aceite ANTES do redirect: signInWithOAuth()
      // não aceita metadata customizada (diferente de signUp()), então é
      // assim que a versão aceita sobrevive à ida-e-volta pro Google.
      // useAuth.jsx lê e apaga este marcador no primeiro SIGNED_IN.
      if (consentimentoPendente) {
        try {
          sessionStorage.setItem(CONSENTIMENTO_PENDENTE_KEY, JSON.stringify(consentimentoPendente));
        } catch {
          // sessionStorage indisponível (modo privado restritivo etc.) —
          // segue sem marcador; pior caso é só não registrar o
          // consentimento do caminho Google, não bloquear o login.
        }
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/login` },
      });
      if (error) throw error;
    } catch (err) {
      console.error('[EntrarComGoogle] Falha ao iniciar login com Google:', err);
      showToast.error('Não foi possível conectar com o Google. Tente novamente.');
      setLoading(false);
    }
  }
```

(o resto do componente — JSX do botão/divisor — não muda.)

- [ ] **Step 2: Rodar lint**

Run: `npm --prefix webapp run lint -- src/components/shared/EntrarComGoogle.jsx`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/components/shared/EntrarComGoogle.jsx
git commit -m "feat(lgpd): EntrarComGoogle ganha gate de aceite e marcador de consentimento (PED-135)"
```

---

### Task 5: Mover o checkbox e conectar o gate em `Cadastro.jsx` (PED-135 + PED-136)

**Files:**
- Modify: `webapp/src/pages/Cadastro.jsx`

**Interfaces:**
- Consumes: `construirConsentimentoPendente()` (Task 2), `<EntrarComGoogle disabled onBlocked consentimentoPendente>` (Task 4)

- [ ] **Step 1: Import do helper**

```jsx
import { construirConsentimentoPendente } from '../lib/consentimento';
```

- [ ] **Step 2: Mover o bloco do checkbox pra fora do `<form>`, acima do `EntrarComGoogle`**

Trocar o trecho atual (linhas ~207-306, resumido abaixo) para: checkbox ANTES do `EntrarComGoogle`, form sem o checkbox.

```jsx
<>
  <div>
    <label className="flex items-start gap-2.5 text-xs text-muted-foreground leading-relaxed">
      <input
        type="checkbox"
        checked={aceitaTermos}
        onChange={(e) => { setAceitaTermos(e.target.checked); limparErro('termos'); }}
        aria-invalid={Boolean(erros.termos)}
        aria-describedby={erros.termos ? 'erro-termos' : undefined}
        className="mt-0.5 size-4 shrink-0 rounded border-input accent-primary"
      />
      <span>
        Li e aceito os{' '}
        <a href={LINKS.TERMOS} target="_blank" rel="noreferrer" className="font-semibold text-foreground hover:underline">
          Termos de Uso
        </a>{' '}
        e a{' '}
        <a href={LINKS.PRIVACIDADE} target="_blank" rel="noreferrer" className="font-semibold text-foreground hover:underline">
          Política de Privacidade
        </a>{' '}
        do Nexofy.
      </span>
    </label>
    <ErrorMessage id="erro-termos">{erros.termos}</ErrorMessage>
  </div>

  <EntrarComGoogle
    disabled={!aceitaTermos}
    onBlocked={() => setErros((e) => ({ ...e, termos: 'Aceite os Termos e a Política de Privacidade para continuar.' }))}
    consentimentoPendente={construirConsentimentoPendente()}
  />

  <form onSubmit={handleSubmit} className="space-y-4" noValidate>
    <div className="space-y-3">
      {/* campos nome/email/senha inalterados */}
    </div>

    <Button type="submit" variant="premium" size="lg" fullWidth loading={loading} rightIcon={<ArrowRight size={18} />}>
      Continuar
    </Button>

    <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
      <ShieldCheck size={13} className="text-success" /> 14 dias grátis, sem cartão
    </p>
  </form>
</>
```

`validar()` continua checando `aceitaTermos` normalmente pro submit do form — nada muda ali.

- [ ] **Step 3: Passar a versão aceita no `signUp()`**

```jsx
const { data, error } = await supabase.auth.signUp({
  email: email.trim().toLowerCase(),
  password: senha,
  options: {
    data: {
      nome: nome.trim().slice(0, LIMITES.NOME_MAX),
      ...construirConsentimentoPendente(),
    },
    emailRedirectTo: `${window.location.origin}/cadastro/estudio`,
  },
});
```

- [ ] **Step 4: Rodar lint**

Run: `npm --prefix webapp run lint -- src/pages/Cadastro.jsx`
Expected: sem erros novos.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/pages/Cadastro.jsx
git commit -m "fix(lgpd): cadastro via Google agora respeita o aceite de Termos (PED-135)"
```

---

### Task 6: Consumir o marcador de consentimento pendente em `useAuth.jsx` (fecha PED-136 para Google)

**Files:**
- Modify: `webapp/src/hooks/useAuth.jsx`

**Interfaces:**
- Consumes: `parseConsentimentoPendente`, `CONSENTIMENTO_PENDENTE_KEY` (Task 2)

- [ ] **Step 1: Import**

```jsx
import { parseConsentimentoPendente, CONSENTIMENTO_PENDENTE_KEY } from '../lib/consentimento';
```

- [ ] **Step 2: Helper local + chamada no ramo `SIGNED_IN`**

Dentro de `AuthProvider`, antes do `useEffect` principal (ou no topo do próprio efeito, junto dos outros helpers locais):

```jsx
// Fecha o caminho Google do PED-136: signInWithOAuth() não aceita
// metadata customizada, então EntrarComGoogle.jsx grava um marcador em
// sessionStorage antes do redirect (só quando a Cadastro.jsx passou
// consentimentoPendente, ou seja, só no cadastro via Google — nunca em
// /login). Aqui, no primeiro SIGNED_IN, lemos e apagamos esse marcador e
// gravamos em consentimentos via client autenticado (RLS garante
// user_id = auth.uid()). Fire-and-forget: não deve atrasar nem quebrar o
// carregamento de perfil se falhar.
function registrarConsentimentoPendente(session) {
  if (!session?.user) return;

  let bruto = null;
  try {
    bruto = sessionStorage.getItem(CONSENTIMENTO_PENDENTE_KEY);
  } catch {
    return;
  }
  if (!bruto) return;

  try {
    sessionStorage.removeItem(CONSENTIMENTO_PENDENTE_KEY);
  } catch {
    // segue mesmo assim — pior caso é tentar de novo no próximo SIGNED_IN
  }

  const dados = parseConsentimentoPendente(bruto);
  if (!dados) return;

  supabase
    .from('consentimentos')
    .insert([
      { user_id: session.user.id, documento: 'termos', versao: dados.termos_versao },
      { user_id: session.user.id, documento: 'privacidade', versao: dados.privacidade_versao },
    ])
    .then(({ error }) => {
      if (error) console.error('[useAuth] Falha ao registrar consentimento (Google):', error);
    });
}
```

E no listener existente, ramo `SIGNED_IN`:

```jsx
} else if (event === 'SIGNED_IN') {
  registrarConsentimentoPendente(session);
  if (perfilJaCarregado.current && perfilCarregadoParaId.current === session?.user?.id) {
```

(o resto do ramo `SIGNED_IN` continua idêntico — só a chamada nova entra antes do `if` existente.)

- [ ] **Step 3: Rodar lint**

Run: `npm --prefix webapp run lint -- src/hooks/useAuth.jsx`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add webapp/src/hooks/useAuth.jsx
git commit -m "feat(lgpd): registra consentimento pendente do cadastro via Google no primeiro SIGNED_IN (PED-136)"
```

---

### Task 7: Dado de saúde e cláusula controlador/operador nos textos legais (PED-137, itens 1 e 2)

**Files:**
- Modify: `webapp/src/pages/PoliticaPrivacidade.jsx`
- Modify: `webapp/src/pages/TermosDeUso.jsx`

- [ ] **Step 1: Nova seção de dado de saúde em `PoliticaPrivacidade.jsx`**

Inserir como nova `<section>` logo após a seção "1. Quais dados coletamos" (mantendo o mesmo padrão visual das demais):

```jsx
<section>
  <h2 className="font-display text-lg font-bold text-foreground">2. Dado de saúde dos alunos</h2>
  <p className="mt-2">
    Quando o seu estúdio cadastra observações médicas ou um link de anamnese sobre um
    aluno, isso é <strong>dado pessoal sensível</strong> (art. 5º, II da LGPD). Esse
    campo é preenchido pelo estúdio, com a finalidade de personalizar o atendimento e
    a segurança do aluno durante as aulas — a base legal é o consentimento específico
    do titular (art. 11, I), que é responsabilidade do estúdio obter diretamente do
    aluno antes de preencher o campo. O Nexofy armazena esse dado como operador, nas
    condições descritas na cláusula de tratamento de dados dos{' '}
    <Link to={LINKS.TERMOS} className="font-semibold underline">Termos de Uso</Link>.
  </p>
</section>
```

Renumerar as seções seguintes (a antiga "2" vira "3", "3"→"4", "4"→"5").

- [ ] **Step 2: Nova cláusula de controlador/operador em `TermosDeUso.jsx`**

Substituir a seção "4. Dados dos seus alunos" por uma versão expandida:

```jsx
<section>
  <h2 className="font-display text-lg font-bold text-foreground">4. Dados dos seus alunos — papéis e responsabilidades</h2>
  <p className="mt-2">
    Sobre os dados que você cadastra a respeito dos seus alunos, o seu estúdio é o{' '}
    <strong>controlador</strong> (decide o quê e por quê coletar) e o Nexofy é o{' '}
    <strong>operador</strong> (trata o dado só para operar a plataforma, seguindo as
    suas instruções). Isso significa que o Nexofy: (i) trata esses dados apenas para
    prestar o serviço contratado; (ii) aplica medidas de segurança razoáveis para
    protegê-los; (iii) ajuda o seu estúdio a responder pedidos de titulares (acesso,
    correção, exclusão) sobre os dados dos seus alunos; (iv) exclui ou devolve os
    dados ao final do contrato, salvo obrigação legal de retenção.
  </p>
  <p className="mt-2">
    Como controlador, é seu estúdio quem deve ter base legal e, quando aplicável,
    consentimento específico do aluno para os dados que cadastra — isso vale em
    especial para dado sensível, como observações médicas e anamnese (ver{' '}
    <Link to={LINKS.PRIVACIDADE} className="font-semibold underline">Política de Privacidade</Link>).
  </p>
</section>
```

- [ ] **Step 3: Rodar lint**

Run: `npm --prefix webapp run lint -- src/pages/PoliticaPrivacidade.jsx src/pages/TermosDeUso.jsx`
Expected: sem erros novos.

- [ ] **Step 4: Commit**

```bash
git add webapp/src/pages/PoliticaPrivacidade.jsx webapp/src/pages/TermosDeUso.jsx
git commit -m "docs(lgpd): cobre dado de saude e papel controlador/operador nos textos legais (PED-137)"
```

---

### Task 8: Aviso de dado sensível na aba Anamnese do `PerfilAluno.jsx` (PED-137, item 3)

**Files:**
- Modify: `webapp/src/pages/PerfilAluno.jsx`

- [ ] **Step 1: Adicionar banner de aviso no topo de `AbaAnamnese`**

Dentro da função `AbaAnamnese` (por volta da linha 532), como primeiro filho do container retornado, antes do primeiro `<Surface>`:

```jsx
<div className="flex gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-4">
  <Activity size={16} className="text-warning shrink-0 mt-0.5" />
  <p className="text-xs text-warning leading-relaxed">
    Observações médicas e link de anamnese são <strong>dado sensível de saúde</strong>{' '}
    (LGPD, art. 5º, II). Antes de preencher, confirme que o aluno (ou responsável)
    autorizou especificamente o registro dessa informação.
  </p>
</div>
```

`Activity` já está importado no topo do arquivo (usado no ícone da aba "Saúde/Anamnese").

- [ ] **Step 2: Rodar lint**

Run: `npm --prefix webapp run lint -- src/pages/PerfilAluno.jsx`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/pages/PerfilAluno.jsx
git commit -m "feat(lgpd): avisa sobre dado sensivel de saude na aba Anamnese do aluno (PED-137)"
```

---

### Task 9: Rodar a suíte de testes completa e replicar a migration em produção

**Files:** nenhum novo — só verificação.

- [ ] **Step 1: Rodar toda a suíte de unidade**

Run: `npm --prefix webapp run test`
Expected: todos os testes existentes + os 6 novos de `consentimento.test.js` passam.

- [ ] **Step 2: Rodar lint completo**

Run: `npm --prefix webapp run lint`
Expected: sem erros.

- [ ] **Step 3: Replicar a migration da Task 3 em produção**

Depois de validar manualmente em staging (Task 10), aplicar a mesma migration (`apply_migration`, mesmo SQL do Task 3 Step 1) no project_id `tciiepqmnrrcjnqhspvw` ("Nexofy - production").

- [ ] **Step 4: Verificar produção**

`list_tables` (verbose) confirmando `consentimentos` com `rls_enabled: true`, e `get_advisors` (security) sem avisos novos.

- [ ] **Step 5: Commit (se sobrar algo pendente de índice/lockfile)**

Só commitar se `git status` mostrar alguma alteração — normalmente este task não gera diff de código, só validação.

---

### Task 10: Verificação manual end-to-end no navegador

**Files:** nenhum — só teste manual via `preview_start`/browser.

- [ ] **Step 1: Subir o dev server e abrir `/cadastro`**

Confirmar visualmente: checkbox aparece ACIMA do botão "Continuar com Google", fora do card do formulário de e-mail/senha.

- [ ] **Step 2: Clicar em "Continuar com Google" sem marcar o checkbox**

Expected: NÃO inicia o redirect pro Google; aparece a mensagem de erro "Aceite os Termos e a Política de Privacidade para continuar." junto do checkbox.

- [ ] **Step 3: Marcar o checkbox e tentar submeter o form de e-mail/senha sem preencher nome/email/senha**

Expected: erro de termos não aparece mais (checkbox válido), outros erros de campo aparecem normalmente — confirma que `validar()` não regrediu.

- [ ] **Step 4: Completar um cadastro por e-mail/senha de teste (ambiente staging) e conferir a linha em `consentimentos`**

Via `execute_sql` no project staging:
```sql
select documento, versao, aceito_em from public.consentimentos where user_id = (select id from auth.users where email = '<email-de-teste>');
```
Expected: 2 linhas (`termos`, `privacidade`), `versao = '2026-09-03'`.

- [ ] **Step 5: Abrir `/termos-de-uso` e `/politica-privacidade`**

Confirmar visualmente a linha "Versão 2026-09-03 · vigente desde 03/09/2026" abaixo do título em ambas, e o novo texto de dado de saúde / controlador-operador.

- [ ] **Step 6: Abrir o perfil de um aluno existente (staging) na aba "Saúde/Anamnese"**

Confirmar visualmente o banner de aviso de dado sensível acima dos campos.

- [ ] **Step 7: Login em `/login` com Google (sem checkbox nenhum na tela)**

Confirmar que o botão do Google funciona normalmente ali, sem qualquer gate — comportamento inalterado.

---

## Depois do plano: PR

Depois de todos os tasks commitados e verificados, abrir PR da branch do worktree para `main`, com descrição cobrindo os 4 PED-xxx fechados e mencionando explicitamente, como *não* implementado neste PR (fora de escopo, decisão de produto): a avaliação de minimizar/remover `observacoes_medicas` como texto livre (PED-137, item 4) e a revisão jurídica completa do conteúdo de Termos/Política (permanece "rascunho").
