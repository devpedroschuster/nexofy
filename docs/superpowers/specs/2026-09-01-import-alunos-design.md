# PED-106: Import de planilha de alunos — design

Linear: [PED-106](https://linear.app/pedro-schuster/issue/PED-106/landing-promete-importar-alunosplanosturmas-mas-a-funcionalidade-nao)

## Problema

A landing promete "Alunos, planos e turmas migram para o Nexofy em poucos
passos — sem digitar tudo de novo", mas essa funcionalidade não existe: hoje
só há cadastro manual de aluno, um por vez, via `NovoAluno.jsx`. O público-alvo
do produto (estúdio saindo de planilha) normalmente já tem uma lista pronta de
alunos ativos — forçar recadastro manual de dezenas/centenas de alunos é
fricção real de onboarding.

## Decisões (aprovadas em brainstorming)

- **Escopo**: dados cadastrais do aluno **+ matrícula em plano** (não só
  cadastro). Sem mapeamento de modalidade — aluno importado com plano fica
  sem modalidade selecionada; admin completa isso depois na tela do aluno.
- **Mensalidade no import**: **não gera**. Matricular um aluno importado
  vincula o plano (`alunos.plano_id`, `historico_planos`), mas não insere em
  `mensalidades` — o aluno já tem histórico de pagamento próprio fora do
  Nexofy; gerar uma cobrança pendente nova em massa no momento do import
  seria enganoso. O ciclo de cobrança normal (`gerar-mensalidades`) assume a
  partir do próximo mês.
- **E-mail duplicado**: `alunos.email` é `UNIQUE` **global** (não por
  estúdio) — se já existe, a linha é **pulada e reportada** no resumo final,
  nunca atualiza um cadastro existente.
- **Plano não encontrado**: nomes de plano na planilha que não batem com
  nenhum `planos.nome` do estúdio disparam uma **tela de mapeamento manual**
  antes da importação rodar — admin escolhe, para cada nome não reconhecido,
  um plano existente ou "sem plano".
- **Formato da planilha**: **mapeamento livre de colunas** — admin sobe
  qualquer planilha (.xlsx/.xls/.csv) como está; uma tela mostra as colunas
  encontradas com um dropdown por coluna dizendo o que ela é. Sem template
  fixo obrigatório.

## Restrições que guiam o design

- `alunos.nome_completo`/`email` são **nullable no banco** — "obrigatório" é
  regra de aplicação (`alunoSchema`, `webapp/src/lib/validation.js`), não de
  schema. O import precisa reaplicar essa mesma validação por linha.
- Criação de aluno e matrícula em plano **já não são atômicas hoje** no
  cadastro manual (`NovoAluno.jsx` faz duas chamadas de rede separadas:
  insert em `alunos`, depois RPC `matricular_aluno`) — isso já é aceito no
  fluxo atual (toast avisa se a segunda falhar). O import herda o mesmo
  padrão, mas como processa muitas linhas de uma vez, cada linha precisa de
  tratamento de erro isolado (uma linha falhar não pode abortar o lote).
- `matricular_aluno` (RPC existente) sempre insere em `mensalidades` — não
  serve para o import sem modificação. Em vez de adicionar um parâmetro
  condicional a uma function já usada pelo cadastro manual (risco
  desnecessário sobre um caminho existente, e — lição da PED-105— adicionar
  parâmetro via `CREATE OR REPLACE` cria overload em vez de substituir a
  function se não for feito com `DROP FUNCTION` primeiro), o import ganha uma
  RPC nova e separada, só para esse caso de uso.
- Criação do aluno em si reaproveita o mesmo caminho de insert direto que
  `alunosService.criar` já usa (`supabase.from('alunos').insert(...)`,
  protegido pela RLS policy `tenant_insert` existente) — não precisa de RPC
  nova para essa parte.
- `xlsx@0.18.5` já é dependência do projeto, usado hoje só para **exportar**
  (`Despesas.jsx`, `Comissoes.jsx`, via `await import('xlsx')` — lazy,
  guardado contra falha de chunk desatualizado). Este é o primeiro uso de
  **leitura** (`XLSX.read`/`sheet_to_json`) no projeto.
- Não existe hoje nenhum componente de upload de arquivo reutilizável nem
  nenhuma convenção de UX para import em lote (progress bar, tabela de erro
  por linha) — este design estabelece o padrão pela primeira vez.

## Design

### 1. Backend — nova RPC de matrícula sem mensalidade

Nova migration adiciona `importar_matricula_aluno(p_aluno_id bigint,
p_plano_id integer, p_data_inicio date, p_data_fim date, p_estudio_id uuid)
RETURNS void`, `SECURITY DEFINER`, espelhando os mesmos checks de
`matricular_aluno` (caller é admin do `p_estudio_id`; aluno e plano
pertencem ao estúdio) e as mesmas escritas em `alunos`
(`plano_id`/`modalidades_selecionadas` fica `'{}'`/`ativo`/
`data_inicio_plano`/`data_fim_plano`) e `historico_planos` (finaliza o
`ativo` anterior, insere um novo com `status='ativo'`, `valor_pago` = preço
do plano) — **sem** o insert final em `mensalidades`. Function nova e
isolada, não uma alteração em `matricular_aluno` (que continua servindo só
o cadastro manual, sem risco de regressão).

### 2. Frontend — wizard em `/alunos/importar`

Nova rota, acessível por um botão "Importar planilha" ao lado de "Novo
Aluno" na tela `/alunos`. Passos:

1. **Upload** — `.xlsx`/`.xls`/`.csv` via um componente de arquivo novo
   (`webapp/src/components/shared/FileDropInput.jsx` ou similar), `xlsx`
   carregado via `await import('xlsx')` (mesmo padrão lazy + guarda de chunk
   desatualizado de `Despesas.jsx`/`Comissoes.jsx`), parse com
   `XLSX.utils.sheet_to_json(sheet, {header: 1})` para pegar linhas cruas
   (array de arrays), primeira linha como cabeçalho.
2. **Mapear colunas** — cada cabeçalho detectado ganha um dropdown pro campo
   correspondente (Nome completo\*, E-mail\*, Telefone, CPF, Data de
   nascimento, CEP, Rua, Número, Complemento, Bairro, Cidade, Contato de
   emergência, Plano, "Ignorar esta coluna"). Sugestão automática de mapeamento
   por nome aproximado do cabeçalho (ex.: "email"/"e-mail"/"correio" →
   E-mail), mas sempre editável. Continuar exige Nome completo + E-mail
   mapeados.
3. **Mapear planos** — coleta os valores distintos da coluna mapeada como
   "Plano" (se houver), compara (case-insensitive, trim) contra
   `planosService.listar(estudioId)`; para cada valor sem correspondência
   exata, mostra um dropdown: escolher um plano existente ou "sem plano
   (não matricular)".
4. **Pré-visualização** — cada linha passa por `alunoSchema.validate(...,
   {abortEarly:false})` (mesma regra do cadastro manual) depois de mapeada
   pros nomes de campo corretos; e-mails são checados em lote contra
   `alunos.email` existentes (`select email from alunos where email =
   any($1)`) pra marcar prováveis duplicatas antes de tentar importar.
   Tabela mostra status por linha (✓ válida / ⚠ erro, com a mensagem).
5. **Importar** — processamento sequencial linha a linha com barra de
   progresso ("Importando N de M"): (a) insere o aluno via o mesmo padrão de
   allowlist de `alunosService.criar`; (b) se a linha tem plano resolvido,
   chama `importar_matricula_aluno`. Erro em uma linha (e-mail duplicado
   real na hora do insert, RLS, etc.) é capturado e registrado — nunca
   aborta o lote inteiro.
6. **Resumo** — contagens finais (N alunos criados, M matriculados em plano,
   K pulados) com lista expansível de linhas puladas/com erro e o motivo,
   pra o admin corrigir e reimportar só essas.

### 3. Testes

- `webapp/src/lib/importAlunos.js` — lógica pura extraída e testada via TDD
  genuína: parse de linhas cruas (array de arrays) em objetos, sugestão de
  mapeamento de coluna por nome de cabeçalho, correspondência de nome de
  plano (normalizado), validação de linha reutilizando `alunoSchema`. Segue
  a convenção já usada no projeto (`rotaModulo.js`, `trial.js` da PED-105) —
  sem `@testing-library/react`, sem teste de render de componente; só a
  lógica pura de `lib/*.js` é testada, os componentes ficam sem teste
  automatizado.
- Passagem manual em staging: upload de planilha real pequena (2-3 linhas,
  incluindo 1 duplicata de e-mail e 1 plano não reconhecido) → confirma
  fluxo completo até o resumo final, aluno duplicado pulado, plano mapeado
  manualmente aplicado corretamente.

## Fora de escopo

- Import de planos/modalidades/turmas em si (só matrícula de aluno em plano
  **já existente** no estúdio) — criar planos/modalidades continua manual.
- Seleção de modalidade por linha da planilha.
- Geração de mensalidade/cobrança no momento do import.
- Atualização de cadastro existente via reimport (e-mail duplicado sempre
  pula, nunca atualiza).
- Template fixo de planilha para download.
