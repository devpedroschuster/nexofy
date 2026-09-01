# PED-105: Trial de 14 dias — design

Linear: [PED-105](https://linear.app/pedro-schuster/issue/PED-105/implementar-feature-de-trial-de-14-dias-hoje-e-so-promessa-de)
Follow-up (fora de escopo aqui): [PED-115](https://linear.app/pedro-schuster/issue/PED-115/cobranca-automatica-pos-trial-plano-pago-self-service-com-cartao) — cobrança automática pós-trial.

## Problema

A landing page promete "14 dias grátis, sem cartão", mas não existe nenhuma regra
de trial no produto: um estúdio recém-criado tem acesso indefinido, sem controle
de expiração. Esta issue implementa a regra de verdade.

## Decisões (aprovadas em brainstorming)

- **Marco que dispara a contagem**: criação do estúdio (não confirmação de e-mail).
- **Comportamento na expiração**: bloqueio total, reaproveitando a tela já existente
  `EstudioBloqueado.jsx`. Não tenta cobrar cartão — não existe infraestrutura de
  cobrança da Nexofy para estúdios hoje (Asaas só serve para o estúdio cobrar seus
  próprios alunos). Cobrança automática fica para o PED-115.
- **Estúdios já existentes**: isentos do trial (`trial_ends_at` fica `NULL`, sem
  prazo).
- **Estúdios criados por super_admin** (onboarding manual/comercial via
  `SuperAdminNovoEstudio.jsx`): também nascem sem prazo — presume-se acordo
  comercial fora do fluxo self-service.
- **Banner de dias restantes**: sempre visível durante os 14 dias (não só nos
  últimos dias), visível apenas para o admin do estúdio.

## Restrição estrutural que guia o design

`estudio_id_atual()` — a função que praticamente toda RLS policy do banco chama
para resolver "qual é o estúdio atual" — hoje exige `e.status = 'ativo'` na sua
subquery. Isso significa que, durante um trial ativo, `estudios.status` **precisa
continuar `'ativo'`** — a expiração do trial não pode ser modelada mudando o enum
de `status` sem reescrever dezenas de policies. A expiração é rastreada numa
coluna separada (`trial_ends_at`), e o gate de acesso é aplicado estendendo a
própria `estudio_id_atual()`.

## Design

### 1. Dado & início do trial

- Nova migration adiciona `trial_ends_at timestamptz null` em `estudios`. Sem
  default — linhas existentes ficam `NULL` (isentas), satisfazendo a decisão de
  grandfathering.
- `criar_estudio_transacional(...)` ganha um novo parâmetro
  `p_iniciar_trial boolean default true`. Quando `true`, insere
  `trial_ends_at = now() + interval '14 days'`; quando `false`, `NULL`.
  - `criar-meu-estudio` (self-service) chama a RPC sem passar o parâmetro (usa o
    default `true`).
  - `criar-estudio` (super_admin) passa `p_iniciar_trial => false` explicitamente.

### 2. Enforcement — bloqueio real no banco, não só redirect de UI

- `verificar_status_estudio()` passa a retornar também `trial_ends_at` e
  `motivo_bloqueio` (`'status'` ou `'trial_expirado'`). `bloqueado` passa a ser
  `true` quando `status <> 'ativo'` **OU** o trial expirou.
- `estudio_id_atual()` tem sua subquery (o branch não-impersonado) estendida com
  `AND (e.trial_ends_at IS NULL OR e.trial_ends_at > now())`. Como é uma única
  função central, todas as RLS policies que dependem dela herdam o novo filtro
  automaticamente — sem tocar em policy individual. Isso dá defesa em profundidade
  real: um estúdio com trial expirado não consegue ler/escrever dados nem via
  chamada direta à API, não só via redirect do frontend.
- Impersonação/super_admin não é afetada: `estudio_ativo_via_override()` é
  avaliado primeiro no `coalesce()` de `estudio_id_atual()`.

### 3. Frontend

- `useAuth.jsx` passa a expor `trial_ends_at`/`motivo_bloqueio` (já vêm no mesmo
  fetch paralelo de `verificar_status_estudio()`, sem round-trip extra) e deriva
  `diasRestantesTrial`.
- `EstudioBloqueado.jsx` ganha um branch de mensagem para `trial_expirado`
  ("seu período de teste acabou" + CTA existente "falar com o suporte" via
  mailto — sem upgrade self-service ainda, isso é o PED-115).
- Novo banner fino, visível apenas para `perfil === 'admin'`, mostrado do dia 1
  ao dia 14: "Período de teste — faltam X dias", com tom mais intenso quando
  restam ≤ 3 dias.

### 4. Alavanca manual para o time (até o PED-115 existir)

- A tabela de estúdios do super_admin (`TabelaEstudios.jsx`) ganha uma badge de
  dias de trial por linha e uma nova ação no menu, "Remover trial", que zera
  `trial_ends_at` via uma nova RPC pequena — seguindo exatamente o mesmo padrão
  já usado por `alterarStatusEstudio` (suspender/reativar).

### 5. Sem cron/job de varredura

A expiração é avaliada de forma preguiçosa (lazy) no carregamento de sessão via
`verificar_status_estudio()` — igual ao mecanismo já existente para
inativo/suspenso/cancelado. Evita adicionar uma nova edge function agendada só
para isso.

## Fora de escopo

- Cobrança automática / captura de cartão / conversão automática trial→pago —
  isso é o [PED-115](https://linear.app/pedro-schuster/issue/PED-115/cobranca-automatica-pos-trial-plano-pago-self-service-com-cartao).
- UI de "upgrade" ou checkout para o admin do estúdio.
- Qualquer sweep/cron job de expiração — o gate é avaliado sob demanda.

## Testes

- Migration aplicada em staging antes de produção (por instrução de projeto).
- Testes de banco/SQL: estúdio com trial expirado fica bloqueado;
  estúdio isento (`trial_ends_at IS NULL`) nunca bloqueia; impersonação
  contorna o bloqueio.
- Testes automatizados de frontend: a lógica pura de `webapp/src/lib/trial.js`
  (`diasRestantesTrial`, `chaveMensagemBloqueio`) é coberta por
  `webapp/src/lib/trial.test.js`. Os componentes que consomem essa lógica
  (`TrialBanner.jsx`, `EstudioBloqueado.jsx`) não têm teste automatizado —
  mesma convenção do resto do codebase, que não tem `@testing-library/react`
  nem testes de render de componente em nenhum outro lugar. Cobertura desses
  componentes é manual (ver passagem manual abaixo).
- Passagem manual: cadastro self-service → banner aparece → forçar expiração
  no banco → tela de bloqueio aparece → ação "Remover trial" no super_admin
  desbloqueia.
