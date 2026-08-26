# Nexofy

Plataforma SaaS multi-tenant para gestão de estúdios de fitness e dança — alunos, professores, agenda, comissões, financeiro e mais, com cada estúdio operando de forma completamente isolada dentro da mesma base de código e do mesmo banco de dados.

🔗 **Produção:** [Nexofy](https://www.nexofy.com.br/)

---

## 📌 Sobre o projeto

Estúdios de dança e fitness normalmente gerenciam alunos, professores, agenda de aulas e comissões em planilhas ou sistemas genéricos que não refletem a realidade do negócio (aulas avulsas, matrículas recorrentes, comissionamento por professor, feriados que afetam a agenda, etc). O Nexofy resolve isso como uma aplicação **multi-tenant**: múltiplos estúdios usam a mesma aplicação, com dados completamente isolados entre si, e um painel de super-admin que permite suporte via impersonation controlada.

O projeto foi construído do zero por mim — modelagem de dados, políticas de segurança, back-end (Supabase/Postgres) e front-end (React) — e passa atualmente por um processo contínuo de auditoria de segurança e qualidade de código.

---

## 🏗️ Arquitetura

```
┌─────────────────────────┐        ┌──────────────────────────┐
│        Front-end         │        │         Supabase          │
│  React + Vite + TanStack │──────▶ │  PostgreSQL + RLS         │
│  Query + Tailwind        │        │  RPCs (funções SQL)       │
└─────────────────────────┘        │  Edge Functions            │
                                    │  Auth                      │
                                    └──────────────────────────┘
```

**Front-end**
- **React + Vite** — SPA com roteamento por perfil (aluno, professor, admin do estúdio, super-admin)
- **TanStack Query** — cache e sincronização de estado do servidor, evitando refetch desnecessário
- **Camada de serviços** (`*Service.js`) — toda chamada ao Supabase passa por um service dedicado por domínio (alunos, professores, comissões, planos...), nunca direto do componente

**Back-end (Supabase)**
- **PostgreSQL com Row Level Security (RLS)** — cada tabela sensível tem políticas que restringem o acesso por `estudio_id`, como segunda camada de defesa além do filtro da aplicação
- **RPCs (funções SQL)** para operações que precisam ser atômicas — por exemplo, agendamento de aulas avulsas, onde múltiplos usuários podem competir pela última vaga
- **Edge Functions** para rotinas que não devem rodar no client (geração de repasses financeiros, controle de acesso de professores)

### Decisões de arquitetura que valem destaque

**1. Isolamento multi-tenant em duas camadas**
Todo dado sensível é filtrado por `estudio_id` tanto na query do front-end quanto via RLS no banco. Isso foi uma decisão deliberada após identificar, em auditoria, que uma chamada de serviço sem `estudio_id` definido fazia o Supabase silenciosamente ignorar o filtro `.eq('estudio_id', ...)` — sem RLS, isso teria vazado dados entre estúdios diferentes.

**2. Concorrência resolvida no banco, não na aplicação**
Agendamentos de aulas avulsas usam uma RPC (`agendar_avulso`) que valida disponibilidade e insere o registro dentro da mesma transação, protegida por `pg_advisory_xact_lock`. Antes, a validação de "vaga lotada" acontecia no front-end via string matching (`.includes('lotada')`) — frágil e sujeito a condição de corrida. Migrar essa lógica para o banco elimina a possibilidade de duas pessoas ocuparem a mesma vaga simultaneamente.

**3. Impersonation segura para suporte**
O painel de super-admin permite "entrar" temporariamente como um estúdio específico para dar suporte, via uma RPC (`set_estudio_override`) e um contexto dedicado (`ImpersonationContext`) — sem nunca expor credenciais reais do tenant.

---

## ⚙️ Como rodar localmente

### Pré-requisitos
- Node.js 18+
- Conta e projeto no [Supabase](https://supabase.com)

### Passos

```bash
# 1. Clone o repositório
git clone https://github.com/devpedroschuster/nexofy.git
cd nexofy/webapp

# 2. Instale as dependências
npm install

# 3. Configure as variáveis de ambiente (apontando pro projeto de staging, não produção)
cp .env.example .env
# Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY com os dados do projeto de staging

# 4. Inicie o servidor de desenvolvimento
npm run dev
```

A aplicação sobe em `http://localhost:5173`.

---

## 🚦 Fluxo de deploy: staging → produção

Existem dois projetos Supabase — **staging** (dev local aponta pra cá por padrão) e
**produção**. Toda migration nova roda em staging primeiro:

```bash
# 1. Escreva a migration em supabase/migrations/
# 2. Aplique em staging e teste a app apontada pra lá
supabase link --project-ref <ref-do-staging>
supabase db push

# 3. Só depois de validado, promova pra produção
supabase link --project-ref <ref-de-producao> --password "$SUPABASE_DB_PASSWORD"
supabase db push
```

O baseline atual (`supabase/migrations/00000000000000_baseline_current_schema.sql`) foi
reconstruído via introspecção do schema de produção — antes dele não existia nenhuma
migration versionada no repo. O histórico real das ~60 migrations aplicadas em produção
(2026-08 em diante) fica arquivado em `supabase/migration-history/`, fora da pasta que a
CLI executa, só como referência.

Automatizar esse gate staging → produção via CI é o próximo passo natural (ver
"Próximos passos" abaixo).

---

## 🧩 Principais funcionalidades

- Cadastro e gestão de alunos, professores e planos por estúdio
- Agenda de aulas com controle de vagas e aulas avulsas
- Cálculo e gestão de comissões de professores
- Painel financeiro (DRE, repasses)
- Área do aluno e área do professor com permissões próprias
- Painel de super-admin com métricas entre estúdios e impersonation

---

## 🔒 Desafios técnicos resolvidos

| Desafio | Solução |
|---|---|
| Filtros de tenant sendo ignorados quando `estudio_id` chegava `undefined` | Padronização de um `idEfetivo` derivado de `useAuth()` + `useImpersonation()`, com RLS como rede de segurança |
| Condição de corrida em agendamento de vagas limitadas | RPC transacional com `pg_advisory_xact_lock` |
| Professores enxergando agenda vazia em produção | Identificação de política RLS de `SELECT` ausente na tabela de presenças |
| Edge Functions sem validação de autenticação | Adição de guards de auth e correção de padrões N+1 nas funções de repasse |

---

## 🗂️ Estrutura do repositório

```
nexofy/
├── webapp/                    # Aplicação React (front-end)
├── supabase/
│   ├── migrations/            # Migrations que a CLI de fato aplica (staging → produção)
│   ├── migration-history/     # Histórico real de migrations pré-baseline, só para referência
│   └── functions/             # Edge Functions
├── .gitignore
└── README.md
```

---

## 🛣️ Próximos passos

- Cobertura de testes automatizados nos services críticos
- CI com verificação de lint e build antes de merge, incluindo automatizar o gate
  staging → produção (rodar `supabase db push` em staging antes de liberar merge)
- Documentação de API interna dos services
- Dump anonimizado de produção para popular o staging com dados de teste realistas

---

## 👤 Autor

**Pedro Schuster**
[LinkedIn](https://www.linkedin.com/in/pedro-regus-schuster-382b04104/) · devpedroschuster@gmail.com