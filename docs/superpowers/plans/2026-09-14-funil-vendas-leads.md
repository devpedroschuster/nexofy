# Funil de Vendas Básico (Estágios + Follow-up) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o `status_conversao` de 3 valores da página de Leads por um funil de 6 estágios (novo/contatado/aula_agendada/negociacao/convertido/perdido) com follow-up agendado (data/hora + nota, com badge atrasado/hoje/agendado), exibido numa nova aba "Funil".

**Architecture:** O campo `status_conversao` (banco) é ampliado in-place — sem tabela nova. Uma constante compartilhada (`webapp/src/lib/funilLeads.js`) é a fonte única dos 6 estágios e da lógica de classificação do follow-up. `leadsService.js`/`useLeads.ts` ganham as queries/mutações novas seguindo o padrão de optimistic-update já usado no arquivo. Três componentes novos (`EstagioDropdown`, `FollowupLead`, `FunilLeads`) ficam em `webapp/src/components/leads/`, mantendo `Leads.jsx` como orquestrador das 3 abas.

**Tech Stack:** React + Vite, TanStack Query, Supabase (Postgres + RPC), Tailwind, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-14-funil-vendas-leads-design.md`

## Global Constraints

- Projeto Supabase de staging para validar antes do PR: `qjmybxkfjkxttggdjxga` (ver `.env`/`.env.local` do `webapp`). **Não aplicar a migration em produção (`tciiepqmnrrcjnqhspvw`) como parte deste plano** — o RPC muda o valor default que o frontend em produção lê, e o frontend de produção só entende os 3 valores antigos até o deploy desta feature acontecer; promover em produção antes do deploy do frontend quebraria silenciosamente a aba "Ação" da produção atual (leads novos sumiriam do filtro `status_conversao = 'pendente'`). Isso fica para o momento do deploy real (pós-merge), documentado no PR.
- Sem dependência nova no `package.json` (nada de biblioteca de drag-and-drop).
- Reaproveitar os componentes de UI existentes (`Badge`, `Button`, `Surface`, `EmptyState`) e as `tone`s já suportadas por `Badge` (neutral/info/brand/warning/success/destructive) — não criar variantes novas de cor.
- Nomenclatura em português, consistente com o resto do arquivo (`estagio`, `followup`, `agendado`).
- Todo código roda em `webapp/` — comandos abaixo (`npm run test`, `npm run lint`, `npm run build`) assumem `cwd = webapp/`.

---

### Task 1: Migration — estágios do funil + follow-up agendado

**Files:**
- Create: `supabase/migrations/20260914020000_funil_vendas_estagios_leads.sql`

**Interfaces:**
- Produces: `leads.status_conversao` aceita `'novo' | 'contatado' | 'aula_agendada' | 'negociacao' | 'convertido' | 'perdido'`; novas colunas `leads.proximo_followup_em timestamptz null` e `leads.nota_followup text null`; RPC `criar_lead_com_presenca(p_estudio_id uuid, p_nome text, p_telefone text, p_aula_id bigint, p_data_visita date) returns leads` cria o lead com `'aula_agendada'` quando `p_aula_id` não é nulo, `'novo'` caso contrário.

- [ ] **Step 1: Escrever o arquivo de migration**

```sql
-- 1. Remove o CHECK antigo primeiro — enquanto não existe nenhum CHECK
--    sobre status_conversao, a coluna aceita qualquer texto, o que deixa
--    o backfill do passo 2 livre para gravar os novos valores. Rodar
--    ADD CONSTRAINT antes do backfill falha contra as linhas 'pendente'
--    ainda não migradas; rodar o UPDATE antes do DROP falha contra a
--    constraint ANTIGA, que não conhece 'aula_agendada'/'novo'. A ordem
--    DROP → UPDATE → ADD é a única que funciona nos dois lados.
alter table public.leads drop constraint leads_status_conversao_check;

-- 2. Backfill dos leads existentes com 'pendente': quem já tem aula/data
--    marcada vira 'aula_agendada'; os demais viram 'novo'.
update public.leads
  set status_conversao = case
    when data_visita is not null then 'aula_agendada'
    else 'novo'
  end
  where status_conversao = 'pendente';

-- 3. Amplia o CHECK de status_conversao para os estágios do funil —
--    só agora, com todas as linhas já conformes ao novo conjunto de
--    valores.
alter table public.leads add constraint leads_status_conversao_check
  check (status_conversao = any (array[
    'novo', 'contatado', 'aula_agendada', 'negociacao',
    'convertido', 'perdido'
  ]));

-- 4. Campos do follow-up agendado.
alter table public.leads
  add column proximo_followup_em timestamptz null,
  add column nota_followup text null;

