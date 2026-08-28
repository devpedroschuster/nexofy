# Frente 6 — Plano de Rollback e Runbook de Incidente (PED-40/41/42/43)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (documentação de processo, sem lógica nova de código — sem necessidade de subagentes por task, mesmo padrão do PED-18). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Documentar o plano de rollback (frontend na Vercel, migration de banco) e o processo de resposta a incidente (monitoramento, pausa de processamento financeiro, comunicação com cliente, post-mortem) — Frente 6 do backlog.

**Architecture:** Sem mudança de lógica de negócio — é documentação de processo (mesma natureza do PED-18/`RUNBOOK.md`). Estende `docs/DEPLOY.md` com duas seções novas (rollback de frontend, migration de "down") e cria dois documentos novos (runbook de incidente e template de post-mortem) que se referenciam entre si e aos artefatos já existentes (`gerar-repasses-mensais/RUNBOOK.md` do PED-18, `docs/OBSERVABILIDADE.md` do PED-35, dashboard `SaudeSistema` do PED-34) em vez de duplicar conteúdo.

**Tech Stack:** Nenhuma nova — Markdown, mais um exemplo ilustrativo de SQL (down migration).

**Spec:** Tickets Linear [PED-40](https://linear.app/pedro-schuster/issue/PED-40/runbook-documentar-rollback-de-frontend-na-vercel), [PED-41](https://linear.app/pedro-schuster/issue/PED-41/runbook-escrever-migration-de-down-antes-de-toda-migration-critica-de), [PED-42](https://linear.app/pedro-schuster/issue/PED-42/runbook-escrever-runbook-de-incidente-monitoramento-rollback), [PED-43](https://linear.app/pedro-schuster/issue/PED-43/runbook-template-de-post-mortem-para-incidentes-que-afetam-cliente) — todos "Frente 6: Plano de Rollback e Runbook de Incidente".

## Global Constraints

- Não habilitar `[[cron]]` de `gerar-repasses-mensais/config.toml` — continua fora de escopo (PED-33), como já valia para o PED-18.
- Não duplicar conteúdo entre documentos: cada doc novo referencia o doc-fonte (ex.: o runbook de incidente aponta pra `docs/DEPLOY.md` em vez de repetir o passo a passo da Vercel).
- `supabase/migrations-down/` é só histórico/referência manual — o Supabase CLI só aplica migrations de `supabase/migrations/`. Nunca colocar um arquivo de "down" dentro de `supabase/migrations/` (ele seria aplicado como migration de verdade).
- Projeto Vercel confirmado via MCP: **`nexofy`** (team `pedrinhoschuster95-1498s-projects`, linkado a `devpedroschuster/nexofy` no GitHub) — único projeto Vercel da conta, sem ambiguidade a verificar.

---

## File Structure

- **Modify** `docs/DEPLOY.md` — adiciona seção 5 (PED-40, rollback de frontend) e seção 6 (PED-41, migration de "down").
- **Create** `supabase/migrations-down/README.md` — convenção de down migrations (PED-41).
- **Create** `docs/RUNBOOK_INCIDENTE.md` — runbook de incidente, 5 seções (PED-42).
- **Create** `docs/POST_MORTEM_TEMPLATE.md` — template de post-mortem (PED-43).
- **Test:** não há lógica nova de código pra testar. Verificação é releitura humana de cada doc (mesmo padrão do PED-18) + conferência de que todo caminho/seção citados por link cruzado existem de fato no repo.

---

### Task 1: PED-40 — Rollback de frontend na Vercel

**Files:**
- Modify: `docs/DEPLOY.md` (adiciona seção 5, após a seção 4 que termina na linha 111)

- [ ] **Step 1: Adicionar a seção 5 em `docs/DEPLOY.md`**

Adicionar ao final do arquivo:

```markdown

## 5. Rollback de frontend na Vercel (PED-40)

Todo deploy de frontend vai automaticamente pro projeto **nexofy** na
Vercel (conta `pedrinhoschuster95-1498s-projects`, linkado ao repo GitHub
`devpedroschuster/nexofy` — ver seção 3). A Vercel guarda cada deployment
de produção anterior pronto pra reativar em 1 clique, sem rebuild — é o
rollback de frontend mais rápido disponível, mais rápido que reverter o
commit e esperar um novo deploy.

### Quando usar

O frontend novo quebrou em produção (erro visível pro cliente, tela
branca, funcionalidade essencial fora do ar) e a causa está no código do
último deploy — não no backend/banco (nesse caso, ver "Como reverter uma
migration" em `docs/RUNBOOK_INCIDENTE.md`).

### Passo a passo (painel Vercel)

1. Acesse https://vercel.com/pedrinhoschuster95-1498s-projects/nexofy/deployments
   (login com a conta dona do projeto).
2. A lista mostra os deployments mais recentes primeiro, com o de produção
   atual marcado "Current". Ache o **último deployment de produção que
   funcionava** — confirme pela data/commit message que é de fato anterior
   ao que quebrou.
3. Clique no menu "**⋯**" (três pontinhos) desse deployment → **"Promote
   to Production"**.
4. Confirme. A Vercel reaponta o domínio de produção pra esse build já
   existente — não recompila nada, então é praticamente instantâneo
   (segundos, não minutos).
5. Confirme visualmente que o site voltou ao normal (recarregue a página
   de produção sem cache: Ctrl+Shift+R).

### Alternativa via CLI (se o painel estiver inacessível)

```bash
npx vercel link      # primeira vez só, linka esta pasta ao projeto nexofy
npx vercel rollback  # lista deployments recentes e promove o escolhido
```

### Depois do rollback

- O commit problemático continua em `main` — corrija a causa raiz (PR
  novo) antes de mexer em `main` de novo. Um push novo em `main` substitui
  automaticamente o rollback manual (a Vercel promove o deployment mais
  recente que passar no build), então sem a correção o próximo deploy
  automático reintroduz o bug.
- Registre o incidente — ver `docs/RUNBOOK_INCIDENTE.md` e, se afetou
  cliente pagante, `docs/POST_MORTEM_TEMPLATE.md` (PED-43).
```

- [ ] **Step 2: Verificação manual**

Releia a seção 5 do zero — confirme que o link da Vercel, o nome do
projeto (`nexofy`) e o time (`pedrinhoschuster95-1498s-projects`) batem
com o que existe de fato (`list_projects`/`list_teams` do MCP da Vercel
já confirmaram esses valores durante o planejamento — não precisa
reconfirmar, só checar que o texto final não introduziu erro de digitação).

- [ ] **Step 3: Commit**

```bash
git add docs/DEPLOY.md
git commit -m "docs(deploy): documenta rollback de frontend via Promote to Production na Vercel (PED-40)"
```

---

### Task 2: PED-41 — Migration de "down" antes de toda migration crítica

**Files:**
- Modify: `docs/DEPLOY.md` (adiciona seção 6, após a nova seção 5 do Task 1)
- Create: `supabase/migrations-down/README.md`

**Interfaces:**
- Consumes: seção 1 de `docs/DEPLOY.md` já existente ("Sequência segura de deploy de backend" — migration aditiva → function → frontend → migration de limpeza).
- Produces: convenção de pasta `supabase/migrations-down/<timestamp>_<nome>.sql`, referenciada pela seção 3 de `docs/RUNBOOK_INCIDENTE.md` no Task 3.

- [ ] **Step 1: Adicionar a seção 6 em `docs/DEPLOY.md`**

Adicionar ao final do arquivo (após a seção 5 do Task 1):

```markdown

## 6. Migration de "down" antes de toda migration crítica (PED-41)

**Regra de ouro:** nenhuma migration destrutiva (`DROP COLUMN`, `DROP
TABLE`, `DROP FUNCTION`, `ALTER ... DROP`, ou qualquer `UPDATE`/`DELETE`
em massa irreversível) entra em produção sem que, antes:

1. A migration de "down" correspondente já esteja escrita e revisada (ver
   convenção abaixo).
2. A migration "up" já tenha passado por pelo menos **um ciclo de release
   completo em produção só como aditiva** — a coluna/tabela/função antiga
   ainda existe e não é mais lida nem escrita por nenhum código em
   produção (passos 1-3 da seção 1 acima), antes do passo destrutivo
   (passo 4 da seção 1).

O Supabase CLI não tem suporte nativo a "down migrations" (diferente de
Rails/Django) — `supabase db push` só aplica migrations pra frente, na
ordem dos arquivos em `supabase/migrations/`. Por isso a convenção aqui é
manual:

### Convenção

- Toda migration crítica em `supabase/migrations/<timestamp>_<nome>.sql`
  ganha um arquivo irmão em **`supabase/migrations-down/<timestamp>_<nome>.sql`**
  (mesmo timestamp e nome — só a pasta muda) com o SQL que desfaz
  exatamente essa migration.
- **Nunca colocar o arquivo de "down" dentro de `supabase/migrations/`** —
  o Supabase CLI aplicaria os dois como migrations independentes (a
  "down" rodaria pra frente também, desfazendo a "up" imediatamente). A
  pasta `supabase/migrations-down/` é só documentação/histórico — nunca é
  executada automaticamente por `supabase db push` nem por CI.
- Pra aplicar um rollback de verdade num incidente, rode o conteúdo do
  arquivo de "down" manualmente contra o banco (`supabase db execute -f
  supabase/migrations-down/<arquivo>.sql --project-ref <ref-de-producao>`
  ou cole no SQL Editor do painel Supabase) — não existe um comando
  automático "desfazer última migration".
- Ver `supabase/migrations-down/README.md` pro detalhe de como escrever
  cada tipo de "down".

### Exemplo

Migration "up" que remove uma coluna não usada:
```sql
-- supabase/migrations/20261001120000_drop_coluna_legada_x.sql
ALTER TABLE public.estudios DROP COLUMN IF EXISTS coluna_legada_x;
```

Down correspondente, escrito e revisado **antes** de aplicar a de cima:
```sql
-- supabase/migrations-down/20261001120000_drop_coluna_legada_x.sql
-- Restaura a coluna removida por 20261001120000_drop_coluna_legada_x.sql.
-- Não restaura os DADOS que estavam na coluna (DROP COLUMN é destrutivo
-- pra dado) — só a estrutura. Se os dados importam, tire backup/snapshot
-- do banco antes de rodar a "up" (ver .github/workflows/db-backup.yml).
ALTER TABLE public.estudios ADD COLUMN IF NOT EXISTS coluna_legada_x text;
```
```

- [ ] **Step 2: Criar `supabase/migrations-down/README.md`**

```markdown
# migrations-down/

Scripts SQL que revertem migrations críticas de `supabase/migrations/` —
processo obrigatório descrito em `docs/DEPLOY.md` (seção 6, PED-41).

**Esta pasta nunca é executada automaticamente.** O Supabase CLI só olha
pra `supabase/migrations/`. Os arquivos aqui são referência manual pra
quando alguém precisa reverter uma migration de verdade num incidente —
ver `docs/RUNBOOK_INCIDENTE.md`.

## Convenção de nome

Mesmo timestamp e nome da migration "up" que o arquivo desfaz:

```
supabase/migrations/20261001120000_drop_coluna_legada_x.sql       (up)
supabase/migrations-down/20261001120000_drop_coluna_legada_x.sql  (down)
```

## Como escrever um "down" por tipo de mudança destrutiva

- **`DROP COLUMN coluna`** → down = `ADD COLUMN IF NOT EXISTS coluna
  <mesmo tipo>`. Restaura a estrutura, não os dados — se o dado importa,
  garanta um backup/snapshot antes de aplicar a "up" (não é
  responsabilidade do "down" recuperar dado já apagado pelo Postgres).
- **`DROP TABLE tabela`** → down = `CREATE TABLE IF NOT EXISTS tabela
  (...)` com o schema exato de antes (colunas, tipos, defaults, PK/FK).
  Igual ao caso acima: dado não volta sozinho, só estrutura — recuperar
  dado de uma tabela dropada depende de backup
  (`.github/workflows/db-backup.yml`) ou do point-in-time recovery do
  Supabase.
- **`DROP FUNCTION funcao(args)`** → down = recriar a função com o
  `CREATE OR REPLACE FUNCTION` completo (copiar de
  `supabase/migration-history/` ou do último `pg_dump` se a função for
  antiga o suficiente pra não estar em nenhuma migration ativa).
- **`RENAME`** (coluna, tabela ou função) → down = o `RENAME` inverso
  (nome novo → nome antigo). Mais simples que os casos acima porque não
  perde estrutura nem dado.

## Como testar um "down" antes de confiar nele

Rode a "up" e a "down" em sequência contra um banco de teste/staging
(nunca produção) e confirme que o schema final bate com o schema antes
da "up":

```bash
supabase link --project-ref <ref-do-staging>
supabase db push                                    # aplica a "up" (e as anteriores pendentes)
supabase db execute -f supabase/migrations-down/<arquivo>.sql --project-ref <ref-do-staging>
```

Confirme o schema com `list_tables` (MCP do Supabase) ou `\d <tabela>`
via `psql`.
```

- [ ] **Step 3: Verificação manual**

Releia as duas seções — confirme que nenhum exemplo de código sugere
colocar um arquivo de "down" dentro de `supabase/migrations/` (a
restrição mais importante deste ticket).

- [ ] **Step 4: Commit**

```bash
git add docs/DEPLOY.md supabase/migrations-down/README.md
git commit -m "docs(deploy): formaliza migration de down antes de toda migration critica (PED-41)"
```

---

### Task 3: PED-42 — Runbook de incidente

**Files:**
- Create: `docs/RUNBOOK_INCIDENTE.md`
- Read-only (pra confirmar referências): `docs/DEPLOY.md` (seções 5-6 do Task 1/2), `docs/OBSERVABILIDADE.md`, `webapp/src/pages/SuperAdmin/components/SaudeSistema.jsx`, `supabase/functions/gerar-repasses-mensais/RUNBOOK.md`, `supabase/functions/gerar-repasses-mensais/config.toml`, `supabase/functions/webhook-pagamento/index.ts`

**Interfaces:**
- Consumes: seção 5 e 6 de `docs/DEPLOY.md` (Tasks 1-2), `docs/OBSERVABILIDADE.md` (metas de SLO, PED-35), dashboard `SaudeSistema` (PED-34, card "Erros de Edge Functions" linkando pro Sentry projeto `nexofy-edge-functions`), `gerar-repasses-mensais/RUNBOOK.md` (PED-18).
- Produces: `docs/RUNBOOK_INCIDENTE.md`, referenciado pelo Task 4 (`docs/POST_MORTEM_TEMPLATE.md`).

- [ ] **Step 1: Criar `docs/RUNBOOK_INCIDENTE.md`**

```markdown
# Runbook de incidente — Nexofy

> PED-42 (Frente 6: Plano de Rollback e Runbook de Incidente). Documento
> operacional: o que fazer *durante* um incidente em produção. Pra
> processo de deploy normal (sem incidente), ver `docs/DEPLOY.md`. Pra
> registrar o que aconteceu *depois*, ver `docs/POST_MORTEM_TEMPLATE.md`
> (PED-43).

## 1. Como identificar que há um incidente

Hoje não existe alerta automático/paging (ver `docs/OBSERVABILIDADE.md` —
as metas de SLO são informais, sem monitoramento automatizado de
disponibilidade). Identificação é manual, olhando estes três lugares:

1. **Painel SuperAdmin → "Saúde do sistema"**
   (`webapp/src/pages/SuperAdmin/components/SaudeSistema.jsx`):
   - Card "Mensalidades do mês": se `geradas` muito abaixo de `esperadas`
     no meio/fim do mês, a geração de mensalidades pode estar falhando.
   - Card "Latência webhook (p95)": badge vermelho = p95 acima da meta de
     `docs/OBSERVABILIDADE.md` (5s) — webhook do Asaas processando devagar
     ou com erro.
2. **Sentry, projeto `nexofy-edge-functions`** — link direto no terceiro
   card da mesma página (https://dev-pedro-schuster.sentry.io/issues/).
   Toda Edge Function usa `_shared/sentry.ts`; exceções não tratadas
   aparecem aqui automaticamente (requer o secret `SENTRY_DSN` configurado
   — se o card de erros parecer vazio demais, confirme que o secret não
   foi removido).
3. **Reclamação de cliente** (suporte/WhatsApp/email) — sinal mais direto
   e mais lento; se um cliente reportou algo, trate como incidente
   confirmado e siga direto pra comunicação (seção 5), mesmo sem
   confirmar ainda a causa técnica.

Se qualquer um dos três indicar problema real (não um pico isolado/falso
positivo), declare incidente e siga as seções abaixo na ordem que fizer
sentido pro caso.

## 2. Como reverter o frontend (Vercel)

Ver `docs/DEPLOY.md`, seção 5 (PED-40) — passo a passo completo de
"Promote to Production" no painel da Vercel (projeto `nexofy`).

Use isto quando o problema está no código do frontend (JS/CSS quebrado,
tela branca, regressão visual/funcional) e o deploy anterior era saudável.

## 3. Como reverter uma migration (se houver "down" preparado)

Ver `docs/DEPLOY.md`, seção 6 (PED-41) e `supabase/migrations-down/README.md`.

Resumo pra quem está sob pressão:

1. Confirme se existe um arquivo em `supabase/migrations-down/` com o
   mesmo timestamp da migration suspeita de causar o problema.
   - **Se não existir:** não há "down" pronto — reverter agora significa
     escrever e testar o SQL reverso na hora, contra staging primeiro,
     nunca direto em produção, mesmo em incidente. Avalie se dá pra
     mitigar de outra forma primeiro (rollback de frontend, seção 2, ou
     pausar processamento, seção 4) enquanto o "down" é escrito com
     calma.
   - **Se existir:** rode o conteúdo do arquivo contra produção via
     `supabase db execute -f supabase/migrations-down/<arquivo>.sql
     --project-ref <ref-de-producao>` (ou cole no SQL Editor do painel).
2. Depois de reverter, confirme (`list_tables` do MCP do Supabase ou
   `\d <tabela>` via psql) que o schema voltou ao esperado antes de
   liberar o incidente como resolvido.

## 4. Como pausar processamento financeiro

**Contexto atual (releia antes de agir): hoje não existe nenhum cron
ativo em produção** — `gerar-repasses-mensais` só roda quando alguém
clica manualmente em "Gerar Repasses do Mês" no painel (ver
`supabase/functions/gerar-repasses-mensais/RUNBOOK.md`, PED-18/PED-33).
Ou seja, na prática, "pausar" hoje é principalmente uma questão de
**comunicação, não de código**:

1. **Ação imediata (sempre funciona, é só disciplina):** avise quem tem
   acesso admin (hoje, só um usuário) pra não clicar em nenhum botão de
   geração financeira (Comissões → "Gerar Repasses do Mês", ou qualquer
   fluxo de `gerar-mensalidades`) até o incidente ser resolvido. Como não
   há cron nem automação hoje, isso sozinho já pausa 100% do
   processamento financeiro em lote.
2. **Se uma automação (cron/script) chegar a estar ativa no futuro** — o
   `[[cron]]` de `gerar-repasses-mensais/config.toml` está desabilitado
   hoje (ver aviso PED-33 no próprio arquivo), mas se/quando for
   habilitado: revogue o secret que autentica a chamada, `CRON_SECRET`
   (`supabase secrets unset CRON_SECRET` ou defina um valor novo que
   ninguém mais conhece) no projeto de produção. Isso quebra apenas a
   chamada automatizada (`x-cron-secret`) sem afetar chamadas manuais de
   admin (que usam JWT, um caminho de autenticação separado — ver
   comentário "AUTORIZAÇÃO" em
   `supabase/functions/gerar-repasses-mensais/index.ts`).
3. **Webhook de pagamento (`webhook-pagamento`) é diferente — normalmente
   NÃO deve ser pausado:** ele só grava status de pagamento e é
   idempotente (`webhook_events` com `UNIQUE event_id`, PED-12/14) — o
   Asaas reentrega automaticamente em caso de falha, então pausar esse
   webhook só atrasa a atualização de status sem necessidade, e cria uma
   fila de reentregas pra processar depois. Só pause-o (revogando
   `ASAAS_WEBHOOK_TOKEN`) se o incidente for especificamente nessa
   function causando dano ativo (ex.: um bug gravando status errado) — não
   como precaução genérica.
4. **Último recurso (evite, é lento de reverter):** `supabase functions
   delete <nome-da-function>` remove a function do ar até o próximo
   deploy. Só use se as opções acima não bastarem — redesplegar depois
   exige rodar o deploy de novo (`supabase functions deploy`), não é
   instantâneo como as opções acima.

## 5. Como comunicar o cliente

Template base — copiar, preencher os `[colchetes]`, revisar antes de
enviar (não mandar com placeholder sem preencher):

> Olá! Identificamos uma instabilidade em [funcionalidade afetada] a
> partir de [horário aproximado]. Já estamos trabalhando na correção e
> não é necessário nenhuma ação da sua parte agora. Assim que estiver
> resolvido, avisamos por aqui. Se você notar algo relacionado a isso nas
> próximas horas ([ex.: cobrança duplicada, repasse não gerado]), pode
> responder este mesmo email/mensagem que priorizamos.
>
> Pedimos desculpas pelo transtorno.

Regras:
- Envie assim que o incidente for **confirmado** (fim da seção 1), não
  espere a causa raiz — "estamos cientes, resolvendo" é suficiente e é
  melhor que silêncio.
- Se o incidente afetou dado financeiro (cobrança, repasse, mensalidade)
  de cliente pagante, isso **sempre** vira post-mortem depois — ver
  `docs/POST_MORTEM_TEMPLATE.md` (PED-43).
- Avise de novo quando resolver, mesmo que curto: "Resolvido — [o que foi
  a causa, em 1 frase, se já souber]".
```

- [ ] **Step 2: Verificação manual**

Releia o runbook do zero, como se fosse a primeira vez que alguém do time
abre este documento durante um incidente de verdade — confirme que cada
link cruzado (`docs/DEPLOY.md` seções 5/6, `docs/OBSERVABILIDADE.md`,
`gerar-repasses-mensais/RUNBOOK.md`, `docs/POST_MORTEM_TEMPLATE.md`)
aponta pra um arquivo/seção que existe de fato.

- [ ] **Step 3: Commit**

```bash
git add docs/RUNBOOK_INCIDENTE.md
git commit -m "docs(runbook): escreve runbook de incidente - monitoramento, rollback e comunicacao (PED-42)"
```

---

### Task 4: PED-43 — Template de post-mortem

**Files:**
- Create: `docs/POST_MORTEM_TEMPLATE.md`

**Interfaces:**
- Consumes: referenciado a partir da seção 5 de `docs/RUNBOOK_INCIDENTE.md` (Task 3).

- [ ] **Step 1: Criar `docs/POST_MORTEM_TEMPLATE.md`**

```markdown
# Template de post-mortem — Nexofy

> PED-43 (Frente 6). Preencha este template pra **qualquer incidente que
> afete cliente pagante** (cobrança errada, repasse incorreto, mensalidade
> duplicada/perdida, indisponibilidade durante uso ativo, etc.) — mesmo
> que o post-mortem saia curto. Objetivo: virar input direto pro Plano de
> Go-Live (registrar o aprendizado onde as decisões de produto/processo
> são revisadas), não burocracia.

Copie este arquivo pra `docs/post-mortems/AAAA-MM-DD-titulo-curto.md` e
preencha.

---

## [Título curto do incidente]

**Data/hora do incidente:** [AAAA-MM-DD HH:MM, timezone America/Sao_Paulo] até [HH:MM]
**Detectado por:** [dashboard SaudeSistema / Sentry / cliente reportou / outro]
**Clientes afetados:** [quantos estúdios/quantos alunos, ou "todos"]
**Severidade:** [ex.: financeiro incorreto / indisponibilidade total / degradação parcial]

### O que aconteceu

[Descrição factual, em ordem cronológica, do sintoma observado — o que o
cliente/admin viu, não ainda a causa. 2-5 frases.]

### Linha do tempo

- `HH:MM` — [primeiro sinal / detecção]
- `HH:MM` — [ação tomada, ex.: rollback via docs/RUNBOOK_INCIDENTE.md seção 2]
- `HH:MM` — [incidente mitigado/resolvido]
- `HH:MM` — [cliente comunicado, se aplicável]

### Causa raiz

[O "porquê" técnico — não só "o deploy X quebrou", mas por que aquele
deploy conseguiu quebrar isso (faltou teste? faltou preview de migration?
faltou o dry-run do PED-18? etc.). Se a causa raiz não for 100% clara,
diga isso explicitamente em vez de forçar uma explicação.]

### Impacto

[Dado concreto: quantas cobranças/repasses/mensalidades incorretas,
quanto tempo de indisponibilidade, se houve perda financeira e pra quem
(estúdio, professor, aluno, ou o próprio Nexofy).]

### O que já mitigou (correção imediata)

[O que foi feito pra parar o sangramento — rollback, hotfix, correção
manual de dado no banco, etc. Se envolveu editar dado direto no banco,
registrar exatamente o que foi rodado.]

### O que muda no processo (input pro Plano de Go-Live)

[A parte mais importante. Não é "vamos ter mais cuidado" — é uma mudança
concreta e verificável: um novo item de checklist, uma trava de código
nova, um teste novo, uma seção nova neste runbook. Se este incidente
revelou um gap no runbook (`docs/RUNBOOK_INCIDENTE.md`) ou no processo de
deploy (`docs/DEPLOY.md`), abra o ticket Linear pra corrigir o documento
junto com este post-mortem, e linke aqui.]

### Ação de acompanhamento

- [ ] [Ação 1 — com dono e, se souber, prazo]
- [ ] [Ação 2]
- [ ] Referenciado no Plano de Go-Live (Frente 6) — [link/nota de onde]
```

- [ ] **Step 2: Verificação manual**

Releia o template — confirme que cada campo entre `[colchetes]` é
autoexplicativo o bastante pra alguém preencher sob estresse, sem
precisar perguntar "o que vai aqui?".

- [ ] **Step 3: Commit**

```bash
git add docs/POST_MORTEM_TEMPLATE.md
git commit -m "docs(runbook): adiciona template de post-mortem para incidentes com cliente pagante (PED-43)"
```

---

## Self-Review

1. **Cobertura do spec:**
   - PED-40 ("documentar rollback de frontend, saber onde clicar") → Task 1, seção 5 de DEPLOY.md com passo a passo de clique + link direto. ✅
   - PED-41 ("down migration antes de toda migration crítica, golden rule") → Task 2, seção 6 de DEPLOY.md + convenção completa em `migrations-down/README.md`, incluindo o cuidado de não deixar o Supabase CLI aplicar o "down" como migration real. ✅
   - PED-42 (5 itens do esqueleto: monitoramento, rollback frontend, rollback migration, pausar financeiro, comunicar cliente) → Task 3, uma seção por item, cada uma linkando pro artefato certo em vez de duplicar. ✅
   - PED-43 (template de post-mortem, input pro Plano de Go-Live) → Task 4, template completo com seção explícita "input pro Plano de Go-Live". ✅
2. **Placeholder scan:** nenhum "TBD"/"implementar depois" — os `[colchetes]` do template de post-mortem (Task 4) são campos de preenchimento intencionais do template em si, não placeholders de plano incompleto. O "Plano de Go-Live" é referenciado como conceito (já citado em código hoje: `migration-history/20260821040239_idempotencia_financeira.sql:1`, `BannerImpersonation.jsx:13`) sem inventar um caminho de arquivo que não existe — confirmado via Linear (`get_project`/`list_documents` no projeto Nexofy) que não há doc formal dele no workspace hoje.
3. **Consistência:** nomes de arquivo/seção usados em referências cruzadas (`docs/DEPLOY.md` seções 5 e 6, `supabase/migrations-down/README.md`, `docs/RUNBOOK_INCIDENTE.md`, `docs/POST_MORTEM_TEMPLATE.md`) são idênticos entre a definição (Task que cria o arquivo) e todo uso posterior (Tasks seguintes). Vercel: nome do projeto (`nexofy`) e team (`pedrinhoschuster95-1498s-projects`) confirmados via MCP da Vercel antes de escrever o plano, não assumidos.
