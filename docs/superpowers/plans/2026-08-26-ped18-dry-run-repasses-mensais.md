# PED-18 — Garantir dry-run obrigatório antes do fechamento mensal de repasses

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task (tarefa de auditoria + documentação, sem necessidade de subagentes por task). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Confirmar (por auditoria de código) que `preview-repasses-mensais` já é sempre executado antes de `gerar-repasses-mensais` no único caminho de produção existente hoje (o painel admin), e documentar isso como processo obrigatório — cobrindo também os caminhos que NÃO passam pela UI (chamada direta da function, e o cron ainda não confirmado).

**Architecture:** Sem mudança de lógica de negócio. Esta é uma tarefa de auditoria + documentação (severidade "Processo" no ticket, não "Alto"). Adiciona um runbook (`supabase/functions/gerar-repasses-mensais/RUNBOOK.md`) e reforça, com comentários apontando para ele, os dois lugares onde alguém poderia pular a etapa de preview: o próprio `config.toml` (cron ainda não habilitado) e o topo de `index.ts`.

**Tech Stack:** Nenhuma nova — só documentação e comentários em código já existente (React/JSX no frontend, Deno no edge function).

**Spec:** Ticket Linear [PED-18](https://linear.app/pedro-schuster/issue/PED-18/financeiro-garantir-dry-run-preview-repasses-mensais-antes-do) — "Confirmar que `preview-repasses-mensais` (já existe) é sempre executado manualmente antes do `gerar-repasses-mensais` real no fechamento do mês. Documentar como processo obrigatório."

## Global Constraints

- Não habilitar o `[[cron]]` de `gerar-repasses-mensais/config.toml` — ele já está marcado como não confirmado (PED-33) e continua fora de escopo aqui; o runbook deve reforçar isso explicitamente.
- Não duplicar conteúdo entre código e documentação — comentários no código apontam para o runbook, não repetem o texto inteiro.

---

## File Structure

- **Create** `supabase/functions/gerar-repasses-mensais/RUNBOOK.md` — processo obrigatório de fechamento mensal.
- **Modify** `supabase/functions/gerar-repasses-mensais/index.ts` — comentário no topo apontando para o runbook.
- **Modify** `supabase/functions/gerar-repasses-mensais/config.toml` — comentário reforçando a dependência do dry-run antes de qualquer automação futura do cron.
- **Test:** não há lógica nova para testar; a verificação é uma auditoria manual dos pontos de chamada (Task 1) + revisão humana do runbook (Task 2).

---

### Task 1: Auditar todos os pontos que chamam `gerar-repasses-mensais`

**Files:**
- Read-only: `webapp/src/pages/Comissoes.jsx`, `webapp/src/components/ModalPreviewRepasses.jsx`, `webapp/src/services/repasseService.js`, `supabase/functions/gerar-repasses-mensais/config.toml`

- [ ] **Step 1: Confirmar que o único caminho de produção (painel admin) força preview antes de gerar**

Rode:
```bash
grep -rn "gerarRepassesMensais\|previewRepassesMensais" webapp/src --include=*.jsx --include=*.js
```

Confirme que `gerarRepassesMensais` só é chamado a partir de `Comissoes.jsx:567`, dentro do `handleConfirmarGeracao` passado como `onConfirm` para `<ModalPreviewRepasses>` (`Comissoes.jsx:720`), e que `ModalPreviewRepasses.jsx` só mostra o botão "Confirmar e Gerar" (que dispara `onConfirm`) quando `estado === 'pronto'` — estado que só é setado depois de `previewRepassesMensais` retornar com sucesso (`ModalPreviewRepasses.jsx:169-191`, `219-237`). **Resultado esperado da auditoria: confirmado — não existe nenhum botão/fluxo no frontend que chame `gerarRepassesMensais` sem antes ter carregado o preview.**

- [ ] **Step 2: Confirmar os caminhos que NÃO passam pela UI**

Rode:
```bash
grep -n "cron" supabase/functions/gerar-repasses-mensais/config.toml
```

Confirme que o `[[cron]]` está presente mas com o aviso "ATENÇÃO (PED-33): ... não uma decisão de produto confirmada" já no arquivo (linhas 5-13) — ou seja, hoje ele existe na config mas **não deveria estar ativo em produção** até ser revisado; e que chamadas diretas via `curl`/API (bypassando o painel) também não têm nenhuma barreira que force o preview antes — isso é uma lacuna real, tratada no runbook (Task 2) como responsabilidade de processo, não de código, dado que o ticket pede "documentar como processo obrigatório" (severidade "Processo").

- [ ] **Step 3: Nenhum commit neste task** — é só auditoria, o resultado alimenta o runbook do Task 2.

---

### Task 2: Escrever o runbook e apontar para ele no código

**Files:**
- Create: `supabase/functions/gerar-repasses-mensais/RUNBOOK.md`
- Modify: `supabase/functions/gerar-repasses-mensais/index.ts`
- Modify: `supabase/functions/gerar-repasses-mensais/config.toml`

- [ ] **Step 1: Criar o runbook**

```markdown
# Fechamento mensal de repasses — processo obrigatório

> Referenciado a partir de `index.ts` e `config.toml` desta pasta. PED-18.

## Regra obrigatória

**Nunca rode `gerar-repasses-mensais` para um estúdio/mês sem antes rodar
`preview-repasses-mensais` para o mesmo estúdio/mês e revisar o resultado.**

`gerar-repasses-mensais` insere lançamentos reais em `repasses_lancamentos`
(dinheiro que vira comissão de professor). Não há como desfazer via UI — a
única forma de corrigir um lote gerado errado é apagar manualmente os
lançamentos no banco. `preview-repasses-mensais` roda exatamente o mesmo
cálculo e não insere nada — é a única forma de pegar erro de configuração
(`configuracoes_repasse` desatualizada), aluno sem modalidade vinculada,
professor sem cadastro etc. **antes** de gerar o lote real.

## Caminho já protegido: painel admin

O botão "Gerar Repasses do Mês" (página Comissões,
`webapp/src/pages/Comissoes.jsx`) abre `ModalPreviewRepasses`
(`webapp/src/components/ModalPreviewRepasses.jsx`), que:

1. Ao abrir, chama `preview-repasses-mensais` automaticamente e mostra o
   resumo por professor.
2. Só exibe o botão "Confirmar e Gerar" depois que o preview carrega com
   sucesso (`estado === 'pronto'`).
3. Só então chama `gerar-repasses-mensais`.

**Não existe, e não deve ser criado, nenhum atalho no frontend que gere o
lote mensal sem passar por esse modal.** Se um dia for necessário um botão
"gerar direto" em algum outro lugar do painel, ele precisa reusar
`ModalPreviewRepasses`, não chamar `gerarRepassesMensais` diretamente.

## Caminhos NÃO protegidos por código — exigem disciplina manual

Estes casos não passam pelo modal, e não há (ainda) nenhuma trava no
backend que force o preview antes deles:

- **Chamada manual via `curl`/Postman/script** direto para
  `gerar-repasses-mensais` (com JWT de admin ou `x-cron-secret`). Antes de
  fazer isso, rode manualmente o mesmo request contra
  `preview-repasses-mensais` primeiro e confira o resultado.
- **Cron em `config.toml`** — está definido mas **não deve ser habilitado em
  produção** até o time confirmar (ver aviso PED-33 no próprio arquivo):
  o dia/horário do fechamento, e o fato de que a function hoje só processa
  UM `estudioId` por chamada (um cron real precisaria iterar todos os
  estúdios ativos). Se/quando isso for implementado, o job de cron precisa
  antes gerar (ou reusar) um preview e só prosseguir automaticamente se o
  resultado bater com algum critério de segurança combinado com o time —
  **isso ainda não existe** e é um projeto separado, não coberto por este
  ticket.

## Checklist antes de qualquer fechamento mensal fora do painel

- [ ] Rodei `preview-repasses-mensais` para o estúdio e mês exatos que vou fechar.
- [ ] Revisei o total geral e o breakdown por professor no retorno do preview.
- [ ] Não há avisos (`avisos[]`) inesperados no preview (aluno sem modalidade, professor sem vínculo, etc.) — ou, se há, entendo por que e está OK ignorar.
- [ ] Confirmei que `jaGerados` é `false` no preview (se for `true`, o lote já existe — rodar `gerar-repasses-mensais` de novo vai falhar com 409, por design).
- [ ] Só depois disso, chamo `gerar-repasses-mensais` para o mesmo estúdio/mês.
```

- [ ] **Step 2: Apontar para o runbook no topo de `index.ts`**

No topo do arquivo `supabase/functions/gerar-repasses-mensais/index.ts`, logo abaixo do comentário de cabeçalho existente, adicionar:

```typescript
// PED-18: esta function insere lançamentos financeiros reais e não tem
// desfazer via UI. NUNCA chame diretamente sem antes rodar
// preview-repasses-mensais para o mesmo estúdio/mês — ver o processo
// obrigatório em ./RUNBOOK.md.
```

- [ ] **Step 3: Reforçar o aviso em `config.toml`**

Adicionar, imediatamente acima do bloco `[[cron]]` existente (mantendo o aviso PED-33 já presente):

```toml
# PED-18: se/quando este cron for habilitado, ele precisa garantir a
# mesma garantia que o painel admin dá hoje (preview antes de gerar) —
# ver supabase/functions/gerar-repasses-mensais/RUNBOOK.md. Não habilitar
# este bloco sem resolver isso primeiro.
```

- [ ] **Step 4: Verificação manual**

Releia `RUNBOOK.md` do zero, como se fosse a primeira vez que alguém do time abre este diretório — confirme que dá pra entender a regra e o checklist sem precisar abrir `Comissoes.jsx`/`ModalPreviewRepasses.jsx` primeiro (self-contained).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/gerar-repasses-mensais/RUNBOOK.md supabase/functions/gerar-repasses-mensais/index.ts supabase/functions/gerar-repasses-mensais/config.toml
git commit -m "docs(financeiro): documenta dry-run obrigatório antes do fechamento mensal de repasses (PED-18)"
```

---

## Self-Review

1. **Cobertura do spec:** "confirmar que preview sempre roda antes do real" → Task 1 (auditoria, resultado: confirmado para o caminho de produção via painel). "documentar como processo obrigatório" → Task 2 (RUNBOOK.md + apontamentos no código). ✅
2. **Placeholder scan:** nenhum — a lacuna real (cron/chamada direta sem trava de código) é documentada explicitamente como risco conhecido e fora de escopo, não como TODO disfarçado.
3. **Consistência:** não há interfaces de código entre tasks (é documentação); Task 2 depende do resultado da auditoria do Task 1, que é citado diretamente no texto do runbook.