-- 5. criar_lead_com_presenca passa a definir o estágio inicial conforme
--    o lead já nasce com aula/data vinculada ou não.
create or replace function public.criar_lead_com_presenca(
  p_estudio_id uuid, p_nome text, p_telefone text,
  p_aula_id bigint, p_data_visita date
)
returns leads
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lead leads;
  v_pode_escrever boolean;
  v_estagio_inicial text;
begin
  select exists (
    select 1 from estudio_membros
    where user_id = auth.uid()
      and estudio_id = p_estudio_id
      and role = any(array['admin', 'professor'])
  ) into v_pode_escrever;

  if not v_pode_escrever then
    raise exception 'Acesso negado: você não tem permissão para criar leads neste estúdio.';
  end if;

  v_estagio_inicial := case when p_aula_id is not null then 'aula_agendada' else 'novo' end;

  insert into leads (estudio_id, nome_visitante, telefone_visitante,
                     aula_id, data_visita, status_conversao)
  values (p_estudio_id, p_nome, p_telefone,
          p_aula_id, p_data_visita, v_estagio_inicial)
  returning * into v_lead;

  insert into presencas (estudio_id, aula_id, data_aula, origem, lead_id, status)
  values (p_estudio_id, p_aula_id, p_data_visita, 'lead', v_lead.id, 'agendado');

  return v_lead;
end;
$function$;
```

- [ ] **Step 2: Aplicar em staging**

Use o MCP do Supabase (`apply_migration`) contra o projeto `qjmybxkfjkxttggdjxga`
com `name: "funil_vendas_estagios_leads"` e o SQL exato do Step 1 (ou, se
preferir CLI: `supabase link --project-ref qjmybxkfjkxttggdjxga && supabase db push`).

- [ ] **Step 3: Verificar o schema aplicado**

Rode contra o mesmo projeto (`execute_sql` do MCP ou `psql`):

```sql
select pg_get_constraintdef(oid) from pg_constraint where conname = 'leads_status_conversao_check';
-- esperado: CHECK (status_conversao = ANY (ARRAY['novo'::text, 'contatado'::text, 'aula_agendada'::text, 'negociacao'::text, 'convertido'::text, 'perdido'::text]))

select column_name from information_schema.columns
  where table_name = 'leads' and column_name in ('proximo_followup_em', 'nota_followup');
-- esperado: as 2 linhas

select status_conversao, count(*) from leads group by 1 order by 1;
-- esperado: nenhuma linha com status_conversao = 'pendente'
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260914020000_funil_vendas_estagios_leads.sql
git commit -m "feat(leads): migration do funil de estágios + follow-up agendado"
```

---

### Task 2: `funilLeads.js` — metadados dos estágios + classificador de follow-up

**Files:**
- Create: `webapp/src/lib/funilLeads.js`
- Test: `webapp/src/lib/funilLeads.test.js`

**Interfaces:**
- Produces: `ESTAGIOS_FUNIL: Array<{ valor: string, label: string, tone: string }>` (ordem: novo, contatado, aula_agendada, negociacao, convertido, perdido); `ESTAGIOS_ATIVOS: string[]` (os 4 primeiros valores); `ESTAGIOS_FINAIS: string[]` = `['convertido', 'perdido']`; `classificarFollowup(proximoFollowupEm: string | null, agora?: Date): 'atrasado' | 'hoje' | 'agendado' | null`.

- [ ] **Step 1: Escrever os testes (devem falhar — o módulo ainda não existe)**

```js
import { describe, it, expect } from 'vitest';
import { classificarFollowup, ESTAGIOS_FUNIL, ESTAGIOS_ATIVOS, ESTAGIOS_FINAIS } from './funilLeads';

describe('classificarFollowup', () => {
  const agora = new Date('2026-09-14T15:00:00-03:00');

  it('retorna null quando não há follow-up agendado', () => {
    expect(classificarFollowup(null, agora)).toBe(null);
  });

  it('retorna "atrasado" quando a data/hora já passou hoje', () => {
    expect(classificarFollowup('2026-09-14T09:00:00-03:00', agora)).toBe('atrasado');
  });

  it('retorna "atrasado" quando é de um dia anterior', () => {
    expect(classificarFollowup('2026-09-10T09:00:00-03:00', agora)).toBe('atrasado');
  });

  it('retorna "hoje" quando é mais tarde no mesmo dia', () => {
    expect(classificarFollowup('2026-09-14T18:00:00-03:00', agora)).toBe('hoje');
  });

  it('retorna "agendado" quando é um dia futuro', () => {
    expect(classificarFollowup('2026-09-20T09:00:00-03:00', agora)).toBe('agendado');
  });
});

