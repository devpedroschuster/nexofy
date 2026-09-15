# App Mobile PRO — Gestor & Instrutor (V1)

Data: 2026-09-15
Status: aprovado (arquitetura, navegação e escopo) — em desenvolvimento (UI)

## Contexto

O Nexofy já tem um app mobile (`mobile/`) exclusivo para o aluno ("Área do
Aluno"), documentado em
[`2026-09-09-app-mobile-area-aluno-design.md`](./2026-09-09-app-mobile-area-aluno-design.md).
Agora precisamos de um segundo app mobile, dedicado a **gestor** (papel
`admin`) e **instrutor** (papel `professor`) — inspirado no modelo do
concorrente Next Fit, que oferece um app separado chamado "Next Fit Pro"
(distinto do app do aluno) para quem toca o negócio no dia a dia.

Levantamento do Next Fit Pro (App Store + central de ajuda, já que não há
acesso às telas reais): abas de Dashboard (indicadores), Clientes, Agenda,
Financeiro, Comissões, Treinos, WOD e Comandas. Login com as mesmas
credenciais do sistema web.

Decisão de escopo (usuário, brainstorming 2026-09-15): o V1 cobre só o
essencial operacional — **Dashboard, Agenda + Presença/chamada, Alunos,
Financeiro/Comissões**. Treinos/WOD, Comandas e Leads/funil de vendas no
mobile ficam registrados no Linear para versões futuras (PED-197, PED-198,
PED-199) — os dois primeiros exigem schema novo que não existe hoje no
Nexofy, o domínio atual é estúdio de fitness/dança, não academia com
loja/bar.

## Decisões fechadas

| Decisão | Escolha | Motivo |
|---|---|---|
| Projeto | Novo app Expo em `mobile-pro/`, separado de `mobile/` | Espelha o Next Fit real (dois apps distintos na loja) — é o que o usuário pediu ("app dedicado") |
| Papéis no mesmo app | Único app, telas adaptadas por papel (`admin` vs `professor`) | Mesmo modelo do Next Fit Pro (app único, permissão controla o que aparece) e do próprio webapp Nexofy hoje |
| Stack | Expo (managed) + React Navigation (bottom tabs) + TanStack Query + NativeWind + Zustand (tema) | Mesmo padrão já validado no `mobile/` — reaproveita convenções, não introduz stack nova |
| Backend | **Nenhuma mudança** — reaproveita RPCs/services existentes | `presencaService`, `dashboardService`, `useRepassesProfessor` e as queries com RLS que já isolam `admin`/`professor` no webapp já cobrem 100% do escopo do V1 |
| Autenticação | E-mail + senha (Supabase Auth), mesmas credenciais do webapp | Reaproveita 100% do auth existente; resolve o papel do mesmo jeito que `webapp/src/hooks/useAuth.jsx` |
| Escopo de mutação | V1 é majoritariamente leitura + ações já existentes (chamada, WhatsApp) | Operações administrativas pesadas (lançar pagamento manual, gerar repasses, criar/editar aluno ou aula) continuam só no webapp — evita recriar formulários grandes no V1 |
| Tema dinâmico | Reaproveita a heurística já portada em `mobile/src/lib/theme/corMarca.ts` | Mesmo campo (`estudios.cor_primaria/cor_secundaria/logo_url`), mesma lógica — copiado (duplicação intencional, mesma decisão já tomada no `mobile/`, sem monorepo) |
| Fora do V1 | Treinos/WOD, Comandas, Leads/funil de vendas no mobile, criar/editar aula, feriados, espaços, lançar pagamento manual, gerar repasses, criar/editar aluno | Ver Linear PED-197/198/199 para os três primeiros; os demais continuam fluxos de "configuração"/back-office, mais adequados ao desktop |

## Papéis e permissões

Reaproveita exatamente o que já existe em `estudio_membros.role` /
`webapp/src/hooks/useAuth.jsx`:

- `admin` → gestor do estúdio, acesso a tudo do estúdio.
- `professor` → instrutor, acesso restrito às próprias turmas/alunos/comissões
  (mesmo filtro por `professor_id` que `ProfessorAlunos.jsx` e
  `ProfessorComissoes.jsx` já aplicam).
- `super_admin` e `aluno`: **não são suportados no V1**. Login com esses
  papéis mostra uma tela de bloqueio orientando a usar o canal certo (web
  para super_admin, Área do Aluno para aluno).

## Árvore de navegação

```
RootNavigator                         (decide pela sessão do Supabase Auth)
├── AuthStack                         (sem sessão)
│   └── Login
│
├── PapelNaoSuportadoScreen           (sessão de aluno/super_admin)
│
└── AppTabs                           (abas filtradas por estudio.modulos_ativos + papel)
    ├── DashboardStack → Dashboard (conteúdo varia por papel)
    ├── AgendaStack → AgendaSemana, DetalheAula (modal com chamada)
    ├── AlunosStack → ListaAlunos, DetalheAluno (somente leitura)
    ├── FinanceiroStack → admin: Inadimplência · professor: MeusRepasses
    └── PerfilStack → Perfil
```

## Escopo de telas do V1 — por papel

**Dashboard**
- Gestor: KPIs do mês (receita, alunos ativos, inadimplência), aniversariantes
  hoje/próximos 7 dias, ação rápida "cobrar"/"parabenizar" via WhatsApp
  (`Linking.openURL('https://wa.me/...')`, mesma lógica de
  `gerarLinkWhatsApp` do webapp `Dashboard.jsx`). Fonte: `dashboardService`.
- Instrutor: próxima aula agendada, resumo de comissões do mês (pago vs.
  pendente, via `useRepassesProfessor`), atalho para "Fazer chamada hoje".

**Agenda + Presença/chamada**
- Lista de aulas dos próximos dias — gestor vê a grade inteira do estúdio,
  instrutor só as próprias turmas (filtra por `professor_id`, mesmo padrão de
  `ProfessorAlunos.jsx`).
- Tela de chamada por aula: porta 1:1 a lógica de
  `webapp/src/pages/Agenda/hooks/useListaPresenca.js` —
  `presencaService.listarChamadaCompleta`, `registrarCheckin`,
  `registrarFalta`, `removerFalta`, `cancelarAgendamento`. É a ação mais
  valiosa do app (equivalente ao "Modo Kiosk" do webapp, agora na mão de
  quem está na sala).
- Sem criar/editar aula, sem gerenciar feriados/espaços — fica no webapp.

**Alunos**
- Gestor: lista/busca de todos os alunos do estúdio, contato (tel/WhatsApp),
  última presença, status de pagamento — **somente leitura no V1**.
- Instrutor: "Meus Alunos" — porta direta de `ProfessorAlunos.jsx` (busca,
  filtro por modalidade, contato, última presença).
- Sem criar/editar aluno (formulário grande, fica no webapp).

**Financeiro**
- Gestor: lista de inadimplência com ação "cobrar via WhatsApp" — mesma
  fonte de dados do Dashboard (`listaInadimplentes`). Sem lançar pagamento
  manual, sem gerar repasses.
- Instrutor: "Meus Repasses/Comissões" — porta direta de
  `ProfessorComissoes.jsx` (KPIs, navegação por mês, tabela de repasses).

**Perfil**
- Nome, e-mail, estúdio ativo, papel, logout. Sem edição de dados pessoais
  no V1 (baixo valor para este público, comparado ao aluno).

## Estrutura de pastas

```
mobile-pro/
├── src/
│   ├── navigation/       # RootNavigator, AuthStack, AppTabs (mesmo padrão do mobile/)
│   ├── screens/          # telas por domínio (Dashboard, Agenda, Alunos, Financeiro, Perfil)
│   ├── features/         # hooks de domínio (auth, dashboard, agenda, alunos, financeiro)
│   ├── lib/              # supabase client, queryClient, theme (corMarca copiado do mobile/)
│   ├── types/            # tipos espelhando o schema (reaproveita os já existentes quando possível)
│   └── components/       # ui/ (burra, sem Supabase) e shared/
```

## Testes

Mesmo padrão do `mobile/`: Jest para helpers/hooks puros (ex.: a lógica
portada de `deriveEstadoChamada`/`montarPayloadPresenca`, cálculo de KPIs do
Dashboard), teste manual em device/simulador antes de dar como pronto. Sem
infraestrutura de E2E mobile no repo ainda — mesma limitação do `mobile/`.

## Fora do escopo do V1

Treinos/WOD, Comandas, Leads/funil de vendas no mobile (Linear PED-197,
PED-198, PED-199), criar/editar aula, feriados, espaços, lançar pagamento
manual, gerar repasses mensais, criar/editar aluno, edição de perfil.
