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