describe('ESTAGIOS_FUNIL', () => {
  it('tem os 6 estágios na ordem do funil', () => {
    expect(ESTAGIOS_FUNIL.map(e => e.valor)).toEqual([
      'novo', 'contatado', 'aula_agendada', 'negociacao', 'convertido', 'perdido',
    ]);
  });

  it('ESTAGIOS_ATIVOS cobre só os 4 estágios não-finais', () => {
    expect(ESTAGIOS_ATIVOS).toEqual(['novo', 'contatado', 'aula_agendada', 'negociacao']);
  });

  it('ESTAGIOS_FINAIS cobre convertido e perdido', () => {
    expect(ESTAGIOS_FINAIS).toEqual(['convertido', 'perdido']);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npm run test -- funilLeads` (a partir de `webapp/`)
Expected: FAIL com "Failed to resolve import './funilLeads'" (ou similar — módulo inexistente)

- [ ] **Step 3: Implementar `funilLeads.js`**

```js
// Fonte única de metadados dos estágios do funil de vendas de leads.
// `status_conversao` (banco) continua um campo único: os 2 últimos
// estágios ('convertido'/'perdido') são finais, iguais aos valores que
// já existiam antes do funil.

export const ESTAGIOS_FUNIL = [
  { valor: 'novo', label: 'Novo', tone: 'neutral' },
  { valor: 'contatado', label: 'Contatado', tone: 'info' },
  { valor: 'aula_agendada', label: 'Aula Agendada', tone: 'brand' },
  { valor: 'negociacao', label: 'Em Negociação', tone: 'warning' },
  { valor: 'convertido', label: 'Convertido', tone: 'success' },
  { valor: 'perdido', label: 'Perdido', tone: 'destructive' },
];

export const ESTAGIOS_FINAIS = ['convertido', 'perdido'];

export const ESTAGIOS_ATIVOS = ESTAGIOS_FUNIL
  .map(e => e.valor)
  .filter(valor => !ESTAGIOS_FINAIS.includes(valor));

/**
 * Classifica um follow-up agendado em relação a `agora`, para decidir o
 * badge exibido no card do lead. `proximoFollowupEm` é uma string ISO
 * (timestamptz) ou null quando nenhum follow-up está agendado.
 */
export function classificarFollowup(proximoFollowupEm, agora = new Date()) {
  if (!proximoFollowupEm) return null;

  const data = new Date(proximoFollowupEm);
  if (data.getTime() < agora.getTime()) return 'atrasado';

  const mesmoDia =
    data.getFullYear() === agora.getFullYear() &&
    data.getMonth() === agora.getMonth() &&
    data.getDate() === agora.getDate();

  return mesmoDia ? 'hoje' : 'agendado';
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npm run test -- funilLeads`
Expected: PASS (8 testes)

- [ ] **Step 5: Commit**

```bash
git add webapp/src/lib/funilLeads.js webapp/src/lib/funilLeads.test.js
git commit -m "feat(leads): metadados dos estágios do funil e classificador de follow-up"
```

---

### Task 3: `leadsService.js` — queries e mutação do funil

**Files:**
- Modify: `webapp/src/services/leadsService.js`

**Interfaces:**
- Consumes: `ESTAGIOS_ATIVOS` de `../lib/funilLeads` (Task 2).
- Produces: `leadsService.listarLeadsFunil(estudioId): Promise<LeadRow[]>`; `leadsService.atualizarFollowupLead(leadId, { proximoFollowupEm, notaFollowup }, estudioId): Promise<true>`; `SELECT_BASE` inclui `proximo_followup_em, nota_followup`.

- [ ] **Step 1: Adicionar o import e ampliar `SELECT_BASE`**

No topo do arquivo, junto do import existente:

```js
import { supabase } from '../lib/supabase';
import { ESTAGIOS_ATIVOS } from '../lib/funilLeads';
```

Substituir:

```js
const SELECT_BASE =
  'id, nome_visitante, telefone_visitante, data_visita, status_conversao, ' +
  'observacao_lead, aluno_convertido_id, agenda(atividade)';
```

por:

```js
const SELECT_BASE =
  'id, nome_visitante, telefone_visitante, data_visita, status_conversao, ' +
  'observacao_lead, aluno_convertido_id, proximo_followup_em, nota_followup, agenda(atividade)';
```

- [ ] **Step 2: Trocar os 3 filtros de "pendente" por "estágios ativos"**

Em `listarLeadsPendentes`, `listarLeadsPendentesPorMes` e
`listarResumoLeadsPendentes`, trocar cada ocorrência de:

```js
.eq('status_conversao', 'pendente')
```

por:

```js
.in('status_conversao', ESTAGIOS_ATIVOS)
```

(3 ocorrências no total — confirmar com `grep -n "status_conversao', 'pendente'" webapp/src/services/leadsService.js` que não sobrou nenhuma antes do próximo passo.)

- [ ] **Step 3: Adicionar `listarLeadsFunil` e `atualizarFollowupLead`**

Adicionar estes dois métodos dentro do objeto `leadsService`, antes do
`};` final:

```js
  /**
   * Todos os leads (sem filtro de status/período) para montar o kanban
   * do funil.
   */
  async listarLeadsFunil(estudioId) {
    const { data, error } = await supabase
      .from('leads')
      .select(SELECT_BASE)
      .eq('estudio_id', estudioId)
      .order('data_visita', { ascending: false });

    if (error) throw error;
    return data;
  },

  /**
   * Salva/atualiza o follow-up agendado de um lead (data/hora + nota).
   * `proximoFollowupEm` é uma string ISO ou null para limpar o follow-up.
   */
  async atualizarFollowupLead(leadId, { proximoFollowupEm, notaFollowup }, estudioId) {
    const { error } = await supabase
      .from('leads')
      .update({
        proximo_followup_em: proximoFollowupEm || null,
        nota_followup: notaFollowup || null,
      })
      .eq('id', leadId)
      .eq('estudio_id', estudioId);

    if (error) throw error;
    return true;
  },
```

- [ ] **Step 4: Rodar a suíte inteira e o lint**

Run: `npm run test && npm run lint` (a partir de `webapp/`)
Expected: PASS em ambos — sem regressão nos testes existentes, sem erro de import/sintaxe.

- [ ] **Step 5: Commit**

```bash
git add webapp/src/services/leadsService.js
git commit -m "feat(leads): leadsService ganha listarLeadsFunil e atualizarFollowupLead"
```

---

### Task 4: Tipos + hooks do React Query

**Files:**
- Modify: `webapp/src/types/leads.ts`
- Modify: `webapp/src/hooks/useLeads.ts`

**Interfaces:**
- Consumes: `leadsService.listarLeadsFunil`, `leadsService.atualizarFollowupLead` (Task 3); `ESTAGIOS_FINAIS` de `../lib/funilLeads` (Task 2).
- Produces: `useLeadsFunil(): UseQueryResult<Lead[]>` (query key `['leads', estudioId, 'funil']`); `useAtualizarFollowupLead(): UseMutationResult` aceitando `{ id: string, proximoFollowupEm: string | null, notaFollowup: string | null }`.

- [ ] **Step 1: Ampliar `Lead` em `types/leads.ts`**

Substituir o conteúdo do arquivo por:

```ts
export interface Lead {
  id: string;
  nome_visitante: string;
  telefone_visitante: string | null;
  data_checkin: string;
  status_conversao: 'novo' | 'contatado' | 'aula_agendada' | 'negociacao' | 'convertido' | 'perdido';
  observacao_lead: string | null;
  proximo_followup_em: string | null;
  nota_followup: string | null;
  agenda: {
    atividade: string
  } | null;
}
```

- [ ] **Step 2: Importar `ESTAGIOS_FINAIS` em `useLeads.ts`**

No topo do arquivo, junto dos imports existentes:

```ts
import { ESTAGIOS_FINAIS } from '../lib/funilLeads';
```

- [ ] **Step 3: Adicionar `useLeadsFunil`**

Adicionar logo após `useHistoricoLeadsPorMes`:

```ts
export function useLeadsFunil() {
  const { estudioId } = useAuth();

  return useQuery<Lead[]>({
    queryKey: ['leads', estudioId, 'funil'],
    queryFn: async () => {
      const data = await leadsService.listarLeadsFunil(estudioId);
      return data as unknown as Lead[];
    },
    enabled: !!estudioId,
    staleTime: 1000 * 30,
  });
}
```

- [ ] **Step 4: Atualizar `useAtualizarStatusLead` para os 6 estágios**

Em `useAtualizarStatusLead`, trocar a assinatura do `mutationFn`:

```ts
mutationFn: async ({ id, status }: { id: string, status: Lead['status_conversao'] }) => {
```

E, dentro de `onMutate`, trocar:

```ts
return status !== 'pendente' ? old.filter(l => l.id !== id) : old.map(l => l.id === id ? { ...l, status_conversao: status } : l);
```

por:

```ts
return ESTAGIOS_FINAIS.includes(status) ? old.filter(l => l.id !== id) : old.map(l => l.id === id ? { ...l, status_conversao: status } : l);
```

- [ ] **Step 5: Adicionar `useAtualizarFollowupLead`**

Adicionar ao final do arquivo:

```ts
export function useAtualizarFollowupLead() {
  const queryClient = useQueryClient();
  const { estudioId } = useAuth();

  return useMutation({
    mutationFn: async ({ id, proximoFollowupEm, notaFollowup }: { id: string, proximoFollowupEm: string | null, notaFollowup: string | null }) => {
      if (!estudioId) throw new Error('Estúdio não identificado. Recarregue a página.');
      return await leadsService.atualizarFollowupLead(id, { proximoFollowupEm, notaFollowup }, estudioId);
    },
    onMutate: async ({ id, proximoFollowupEm, notaFollowup }) => {
      await queryClient.cancelQueries({ queryKey: ['leads', estudioId] });

      const previousFunil = queryClient.getQueryData<Lead[]>(['leads', estudioId, 'funil']);
      const previousPendentes = queryClient.getQueriesData<Lead[]>({ queryKey: ['leads', estudioId, 'pendentes'], exact: false });

      const atualizarLista = (old?: Lead[]) =>
        old?.map(l => l.id === id ? { ...l, proximo_followup_em: proximoFollowupEm, nota_followup: notaFollowup } : l);

      queryClient.setQueryData<Lead[]>(['leads', estudioId, 'funil'], (old) => atualizarLista(old) ?? old);
      queryClient.setQueriesData<Lead[]>({ queryKey: ['leads', estudioId, 'pendentes'], exact: false }, (old) => atualizarLista(old) ?? old);

      return { previousFunil, previousPendentes };
    },
    onError: (err, variables, context) => {
      if (context?.previousFunil) {
        queryClient.setQueryData<Lead[]>(['leads', estudioId, 'funil'], context.previousFunil);
      }
      context?.previousPendentes?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      showToast.error('Erro ao salvar follow-up. Tente novamente.');
    },
    onSuccess: () => {
      showToast.success('Follow-up salvo.');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', estudioId] });
    },
  });
}
```

- [ ] **Step 6: Rodar a suíte inteira e o lint**

Run: `npm run test && npm run lint`
Expected: PASS em ambos.

- [ ] **Step 7: Commit**

```bash
git add webapp/src/types/leads.ts webapp/src/hooks/useLeads.ts
git commit -m "feat(leads): hooks useLeadsFunil e useAtualizarFollowupLead"
```

---

### Task 5: `EstagioDropdown.jsx` (generaliza o `StatusDropdown` inline)

**Files:**
- Create: `webapp/src/components/leads/EstagioDropdown.jsx`
- Modify: `webapp/src/pages/Leads.jsx:43-113` (remove a função `StatusDropdown` inline), `webapp/src/pages/Leads.jsx` (import + uso no lugar de `StatusDropdown`, e mensagens de `alterarStatus`)

**Interfaces:**
- Consumes: `ESTAGIOS_FUNIL` de `../../lib/funilLeads` (Task 2); `Badge` de `../ui/Badge`.
- Produces: `<EstagioDropdown lead={lead} onAlterarEstagio={(leadId, novoEstagio) => void} isProcessando={boolean} />` — substitui todo uso do antigo `StatusDropdown`.

- [ ] **Step 1: Criar `EstagioDropdown.jsx`**

```jsx
import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, RefreshCw, Sparkles, Phone, Calendar, MessageSquare, CheckCircle, XCircle } from 'lucide-react';
import Badge from '../ui/Badge';
import { ESTAGIOS_FUNIL } from '../../lib/funilLeads';

const ICONE_POR_ESTAGIO = {
  novo: <Sparkles size={13} />,
  contatado: <Phone size={13} />,
  aula_agendada: <Calendar size={13} />,
  negociacao: <MessageSquare size={13} />,
  convertido: <CheckCircle size={13} />,
  perdido: <XCircle size={13} />,
};

export default function EstagioDropdown({ lead, onAlterarEstagio, isProcessando }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    }
    if (aberto) document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, [aberto]);

  const atual = ESTAGIOS_FUNIL.find(e => e.valor === lead.status_conversao) ?? ESTAGIOS_FUNIL[0];

  if (isProcessando) {
    return (
      <Badge tone={atual.tone} variant="soft">
        <RefreshCw size={12} className="animate-spin" /> {atual.label}
      </Badge>
    );
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setAberto(v => !v)}
        title="Alterar estágio"
        className="flex items-center gap-1 focus:outline-none group"
      >
        <Badge tone={atual.tone} variant="soft" className="cursor-pointer group-hover:opacity-80 transition-opacity">
          {ICONE_POR_ESTAGIO[atual.valor]} {atual.label}
          <ChevronDown size={11} className={`ml-0.5 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </Badge>
      </button>

      {aberto && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-card overflow-hidden min-w-[170px] animate-in fade-in zoom-in-95">
          {ESTAGIOS_FUNIL.map(({ valor, label, tone }) => (
            <button
              key={valor}
              disabled={valor === lead.status_conversao}
              onClick={() => {
                setAberto(false);
                onAlterarEstagio(lead.id, valor);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-bold text-left transition-colors
                ${valor === lead.status_conversao
                  ? 'opacity-40 cursor-default bg-muted'
                  : 'hover:bg-muted cursor-pointer'
                }`}
            >
              <Badge tone={tone} variant="soft" className="pointer-events-none">
                {ICONE_POR_ESTAGIO[valor]} {label}
              </Badge>
              {valor === lead.status_conversao && (
                <span className="ml-auto text-[10px] font-black text-muted-foreground uppercase tracking-wide">atual</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Remover o `StatusDropdown` inline de `Leads.jsx` e usar o novo componente**

Em `webapp/src/pages/Leads.jsx`:

1. Remover por completo a função `StatusDropdown` (linhas 43-113 do
   arquivo atual, do comentário `// ── Dropdown de Status Inline` até a
   linha `// ───...` que fecha o bloco, logo antes de `// ── Seletor de
   Período`).
2. Adicionar o import, junto dos outros imports de componentes:

```jsx
import EstagioDropdown from '../components/leads/EstagioDropdown';
```

3. No JSX da tabela de Histórico, trocar:

```jsx
<StatusDropdown
  lead={lead}
  onAlterarStatus={alterarStatus}
  isProcessando={isProcessando(lead.id)}
/>
```

por:

```jsx
<EstagioDropdown
  lead={lead}
  onAlterarEstagio={alterarStatus}
  isProcessando={isProcessando(lead.id)}
/>
```

4. Em `alterarStatus`, ampliar o mapa de mensagens de sucesso:

```js
function alterarStatus(leadId, novoStatus) {
  const mensagens = {
    novo: 'Lead marcado como novo.',
    contatado: 'Lead marcado como contatado.',
    aula_agendada: 'Lead marcado como aula agendada.',
    negociacao: 'Lead marcado como em negociação.',
    convertido: 'Lead marcado como convertido.',
    perdido: 'Visitante marcado como perdido.',
  };
  mutationStatus.mutate({ id: leadId, status: novoStatus }, {
    onSuccess: () => showToast.success(mensagens[novoStatus] ?? 'Estágio atualizado.'),
  });
}
```

- [ ] **Step 3: Lint + build**

Run: `npm run lint && npm run build`
Expected: PASS em ambos (sem import não usado, sem erro de JSX).

- [ ] **Step 4: Commit**

```bash
git add webapp/src/components/leads/EstagioDropdown.jsx webapp/src/pages/Leads.jsx
git commit -m "feat(leads): EstagioDropdown substitui o StatusDropdown de 3 opções"
```

---

### Task 6: `FollowupLead.jsx`

**Files:**
- Create: `webapp/src/components/leads/FollowupLead.jsx`

**Interfaces:**
- Consumes: `classificarFollowup` de `../../lib/funilLeads` (Task 2); `formatarDataHora` de `../../lib/utils` (já existe, usado em `Leads.jsx`).
- Produces: `<FollowupLead lead={lead} onSalvar={(leadId, { proximoFollowupEm, notaFollowup }) => void} isSalvando={boolean} />`.

- [ ] **Step 1: Criar `FollowupLead.jsx`**

```jsx
import React, { useState } from 'react';
import { Calendar, AlertTriangle, Clock3, X } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { classificarFollowup } from '../../lib/funilLeads';
import { formatarDataHora } from '../../lib/utils';

function paraInputLocal(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const BADGE_POR_CLASSIFICACAO = {
  atrasado: { tone: 'destructive', label: 'Atrasado', icon: <AlertTriangle size={13} /> },
  hoje: { tone: 'warning', label: 'Hoje', icon: <Clock3 size={13} /> },
  agendado: { tone: 'info', label: 'Agendado', icon: <Calendar size={13} /> },
};

export default function FollowupLead({ lead, onSalvar, isSalvando }) {
  const [editando, setEditando] = useState(false);
  const [data, setData] = useState(() => paraInputLocal(lead.proximo_followup_em));
  const [nota, setNota] = useState(lead.nota_followup || '');

  const classificacao = classificarFollowup(lead.proximo_followup_em);

  function salvar() {
    const proximoFollowupEm = data ? new Date(data).toISOString() : null;
    setEditando(false);
    onSalvar(lead.id, { proximoFollowupEm, notaFollowup: nota.trim() || null });
  }

  function limpar() {
    setData('');
    setNota('');
    setEditando(false);
    onSalvar(lead.id, { proximoFollowupEm: null, notaFollowup: null });
  }

  if (editando) {
    return (
      <div className="mt-2 space-y-2 rounded-xl border border-border bg-muted p-3">
        <input
          type="datetime-local"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="w-full text-xs font-bold text-foreground bg-card border border-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ex: ligar depois das 18h, esperando resposta..."
          rows={2}
          className="w-full text-xs font-medium text-foreground bg-card border border-border rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground placeholder:italic"
        />
        <div className="flex gap-2">
          <Button variant="info" size="sm" fullWidth onClick={salvar} disabled={!data}>Salvar</Button>
          <Button variant="ghost" size="sm" onClick={() => setEditando(false)}>Cancelar</Button>
        </div>
      </div>
    );
  }

  if (!lead.proximo_followup_em) {
    return (
      <button
        onClick={() => setEditando(true)}
        className="mt-2 w-full flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground hover:text-primary transition-colors py-1.5 rounded-lg hover:bg-primary/5 border border-dashed border-border"
      >
        <Calendar size={13} /> Agendar follow-up
      </button>
    );
  }

  const badge = BADGE_POR_CLASSIFICACAO[classificacao];

  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <button onClick={() => setEditando(true)} title={lead.nota_followup || ''} className="flex-1 text-left">
        <Badge tone={badge.tone} variant="soft" className="cursor-pointer">
          {badge.icon} {badge.label === 'Agendado' ? `Agendado: ${formatarDataHora(lead.proximo_followup_em)}` : badge.label}
        </Badge>
      </button>
      <button
        onClick={limpar}
        disabled={isSalvando}
        title="Remover follow-up"
        className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
      >
        <X size={14} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: PASS em ambos.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/components/leads/FollowupLead.jsx
git commit -m "feat(leads): componente FollowupLead (agendar/editar/limpar follow-up)"
```

---

### Task 7: `FunilLeads.jsx` — kanban

**Files:**
- Create: `webapp/src/components/leads/FunilLeads.jsx`

**Interfaces:**
- Consumes: `useLeadsFunil`, `useAtualizarStatusLead`, `useAtualizarFollowupLead` de `../../hooks/useLeads` (Task 4); `EstagioDropdown` (Task 5); `FollowupLead` (Task 6); `ESTAGIOS_FUNIL` (Task 2); `Surface`, `EmptyState` de `../ui/*`; `showToast` de `../shared/Toast`.
- Produces: `<FunilLeads />` — sem props, autossuficiente.

- [ ] **Step 1: Criar `FunilLeads.jsx`**

```jsx
import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useLeadsFunil, useAtualizarStatusLead, useAtualizarFollowupLead } from '../../hooks/useLeads';
import { showToast } from '../shared/Toast';
import { ESTAGIOS_FUNIL } from '../../lib/funilLeads';
import Surface from '../ui/Surface';
import EmptyState from '../ui/EmptyState';
import EstagioDropdown from './EstagioDropdown';
import FollowupLead from './FollowupLead';

export default function FunilLeads() {
  const { data: leads = [], isLoading } = useLeadsFunil();
  const mutationEstagio = useAtualizarStatusLead();
  const mutationFollowup = useAtualizarFollowupLead();

  function alterarEstagio(leadId, novoEstagio) {
    mutationEstagio.mutate({ id: leadId, status: novoEstagio }, {
      onSuccess: () => showToast.success('Estágio atualizado.'),
    });
  }

  function salvarFollowup(leadId, { proximoFollowupEm, notaFollowup }) {
    mutationFollowup.mutate({ id: leadId, proximoFollowupEm, notaFollowup });
  }

  const isProcessandoEstagio = (id) => mutationEstagio.isPending && mutationEstagio.variables?.id === id;
  const isSalvandoFollowup = (id) => mutationFollowup.isPending && mutationFollowup.variables?.id === id;

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <RefreshCw className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <EmptyState
        icon={<RefreshCw size={28} />}
        title="Nenhum lead ainda"
        description="Quando novos leads chegarem, eles aparecem aqui organizados por estágio do funil."
      />
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {ESTAGIOS_FUNIL.map(({ valor, label }) => {
        const leadsDoEstagio = leads.filter(l => l.status_conversao === valor);
        return (
          <div key={valor} className="flex-shrink-0 w-72">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-xs font-black uppercase tracking-wide text-muted-foreground">{label}</h3>
              <span className="text-xs font-black text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                {leadsDoEstagio.length}
              </span>
            </div>
            <div className="space-y-3">
              {leadsDoEstagio.map(lead => (
                <Surface key={lead.id} variant="card" padding="md" className="flex flex-col">
                  <p className="font-black text-foreground text-sm leading-tight">{lead.nome_visitante}</p>
                  <p className="text-xs font-medium text-muted-foreground mt-0.5">
                    {lead.telefone_visitante || 'Sem telefone'}
                  </p>
                  {lead.agenda?.atividade && (
                    <p className="text-[11px] font-bold text-muted-foreground mt-1">{lead.agenda.atividade}</p>
                  )}
                  <div className="mt-2">
                    <EstagioDropdown
                      lead={lead}
                      onAlterarEstagio={alterarEstagio}
                      isProcessando={isProcessandoEstagio(lead.id)}
                    />
                  </div>
                  <FollowupLead
                    lead={lead}
                    onSalvar={salvarFollowup}
                    isSalvando={isSalvandoFollowup(lead.id)}
                  />
                </Surface>
              ))}
              {leadsDoEstagio.length === 0 && (
                <p className="text-xs font-medium text-muted-foreground italic px-1">Nenhum lead neste estágio.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Lint + build**

Run: `npm run lint && npm run build`
Expected: PASS em ambos.

- [ ] **Step 3: Commit**

```bash
git add webapp/src/components/leads/FunilLeads.jsx
git commit -m "feat(leads): kanban FunilLeads com as 6 colunas de estágio"
```

---

### Task 8: Wire da 3ª aba em `Leads.jsx`

**Files:**
- Modify: `webapp/src/pages/Leads.jsx`

**Interfaces:**
- Consumes: `<FunilLeads />` (Task 7).
- Produces: `visaoAtiva` passa a aceitar `'cards' | 'funil' | 'lista'`.

- [ ] **Step 1: Import**

```jsx
import FunilLeads from '../components/leads/FunilLeads';
```

- [ ] **Step 2: Botão "Funil" no alternador de visão**

Entre o botão "Ação" e o botão "Histórico Completo", adicionar:

```jsx
<button
  onClick={() => setVisaoAtiva('funil')}
  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black uppercase transition-all ${
    visaoAtiva === 'funil'
      ? 'bg-card text-warning shadow-sm border border-border'
      : 'text-muted-foreground hover:text-foreground'
  }`}
>
  <TrendingUp size={18} /> Funil
</button>
```

(`TrendingUp` já está importado no topo do arquivo.)

- [ ] **Step 3: Ajustar o cálculo de `loading`**

Trocar:

```js
const loading = visaoAtiva === 'cards' ? loadingPendentes : loadingHistorico;
```

por:

```js
const loading = visaoAtiva === 'cards' ? loadingPendentes : visaoAtiva === 'lista' ? loadingHistorico : false;
```

(a aba "funil" tem seu próprio spinner interno via `useLeadsFunil` dentro
de `FunilLeads`, evita um spinner duplicado no nível da página.)

- [ ] **Step 4: Renderizar `<FunilLeads />` no branch certo**

Não reescrever os blocos JSX existentes da Visão Cards nem da Visão
Histórico — só inserir o branch novo entre os dois. Localizar o texto
exato (única ocorrência no arquivo):

```jsx
      ) : (
        /* Visão Histórico */
```

E substituir por:

```jsx
      ) : visaoAtiva === 'funil' ? (
        <FunilLeads />
      ) : (
        /* Visão Histórico */
```

(isso insere o branch `visaoAtiva === 'funil'` entre o fechamento do
bloco "Visão Cards (Ação)" e a abertura do bloco "Visão Histórico",
sem tocar no conteúdo de nenhum dos dois.)

- [ ] **Step 5: Lint + build**

Run: `npm run lint && npm run build`
Expected: PASS em ambos.

- [ ] **Step 6: Commit**

```bash
git add webapp/src/pages/Leads.jsx
git commit -m "feat(leads): 3ª aba Funil na página de Leads"
```

---

### Task 9: Verificação manual end-to-end + push + PR

**Files:** nenhum (task de verificação/integração)

- [ ] **Step 1: Rodar a suíte inteira uma última vez**

Run: `npm run test && npm run lint && npm run build` (a partir de `webapp/`)
Expected: PASS nos três.

- [ ] **Step 2: Preview manual no browser (contra staging)**

Suba o dev server do `webapp` (`npm run dev` ou via preview do harness),
logue como admin de um estúdio real em staging, vá em `/leads` e:

1. Aba "Funil": confirme as 6 colunas e que os ~140 leads existentes
   aparecem nas colunas certas (quem tinha aula marcada → "Aula
   Agendada"; sem aula → "Novo"; já convertidos/perdidos nas colunas
   finais).
2. Mude o estágio de um lead pelo dropdown do card; confirme que ele
   sai da coluna antiga e aparece na nova após o refetch.
3. Agende um follow-up no passado (badge "Atrasado" vermelho), depois
   edite para mais tarde hoje (badge "Hoje" amarelo), depois para um dia
   futuro (badge "Agendado: DD/MM HH:mm" azul); limpe o follow-up e
   confirme que volta a mostrar "Agendar follow-up".
4. Abra a aba "Ação": confirme que continua mostrando só os leads nos 4
   estágios ativos (o lead movido para "Convertido"/"Perdido" no passo 2
   já não aparece lá, se for o caso).
5. Abra a aba "Histórico Completo": confirme que a coluna "Status" agora
   usa o dropdown de 6 estágios (`EstagioDropdown`) e que trocar o
   estágio por ali também funciona.

- [ ] **Step 3: Push da branch e abertura do PR**

```bash
git push -u origin <nome-da-branch>
gh pr create --title "feat(leads): funil de vendas básico (estágios + follow-up agendado)" --body "..."
```

No corpo do PR, mencionar explicitamente: a migration já foi validada em
staging (`qjmybxkfjkxttggdjxga`) mas **ainda não foi promovida para
produção** — deve ser aplicada em produção só junto do deploy do
frontend desta feature (ver `docs/DEPLOY.md`, seção 1), para não deixar
a produção atual filtrando por um `status_conversao = 'pendente'` que o
RPC já não escreve mais.
