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

Auditoria de código confirmada (PED-18): `gerarRepassesMensais` só é
importada e chamada em `webapp/src/pages/Comissoes.jsx`, sempre como
`onConfirm` de `<ModalPreviewRepasses>` — não existe nenhum outro botão ou
fluxo no frontend que gere o lote mensal sem passar por esse modal.

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
