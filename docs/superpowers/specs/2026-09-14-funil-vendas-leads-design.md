# Funil de vendas básico (estágios + follow-up agendado)

Data: 2026-09-14
Status: aprovado com o usuário — em implementação

## Contexto

Hoje a página de Leads (`webapp/src/pages/Leads.jsx`, rota `/leads`) é um
"CRM de Experimentais" com um único campo `status_conversao` de 3 valores
(`pendente`/`convertido`/`perdido`) e um campo de observação livre. Não há
estágios intermediários (ex.: "já foi contatado?", "está negociando
plano?") nem forma de agendar quando retomar contato com um lead — o
admin depende de memória ou de ferramentas externas.

Não existe issue no Linear cobrindo esse escopo; é trabalho novo.

## Decisões validadas com o usuário

| Decisão | Escolha |
|---|---|
| Relação com `status_conversao` | O funil **substitui** o campo atual — os estágios passam a ser a única forma de acompanhar o lead, com `convertido`/`perdido` como estágios finais (mantém compatibilidade com a lógica de matrícula que já grava nesses dois valores) |
| Estágios | `novo → contatado → aula_agendada → negociacao → convertido/perdido` (5 estágios + 1 alternativo de saída) |
| Follow-up | Campo de data/hora + nota, com indicador visual (atrasado/hoje/agendado) no card. Sem notificação externa (e-mail/push) — fora do escopo "básico" |
| Interação no kanban | Dropdown/botão no card para mudar de estágio (mesmo padrão do `StatusDropdown` já existente). Sem drag-and-drop — nenhuma biblioteca de DnD está instalada no projeto hoje, e adicionar uma é desproporcional a um MVP |
| Localização na UI | Nova 3ª aba "Funil" em `Leads.jsx`, ao lado de "Ação" e "Histórico Completo" — não substitui as visões existentes |

## Modelo de dados

### Migration `supabase/migrations/20260914020000_funil_vendas_estagios_leads.sql`

Mudança aditiva (nenhuma coluna/tabela é removida) — sem necessidade de
migration "down" pelo runbook do PED-41 (só migrations destrutivas
exigem down).

```sql
-- 1. Remove o CHECK antigo primeiro — enquanto não existe nenhum CHECK
--    sobre status_conversao, a coluna aceita qualquer texto, o que deixa
--    o backfill do passo 2 livre para gravar os novos valores. Rodar
--    ADD CONSTRAINT antes do backfill faz a validação da constraint
--    nova falhar contra as linhas 'pendente' que ainda não foram
--    migradas; rodar o UPDATE antes do DROP falha contra a constraint
--    ANTIGA, que não conhece 'aula_agendada'/'novo'. A ordem
--    DROP → UPDATE → ADD é a única que funciona nos dois lados.
alter table public.leads drop constraint leads_status_conversao_check;

-- 2. Backfill dos leads existentes com 'pendente': quem já tem aula/data
--    marcada vira 'aula_agendada' (reflete a realidade — a maioria dos
--    leads hoje nasce com uma aula experimental já agendada via
--    criar_lead_com_presenca); os demais viram 'novo'.
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

-- 4. criar_lead_com_presenca passa a definir o estágio inicial conforme
--    o lead já nasce com aula/data vinculada (fluxo normal, criado pelo
--    admin/professor a partir de uma aula) ou não (captação pública da
--    Landing, sem aula selecionada).
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

Nota: `criarLeadPublico` (captação pública, `p_aula_id: null`) hoje falha
por um bug pré-existente e não relacionado
(`leads.data_visita` é `NOT NULL`, ver PED-192) — fora de escopo desta
migration, tratado separadamente.

## Serviço e hooks

### `webapp/src/lib/funilLeads.js` (novo — fonte única de metadados)

- `ESTAGIOS_FUNIL`: array ordenado `{ valor, label, tone }` para os 6
  estágios (tone reaproveita as variantes já existentes de `Badge`:
  neutral/info/brand/warning/success/destructive).
- `ESTAGIOS_ATIVOS` = os 4 estágios não-finais (`novo`, `contatado`,
  `aula_agendada`, `negociacao`) — usado para filtrar a visão "Ação".
- `ESTAGIOS_FINAIS` = `['convertido', 'perdido']` — usado pelo optimistic
  update de `useAtualizarStatusLead()` (ver abaixo).
- `classificarFollowup(proximoFollowupEm: string | null)`: função pura
  que retorna `'atrasado' | 'hoje' | 'agendado' | null`, comparando com
  `new Date()`. Testável isoladamente (sem depender de componente/hook).

### `leadsService.js`

- `SELECT_BASE` ganha `proximo_followup_em, nota_followup`.
- `listarLeadsPendentes`, `listarLeadsPendentesPorMes`,
  `listarResumoLeadsPendentes`: trocam `.eq('status_conversao', 'pendente')`
  por `.in('status_conversao', ESTAGIOS_ATIVOS)` — mesmo resultado de
  hoje (tudo que não é convertido/perdido), agora cobrindo os 4 estágios.
- Novo `listarLeadsFunil(estudioId)`: busca todos os leads (mesmo
  `SELECT_BASE`) para montar o kanban — sem filtro de período no MVP.
- Novo `atualizarFollowupLead(leadId, { proximoFollowupEm, notaFollowup }, estudioId)`.

### `useLeads.ts`

- Tipo `Lead.status_conversao` ampliado para os 6 valores; novos campos
  `proximo_followup_em: string | null` e `nota_followup: string | null`.
- Novo `useLeadsFunil()` — query key `['leads', estudioId, 'funil']`.
- Novo `useAtualizarFollowupLead()` — mesmo padrão de optimistic
  update + rollback que `useAtualizarObservacaoLead()` já usa.
- `useAtualizarStatusLead()`: a lógica que hoje remove o lead da lista
  de "pendentes" quando `status !== 'pendente'` passa a checar
  `!ESTAGIOS_FINAIS.includes(status)`. A query `funil` não recebe
  optimistic update dedicado — o `onSettled` já existente
  (`invalidateQueries(['leads', estudioId])`) cobre o refetch dela;
  simplificação deliberada para manter o escopo "básico" (sem
  reordenar cards entre colunas no mesmo frame da mutação).

## UI

Novos componentes em `webapp/src/components/leads/` (mantém `Leads.jsx`
focado em orquestrar as 3 abas, sem crescer mais):

- `EstagioDropdown.jsx`: generaliza o `StatusDropdown` atual (que hoje
  vive inline em `Leads.jsx` com 3 opções fixas) para os 6 estágios de
  `ESTAGIOS_FUNIL`, reaproveitado tanto pela coluna "Status" da tabela de
  Histórico quanto pelos cards do Funil — elimina a duplicação que
  existiria se o Funil criasse seu próprio dropdown.
- `FollowupLead.jsx`: mesmo padrão de `ObservacaoLead` (clique para
  expandir). Sem valor definido: botão "Agendar follow-up" abre inputs de
  data/hora (`datetime-local`) + nota. Com valor definido: badge
  "Atrasado" (destructive) / "Hoje" (warning) / "Agendado para
  DD/MM HH:mm" (info), com opção de editar ou limpar.
- `FunilLeads.jsx`: kanban com 6 colunas na ordem de `ESTAGIOS_FUNIL`,
  scroll horizontal (mesmo padrão `overflow-x-auto` já usado nos cards de
  resumo mensal). Cada card reaproveita a estrutura visual dos cards da
  aba "Ação" (nome, telefone, modalidade) + `EstagioDropdown` +
  `FollowupLead`.

`Leads.jsx`: `visaoAtiva` passa a aceitar `'cards' | 'funil' | 'lista'`;
terceiro botão no alternador de visão chama `useLeadsFunil()` e renderiza
`<FunilLeads />`.

## Fora de escopo (YAGNI para "básico")

- Notificação ativa (e-mail/push) quando o follow-up vence — só
  indicador visual ao abrir o painel.
- Drag-and-drop entre colunas do kanban.
- Filtro de período na aba Funil (mostra todos os leads; se o volume
  crescer a ponto de pesar, é um ajuste futuro incremental).
- Estágios configuráveis por estúdio — lista fixa para todos os tenants.
- PED-192 (bug pré-existente da captação pública) — issue separada, não
  bloqueia esta entrega.

## Testes

- Vitest para `classificarFollowup` (casos: passado, hoje em horários
  diferentes, futuro, `null`) e para a ordenação/labels de
  `ESTAGIOS_FUNIL`/`ESTAGIOS_ATIVOS`.
- Sem infraestrutura de teste de RPC/SQL no repo (mesma constatação do
  spec da lista de espera) — verificação manual do fluxo (mudar estágio,
  agendar/editar/limpar follow-up, badges atrasado/hoje/agendado, abas
  Ação/Histórico continuam mostrando os mesmos leads de antes) via
  preview do webapp contra o Supabase de staging.
