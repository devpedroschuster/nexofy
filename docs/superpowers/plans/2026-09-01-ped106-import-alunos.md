# PED-106 — Import de planilha de alunos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o admin de um estúdio suba uma planilha (.xlsx/.xls/.csv) de alunos existentes, mapeie livremente as colunas, resolva nomes de plano não reconhecidos, valide as linhas e importe em lote — criando o aluno e, quando aplicável, matriculando-o no plano (sem gerar mensalidade automática).

**Architecture:** Um wizard novo em `/alunos/importar` (`webapp/src/pages/ImportarAlunos.jsx`) faz parsing client-side da planilha com `xlsx` (lazy-loaded, mesmo padrão já usado pra exportação), guia o admin por mapeamento de colunas → mapeamento de planos → pré-visualização/validação → importação sequencial linha a linha → resumo. A lógica pura (parsing, sugestão de coluna, correspondência de plano, validação de linha) fica isolada em `webapp/src/lib/importAlunos.js`, testável sem React. A escrita reaproveita o caminho de insert já existente (`alunosService.criar`) e uma RPC nova, `importar_matricula_aluno` — cópia de `matricular_aluon` sem o insert em `mensalidades` (decisão do design: import não gera cobrança automática).

**Tech Stack:** React 19 + Vite, `xlsx@0.18.5` (já instalado), `yup` (reaproveitando `alunoSchema`), Supabase (Postgres + RLS + RPC), Vitest.

**Spec:** [docs/superpowers/specs/2026-09-01-import-alunos-design.md](../specs/2026-09-01-import-alunos-design.md)

## Global Constraints

- Escopo: dados cadastrais do aluno **+ matrícula em plano**, **sem** mapeamento de modalidade e **sem** gerar mensalidade no import.
- E-mail duplicado (constraint `UNIQUE` **global**, não por estúdio): a linha é **pulada e reportada**, nunca atualiza um cadastro existente.
- Plano da planilha sem correspondência: tela de **mapeamento manual** antes de importar (escolher plano existente ou "sem plano").
- Planilha: **mapeamento livre de colunas** — sem template fixo, admin sobe qualquer arquivo e mapeia cada coluna encontrada.
- Nova RPC `importar_matricula_aluno` é uma function **nova e isolada** — não altera `matricular_aluno` (usado pelo cadastro manual), evitando qualquer risco de regressão nesse caminho existente.
- `xlsx` é sempre carregado via `await import('xlsx')` (lazy) e qualquer falha de import passa por `ehFalhaDeChunkDesatualizado` (`webapp/src/lib/chunkLoadError.js`), mesmo padrão de `Despesas.jsx`/`Comissoes.jsx`.
- Validação de linha reaproveita `alunoSchema` (`webapp/src/lib/validation.js`) — mesmas regras do cadastro manual, sem duplicar lógica de validação.
- Criação do aluno reaproveita o padrão de allowlist já existente (`alunosService.criar` / `CAMPOS_ATUALIZAVEIS`) — sem inserts diretos que bypassem o filtro de campos.
- Toda migration é aplicada e validada em **staging** (`qjmybxkfjkxttggdjxga`) antes de produção — confirme o project ref via `list_projects` antes de aplicar qualquer coisa.
- Este repo não tem `@testing-library/react` nem testes de render de componente em nenhum lugar — só a lógica pura de `lib/*.js` ganha teste automatizado (`lib/*.test.js`); páginas/componentes ficam sem teste automatizado, cobertos por passagem manual.

---

## File Structure

- **Create** `supabase/migrations/20260901200000_importar_matricula_aluno.sql` — nova RPC `importar_matricula_aluno`.
- **Modify** `webapp/src/services/alunosService.js` — novo método `matricularSemMensalidade`.
- **Create** `webapp/src/lib/importAlunos.js` — lógica pura: sugestão de mapeamento de coluna, parsing de linhas cruas, correspondência de nome de plano, validação de linha.
- **Create** `webapp/src/lib/importAlunos.test.js` — testes da lógica acima.
- **Create** `webapp/src/components/shared/FileDropInput.jsx` — input de arquivo reutilizável (novo padrão de UI, não existe hoje).
- **Create** `webapp/src/pages/ImportarAlunos.jsx` — o wizard completo (Upload → Mapear Colunas → Mapear Planos → Pré-visualização → Importar → Resumo).
- **Modify** `webapp/src/App.jsx` — import + rota `/alunos/importar`.
- **Modify** `webapp/src/pages/Alunos.jsx` — botão "Importar planilha" ao lado de "Novo Aluno".
- **Test:** `webapp/src/lib/importAlunos.test.js` (vitest, lógica pura) + passagem manual em staging (Task 4) — sem teste de render de componente, seguindo a convenção do resto do repo.

---

### Task 1: RPC de matrícula sem mensalidade + service

**Files:**
- Create: `supabase/migrations/20260901200000_importar_matricula_aluno.sql`
- Modify: `webapp/src/services/alunosService.js`

**Interfaces:**
- Produces: RPC `importar_matricula_aluno(p_aluno_id bigint, p_plano_id integer, p_data_inicio date, p_data_fim date, p_estudio_id uuid) RETURNS void`.
- Produces: `alunosService.matricularSemMensalidade(alunoId, planoId, estudioId)` → `Promise<{dataInicio, dataFim}>`, usado pelo Task 3.

- [ ] **Step 1: Confirmar o project ref de staging**

Rode `list_projects` (MCP Supabase) e confirme o projeto "Nexofy - staging" com ref `qjmybxkfjkxttggdjxga` — não assuma sem checar.

- [ ] **Step 2: Criar a migration**

`supabase/migrations/20260901200000_importar_matricula_aluno.sql`:
```sql
-- PED-106: matricula um aluno importado num plano SEM gerar mensalidade —
-- ao contrário de matricular_aluno (usado pelo cadastro manual), que
-- sempre insere uma linha em mensalidades. Function nova e isolada em vez
-- de alterar matricular_aluno: o cadastro manual continua exatamente como
-- está, sem nenhum risco de regressão por causa desta feature.
--
-- Alunos importados de uma planilha já têm histórico de pagamento próprio
-- fora do Nexofy — gerar uma cobrança pendente nova em massa no momento do
-- import seria enganoso. O plano fica vinculado ao aluno (alunos.plano_id,
-- historico_planos) e o ciclo de cobrança normal (gerar-mensalidades)
-- assume a partir do próximo mês.
--
-- Não mexe em modalidades_selecionadas (decisão do design: import não
-- mapeia modalidade) — a coluna fica no valor default ('{}').
CREATE OR REPLACE FUNCTION public.importar_matricula_aluno(p_aluno_id bigint, p_plano_id integer, p_data_inicio date, p_data_fim date, p_estudio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin_ok boolean;
  v_preco numeric;
begin
  if p_estudio_id is null then
    raise exception 'p_estudio_id é obrigatório.';
  end if;

  select exists (
    select 1 from estudio_membros
    where user_id = auth.uid() and estudio_id = p_estudio_id and role = 'admin'
  ) into v_admin_ok;

  if not v_admin_ok then
    raise exception 'Acesso negado: você não é admin deste estúdio.';
  end if;

  if not exists (select 1 from alunos where id = p_aluno_id and estudio_id = p_estudio_id) then
    raise exception 'Aluno não pertence a este estúdio.';
  end if;

  select preco into v_preco from planos where id = p_plano_id and estudio_id = p_estudio_id;

  if v_preco is null then
    raise exception 'Plano não pertence a este estúdio.';
  end if;

  update alunos
     set plano_id = p_plano_id,
         ativo = true,
         data_inicio_plano = p_data_inicio,
         data_fim_plano = p_data_fim
   where id = p_aluno_id and estudio_id = p_estudio_id;

  update historico_planos
     set status = 'finalizado'
   where aluno_id = p_aluno_id and estudio_id = p_estudio_id and status = 'ativo';

  insert into historico_planos (aluno_id, plano_id, estudio_id, data_inicio, data_fim, status, valor_pago)
  values (p_aluno_id, p_plano_id, p_estudio_id, p_data_inicio, p_data_fim, 'ativo', v_preco);
end;
$function$
;

GRANT EXECUTE ON FUNCTION public.importar_matricula_aluno(p_aluno_id bigint, p_plano_id integer, p_data_inicio date, p_data_fim date, p_estudio_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.importar_matricula_aluno(p_aluno_id bigint, p_plano_id integer, p_data_inicio date, p_data_fim date, p_estudio_id uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.importar_matricula_aluno(p_aluno_id bigint, p_plano_id integer, p_data_inicio date, p_data_fim date, p_estudio_id uuid) FROM public, anon;
```

- [ ] **Step 3: Aplicar em staging e validar**

Aplique via `apply_migration` (MCP Supabase). Depois, via `execute_sql`:
```sql
select proacl from pg_proc where proname = 'importar_matricula_aluno';
```
Expected: ACL mostra `authenticated` e `service_role`, sem `anon`/`public` soltos.

Encontre um admin real e um plano real de um estúdio de staging (`select em.user_id, em.estudio_id from estudio_membros em where em.role='admin' limit 1;` e `select id, preco from planos where estudio_id = '<estudio_id acima>' limit 1;`). Crie um aluno de teste descartável e valide o caminho feliz e os dois caminhos de erro, sempre dentro de `begin;`/`rollback;`:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub": "<user_id do admin>", "role": "authenticated"}';

-- aluno de teste, sem plano ainda
insert into alunos (nome_completo, email, estudio_id) values ('QA Import Teste', 'qa-import-teste@teste.com', '<estudio_id>') returning id;
-- guarde o id retornado como <aluno_id>

-- caminho feliz
select importar_matricula_aluno(<aluno_id>, <plano_id>, current_date, current_date + interval '30 days', '<estudio_id>');
select plano_id, ativo, data_inicio_plano, data_fim_plano from alunos where id = <aluno_id>;
select status, valor_pago from historico_planos where aluno_id = <aluno_id>;
select count(*) as deve_ser_zero from mensalidades where aluno_id = <aluno_id>;

-- caminho de erro: plano de outro estúdio (ou id inexistente) deve falhar
select importar_matricula_aluno(<aluno_id>, 999999, current_date, current_date, '<estudio_id>');

rollback;
```
Expected: `plano_id`/`ativo=true`/`data_inicio_plano`/`data_fim_plano` corretos; `historico_planos` com `status='ativo'` e `valor_pago` = preço do plano; `deve_ser_zero = 0` (nenhuma mensalidade criada); a segunda chamada (plano inexistente) levanta a exceção `'Plano não pertence a este estúdio.'`.

- [ ] **Step 4: Adicionar `matricularSemMensalidade` em `alunosService.js`**

Em `webapp/src/services/alunosService.js`, logo depois do método `matricular` (linha ~351 atual, antes de `normalizarHistoricoPlanos`):
```js
  /**
   * Matricula um aluno importado num plano SEM gerar mensalidade — usado
   * pelo import de planilha (PED-106). Ao contrário de `matricular`, não
   * recebe vencimento/descrição/modalidades: o import não cobra
   * automaticamente nem seleciona modalidade.
   * Função SQL correspondente: importar_matricula_aluno()
   */
  async matricularSemMensalidade(alunoId, planoId, estudioId) {
    try {
      const { data: plano, error: errPlano } = await supabase
        .from('planos')
        .select('id, duracao_meses')
        .eq('estudio_id', estudioId)
        .eq('id', planoId)
        .single();

      if (errPlano) throw errPlano;

      const dataInicio = new Date().toISOString().split('T')[0];
      const dataFimObj = new Date(`${dataInicio}T12:00:00`);
      dataFimObj.setMonth(dataFimObj.getMonth() + (plano.duracao_meses || 1));
      dataFimObj.setDate(dataFimObj.getDate() - 1);
      const dataFim = dataFimObj.toISOString().split('T')[0];

      const { error } = await supabase.rpc('importar_matricula_aluno', {
        p_aluno_id:    alunoId,
        p_plano_id:    planoId,
        p_data_inicio: dataInicio,
        p_data_fim:    dataFim,
        p_estudio_id:  estudioId,
      });

      if (error) throw error;
      return { dataInicio, dataFim };
    } catch (error) {
      console.error('[alunosService.matricularSemMensalidade]', error);
      throw error;
    }
  },
```

- [ ] **Step 5: Rodar lint/build do webapp**

```bash
npm run lint
npm run build
```
Expected: sem erro novo (nenhum teste automatizado cobre `alunosService.js` hoje — nem `matricular` tem — consistente com a convenção do projeto).

- [ ] **Step 6: Limpar dado de teste em staging**

Confirme que não sobrou nada: `select count(*) from alunos where email = 'qa-import-teste@teste.com';` deve ser `0` (a transação do Step 3 já foi `rollback`ada, então isso é só uma dupla checagem).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260901200000_importar_matricula_aluno.sql webapp/src/services/alunosService.js
git commit -m "feat(import-alunos): RPC e service pra matricular aluno importado sem gerar mensalidade (PED-106)"
```

---

### Task 2: Lógica pura de import (parsing, mapeamento, validação)

**Files:**
- Create: `webapp/src/lib/importAlunos.js`
- Create: `webapp/src/lib/importAlunos.test.js`

**Interfaces:**
- Produces: `CAMPOS_IMPORTAVEIS` (array de `{chave, label, obrigatorio}`), `normalizarTexto(valor)`, `sugerirCampoPorCabecalho(cabecalho)`, `linhasParaObjetos(linhasCruas, mapeamentoColunas)`, `mapearNomesPlano(nomesDistintos, planosExistentes)`, `validarLinhaAluno(linha)` — todas consumidas pelo Task 3.
- Consumes: `alunoSchema` de `webapp/src/lib/validation.js` (já existe, não modificado).

- [ ] **Step 1: Escrever os testes (falhando)**

`webapp/src/lib/importAlunos.test.js`:
```js
import { describe, it, expect } from 'vitest';
import {
  normalizarTexto,
  sugerirCampoPorCabecalho,
  linhasParaObjetos,
  mapearNomesPlano,
  validarLinhaAluno,
} from './importAlunos';

describe('normalizarTexto', () => {
  it('remove acentos, espaços nas pontas e normaliza para minúsculas', () => {
    expect(normalizarTexto('  Endereço  ')).toBe('endereco');
    expect(normalizarTexto('E-MAIL')).toBe('e-mail');
    expect(normalizarTexto(null)).toBe('');
    expect(normalizarTexto(undefined)).toBe('');
  });
});

describe('sugerirCampoPorCabecalho', () => {
  it('sugere o campo certo pra cabeçalhos comuns', () => {
    expect(sugerirCampoPorCabecalho('Nome completo')).toBe('nome_completo');
    expect(sugerirCampoPorCabecalho('E-mail')).toBe('email');
    expect(sugerirCampoPorCabecalho('Telefone/WhatsApp')).toBe('telefone');
    expect(sugerirCampoPorCabecalho('Plano contratado')).toBe('plano');
  });

  it('não confunde "E-mail do Aluno" com Nome completo', () => {
    // Regressão: a palavra "aluno" aparece dentro do cabeçalho de e-mail,
    // mas não deve disparar a sugestão de nome_completo.
    expect(sugerirCampoPorCabecalho('E-mail do Aluno')).toBe('email');
  });

  it('retorna null pra cabeçalho sem correspondência conhecida', () => {
    expect(sugerirCampoPorCabecalho('Observações internas')).toBeNull();
    expect(sugerirCampoPorCabecalho('')).toBeNull();
  });
});

describe('linhasParaObjetos', () => {
  const linhasCruas = [
    ['Nome', 'Email', 'Coluna Ignorada'],
    ['Maria Silva', 'maria@teste.com', 'lixo'],
    ['', '', ''],
    ['João Souza', 'joao@teste.com', 'lixo'],
  ];

  it('converte linhas cruas em objetos usando o mapeamento coluna->campo', () => {
    const mapeamento = { 0: 'nome_completo', 1: 'email', 2: null };
    const resultado = linhasParaObjetos(linhasCruas, mapeamento);
    expect(resultado).toEqual([
      { nome_completo: 'Maria Silva', email: 'maria@teste.com' },
      { nome_completo: 'João Souza', email: 'joao@teste.com' },
    ]);
  });

  it('pula linhas completamente vazias', () => {
    const mapeamento = { 0: 'nome_completo', 1: 'email' };
    const resultado = linhasParaObjetos(linhasCruas, mapeamento);
    expect(resultado).toHaveLength(2);
  });
});

describe('mapearNomesPlano', () => {
  const planosExistentes = [
    { id: 1, nome: 'Plano Mensal' },
    { id: 2, nome: 'Plano Trimestral' },
  ];

  it('encontra correspondência exata ignorando maiúsculas/espaços', () => {
    const { correspondencias, naoEncontrados } = mapearNomesPlano(
      ['plano mensal', 'Plano Trimestral  '],
      planosExistentes
    );
    expect(correspondencias).toEqual({
      'plano mensal': 1,
      'Plano Trimestral  ': 2,
    });
    expect(naoEncontrados).toEqual([]);
  });

  it('lista nomes sem correspondência pra mapeamento manual', () => {
    const { correspondencias, naoEncontrados } = mapearNomesPlano(
      ['Plano Mensal', 'Plano VIP'],
      planosExistentes
    );
    expect(correspondencias).toEqual({ 'Plano Mensal': 1 });
    expect(naoEncontrados).toEqual(['Plano VIP']);
  });
});

describe('validarLinhaAluno', () => {
  it('aprova uma linha com nome e e-mail válidos', async () => {
    const resultado = await validarLinhaAluno({
      nome_completo: 'Maria Silva',
      email: 'maria@teste.com',
    });
    expect(resultado.valida).toBe(true);
    expect(resultado.erros).toEqual([]);
  });

  it('reprova uma linha sem e-mail, reportando o erro', async () => {
    const resultado = await validarLinhaAluno({ nome_completo: 'Maria Silva' });
    expect(resultado.valida).toBe(false);
    expect(resultado.erros).toEqual(['O e-mail é obrigatório.']);
  });

  it('reprova e-mail em formato inválido', async () => {
    const resultado = await validarLinhaAluno({
      nome_completo: 'Maria Silva',
      email: 'nao-e-um-email',
    });
    expect(resultado.valida).toBe(false);
    expect(resultado.erros).toContain('Insira um e-mail válido.');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
npx vitest run src/lib/importAlunos.test.js
```
Expected: FAIL — `Cannot find module './importAlunos'`.

- [ ] **Step 3: Implementar `webapp/src/lib/importAlunos.js`**

```js
// webapp/src/lib/importAlunos.js
//
// Lógica pura do import de planilha de alunos (PED-106) — extraída pra
// ser testável sem renderizar nenhum componente (este projeto não usa
// @testing-library/react; convenção aqui é lib pura + página "burra" que
// só consome, ver rotaModulo.js/trial.js).

import { alunoSchema } from './validation';

// Campos que uma coluna da planilha pode ser mapeada para, na ordem em
// que aparecem no seletor de "Mapear colunas".
export const CAMPOS_IMPORTAVEIS = [
  { chave: 'nome_completo',      label: 'Nome completo',        obrigatorio: true },
  { chave: 'email',              label: 'E-mail',                obrigatorio: true },
  { chave: 'telefone',           label: 'Telefone',              obrigatorio: false },
  { chave: 'cpf',                label: 'CPF',                   obrigatorio: false },
  { chave: 'data_nascimento',    label: 'Data de nascimento',    obrigatorio: false },
  { chave: 'cep',                label: 'CEP',                   obrigatorio: false },
  { chave: 'rua',                label: 'Rua',                   obrigatorio: false },
  { chave: 'numero',             label: 'Número',                obrigatorio: false },
  { chave: 'complemento',        label: 'Complemento',           obrigatorio: false },
  { chave: 'bairro',             label: 'Bairro',                obrigatorio: false },
  { chave: 'cidade',             label: 'Cidade',                obrigatorio: false },
  { chave: 'contato_emergencia', label: 'Contato de emergência', obrigatorio: false },
  { chave: 'plano',              label: 'Plano',                 obrigatorio: false },
];

// Palavras-chave (já normalizadas) usadas pra sugerir automaticamente o
// mapeamento de uma coluna a partir do texto do cabeçalho — a sugestão é
// sempre editável pelo admin, então um palpite errado ocasional não é
// grave, mas "aluno" sozinho foi removido daqui de propósito: cabeçalhos
// como "E-mail do Aluno" continham a palavra e disparavam a sugestão
// errada de Nome completo antes de email ser verificado.
const SUGESTOES_POR_PALAVRA_CHAVE = {
  nome_completo: ['nome completo', 'nome do aluno', 'nome'],
  email: ['e-mail', 'email', 'correio'],
  telefone: ['telefone', 'whatsapp', 'celular', 'fone'],
  cpf: ['cpf'],
  data_nascimento: ['data de nascimento', 'data nascimento', 'nascimento'],
  cep: ['cep'],
  rua: ['logradouro', 'endereco', 'rua'],
  numero: ['numero', 'nº', 'n°'],
  complemento: ['complemento'],
  bairro: ['bairro'],
  cidade: ['cidade'],
  contato_emergencia: ['contato de emergencia', 'emergencia'],
  plano: ['plano contratado', 'plano'],
};

export function normalizarTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

export function sugerirCampoPorCabecalho(cabecalho) {
  const texto = normalizarTexto(cabecalho);
  if (!texto) return null;

  for (const [chave, palavras] of Object.entries(SUGESTOES_POR_PALAVRA_CHAVE)) {
    if (palavras.some((palavra) => texto.includes(normalizarTexto(palavra)))) {
      return chave;
    }
  }
  return null;
}

// Converte linhas cruas (array de arrays, primeira linha = cabeçalho —
// já removida antes de chegar aqui pelo caller) em objetos
// { nome_completo, email, ... } de acordo com o mapeamento coluna->campo
// escolhido pelo admin. `mapeamentoColunas` é um objeto
// { indiceDaColuna: chaveDoCampo | null } — colunas sem chave (null/
// undefined) são ignoradas. Linhas totalmente vazias são descartadas.
export function linhasParaObjetos(linhasCruas, mapeamentoColunas) {
  const [, ...linhasDados] = linhasCruas;

  return linhasDados
    .filter((linha) => linha.some((valor) => String(valor ?? '').trim() !== ''))
    .map((linha) => {
      const objeto = {};
      for (const [indice, chave] of Object.entries(mapeamentoColunas)) {
        if (!chave) continue;
        const valor = linha[Number(indice)];
        objeto[chave] = valor == null ? '' : String(valor).trim();
      }
      return objeto;
    });
}

// Pra cada nome de plano distinto vindo das linhas mapeadas, tenta achar
// um plano existente do estúdio com o mesmo nome (normalizado — ignora
// maiúsculas/acentos/espaços nas pontas). Retorna as correspondências
// encontradas (chaveadas pelo nome ORIGINAL, como veio da planilha — o
// caller usa isso pra montar o mapeamento manual da tela seguinte) e os
// nomes sem correspondência.
export function mapearNomesPlano(nomesDistintos, planosExistentes) {
  const idPorNomeNormalizado = new Map(
    planosExistentes.map((plano) => [normalizarTexto(plano.nome), plano.id])
  );

  const correspondencias = {};
  const naoEncontrados = [];

  for (const nome of nomesDistintos) {
    const planoId = idPorNomeNormalizado.get(normalizarTexto(nome));
    if (planoId != null) {
      correspondencias[nome] = planoId;
    } else {
      naoEncontrados.push(nome);
    }
  }

  return { correspondencias, naoEncontrados };
}

// Valida uma linha já mapeada usando exatamente as mesmas regras do
// cadastro manual (alunoSchema) — garante que o import nunca aceita uma
// linha que o formulário individual rejeitaria. Campos que a linha não
// tem (ex.: "plano", que não faz parte do schema) são ignorados pelo yup
// por padrão, sem erro.
export async function validarLinhaAluno(linha) {
  try {
    await alunoSchema.validate(linha, { abortEarly: false });
    return { valida: true, erros: [] };
  } catch (err) {
    const erros = err.inner?.length ? err.inner.map((e) => e.message) : [err.message];
    return { valida: false, erros };
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
npx vitest run src/lib/importAlunos.test.js
```
Expected: PASS, 11 testes (1 + 3 + 2 + 2 + 3 — conte os `it()` acima pra confirmar; se o número não bater com o que você contou, o teste `it()` mais recente é a fonte de verdade, não este comentário).

- [ ] **Step 5: Rodar a suíte inteira + lint + build**

```bash
npm test
npm run lint
npm run build
```
Expected: todos os testes passam (112 existentes + os novos), sem erro novo de lint/build.

- [ ] **Step 6: Commit**

```bash
git add webapp/src/lib/importAlunos.js webapp/src/lib/importAlunos.test.js
git commit -m "feat(import-alunos): logica pura de mapeamento e validacao do import (PED-106)"
```

---

### Task 3: Wizard de import (`/alunos/importar`)

**Files:**
- Create: `webapp/src/components/shared/FileDropInput.jsx`
- Create: `webapp/src/pages/ImportarAlunos.jsx`
- Modify: `webapp/src/App.jsx`
- Modify: `webapp/src/pages/Alunos.jsx`

**Interfaces:**
- Consumes (Task 1): `alunosService.criar(dados, estudioId)` (já existe), `alunosService.matricularSemMensalidade(alunoId, planoId, estudioId)`.
- Consumes (Task 2): `CAMPOS_IMPORTAVEIS`, `sugerirCampoPorCabecalho`, `linhasParaObjetos`, `mapearNomesPlano`, `validarLinhaAluno` de `webapp/src/lib/importAlunos.js`.
- Consumes (existentes): `planosService.listar(estudioId)` (`webapp/src/services/planosService.js`), `ehFalhaDeChunkDesatualizado` (`webapp/src/lib/chunkLoadError.js`), `showToast` (`webapp/src/components/shared/Toast.js`), `useAuth`/`useImpersonation` pro `estudioId` efetivo (mesmo padrão de `Alunos.jsx`/`Despesas.jsx`: `const idEfetivo = estudioAtivo?.id ?? estudioId`), `supabase` (`webapp/src/lib/supabase.js`) pra checagem de e-mails já existentes.

Este projeto não tem componente de upload de arquivo reutilizável — o único precedente é um `<input type="file">` escondido + botão em `ConfiguracoesEstudio.jsx`. `FileDropInput` generaliza esse padrão (clique OU arrastar-e-soltar) pra ser reutilizável fora deste wizard também, se algo mais precisar de upload de arquivo depois.

- [ ] **Step 1: Criar `webapp/src/components/shared/FileDropInput.jsx`**

```jsx
// webapp/src/components/shared/FileDropInput.jsx
//
// Input de arquivo reutilizável: clique OU arrastar-e-soltar. Não existia
// nenhum componente de upload compartilhado no projeto antes deste (só um
// <input type="file"> escondido específico de ConfiguracoesEstudio.jsx) —
// este generaliza o padrão pra qualquer tela que precisar de upload.

import React, { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';
import { cn } from '../../lib/cn';

export default function FileDropInput({ accept, onFileSelected, descricao, disabled }) {
  const inputRef = useRef(null);
  const [arrastando, setArrastando] = useState(false);

  function processarArquivo(arquivo) {
    if (arquivo) onFileSelected(arquivo);
  }

  return (
    <div
      className={cn(
        'rounded-2xl border-2 border-dashed p-10 text-center transition-colors cursor-pointer',
        arrastando ? 'border-primary bg-primary-soft' : 'border-border bg-muted/40 hover:bg-muted',
        disabled && 'opacity-50 pointer-events-none'
      )}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault();
        setArrastando(false);
        processarArquivo(e.dataTransfer.files?.[0]);
      }}
    >
      <UploadCloud size={32} className="mx-auto mb-3 text-muted-foreground" />
      <p className="text-sm font-bold text-foreground">
        Clique para escolher um arquivo ou arraste aqui
      </p>
      {descricao && <p className="text-xs text-muted-foreground mt-1">{descricao}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
        onChange={(e) => processarArquivo(e.target.files?.[0])}
      />
    </div>
  );
}
```

- [ ] **Step 2: Criar `webapp/src/pages/ImportarAlunos.jsx` — estado, layout e Etapa 1 (Upload)**

```jsx
// webapp/src/pages/ImportarAlunos.jsx
//
// Wizard de import de planilha de alunos (PED-106): Upload -> Mapear
// Colunas -> Mapear Planos (só se necessário) -> Pré-visualização ->
// Importar -> Resumo. Lógica de parsing/validação/mapeamento fica em
// lib/importAlunos.js (testada ali); esta página só orquestra o estado
// e a UI de cada etapa.

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, FileSpreadsheet, Loader2, CheckCircle2, XCircle } from 'lucide-react';

import { alunosService } from '../services/alunosService';
import { planosService } from '../services/planosService';
import { supabase } from '../lib/supabase';
import { ehFalhaDeChunkDesatualizado } from '../lib/chunkLoadError';
import {
  CAMPOS_IMPORTAVEIS,
  sugerirCampoPorCabecalho,
  linhasParaObjetos,
  mapearNomesPlano,
  validarLinhaAluno,
} from '../lib/importAlunos';
import { useAuth } from '../hooks/useAuth';
import { useImpersonation } from '../context/ImpersonationContext';
import { showToast } from '../components/shared/Toast';
import Button from '../components/ui/Button';
import Surface from '../components/ui/Surface';
import Badge from '../components/ui/Badge';
import FileDropInput from '../components/shared/FileDropInput';

const ETAPAS = ['Upload', 'Mapear colunas', 'Mapear planos', 'Pré-visualização', 'Resumo'];

export default function ImportarAlunos() {
  const navigate = useNavigate();
  const { estudioId } = useAuth();
  const { estudioAtivo } = useImpersonation();
  const idEfetivo = estudioAtivo?.id ?? estudioId;

  const [etapa, setEtapa] = useState(0);
  const [carregandoArquivo, setCarregandoArquivo] = useState(false);
  const [linhasCruas, setLinhasCruas] = useState(null); // array de arrays, [0] = cabeçalho
  const [mapeamentoColunas, setMapeamentoColunas] = useState({});
  const [planosEstudio, setPlanosEstudio] = useState([]);
  const [mapeamentoPlanos, setMapeamentoPlanos] = useState({});
  const [linhasValidadas, setLinhasValidadas] = useState([]);
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });
  const [resumo, setResumo] = useState(null);

  async function handleArquivoSelecionado(arquivo) {
    setCarregandoArquivo(true);
    try {
      const XLSX = await import('xlsx');
      const buffer = await arquivo.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const primeiraAba = workbook.Sheets[workbook.SheetNames[0]];
      const linhas = XLSX.utils.sheet_to_json(primeiraAba, { header: 1, defval: '' });

      if (!linhas.length || !linhas[0].length) {
        showToast.error('A planilha está vazia ou não tem cabeçalho.');
        return;
      }

      const [planos] = await Promise.all([planosService.listar(idEfetivo)]);

      const mapeamentoInicial = {};
      linhas[0].forEach((cabecalho, indice) => {
        mapeamentoInicial[indice] = sugerirCampoPorCabecalho(cabecalho);
      });

      setLinhasCruas(linhas);
      setMapeamentoColunas(mapeamentoInicial);
      setPlanosEstudio(planos ?? []);
      setEtapa(1);
    } catch (err) {
      console.error('[ImportarAlunos] Falha ao ler planilha:', err);
      if (ehFalhaDeChunkDesatualizado(err)) {
        showToast.custom(
          'Nova versão disponível. Recarregue a página para importar.',
          () => window.location.reload(),
          'Atualizar'
        );
        return;
      }
      showToast.error('Não foi possível ler este arquivo. Confirme que é uma planilha válida (.xlsx, .xls ou .csv).');
    } finally {
      setCarregandoArquivo(false);
    }
  }

  function renderEtapaUpload() {
    return (
      <Surface variant="card" padding="lg" className="space-y-4">
        <div>
          <h2 className="text-xl font-black text-foreground">Envie a planilha de alunos</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Aceita arquivos .xlsx, .xls ou .csv. A primeira linha deve ser o cabeçalho das colunas.
          </p>
        </div>
        <FileDropInput
          accept=".xlsx,.xls,.csv"
          descricao="Ex.: sua própria planilha de controle de alunos"
          disabled={carregandoArquivo}
          onFileSelected={handleArquivoSelecionado}
        />
        {carregandoArquivo && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" /> Lendo planilha...
          </p>
        )}
      </Surface>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl mx-auto animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/alunos')}
          className="p-2 rounded-xl text-muted-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
            <FileSpreadsheet size={22} /> Importar alunos
          </h1>
          <p className="text-sm text-muted-foreground font-medium">{ETAPAS[etapa]}</p>
        </div>
      </div>

      {etapa === 0 && renderEtapaUpload()}
    </div>
  );
}
```

- [ ] **Step 3: Rodar lint pra confirmar que o arquivo novo compila sem erro até aqui**

```bash
npm run lint
```
Expected: sem erro novo (etapas 1-4 ainda não existem — só a etapa 0 está montada, `etapa` só chega a 1 depois do upload, então não há JSX quebrado por referenciar algo que falta).

- [ ] **Step 4: Adicionar Etapa 2 (Mapear colunas)**

Em `webapp/src/pages/ImportarAlunos.jsx`, adicionar a função de render logo depois de `renderEtapaUpload` e o `<div>` de retorno correspondente:

```jsx
  const cabecalhos = linhasCruas?.[0] ?? [];
  const camposObrigatoriosMapeados = CAMPOS_IMPORTAVEIS
    .filter((c) => c.obrigatorio)
    .every((c) => Object.values(mapeamentoColunas).includes(c.chave));

  function renderEtapaMapearColunas() {
    return (
      <Surface variant="card" padding="lg" className="space-y-4">
        <div>
          <h2 className="text-xl font-black text-foreground">O que é cada coluna?</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Confirme ou ajuste o campo de cada coluna encontrada na planilha. Nome completo e E-mail são obrigatórios.
          </p>
        </div>

        <div className="space-y-3">
          {cabecalhos.map((cabecalho, indice) => (
            <div key={indice} className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-bold text-foreground w-48 truncate" title={String(cabecalho)}>
                {String(cabecalho) || `Coluna ${indice + 1}`}
              </span>
              <select
                className="flex-1 min-w-[200px] rounded-xl border border-border bg-card px-3 py-2 text-sm"
                value={mapeamentoColunas[indice] ?? ''}
                onChange={(e) => setMapeamentoColunas((prev) => ({
                  ...prev,
                  [indice]: e.target.value || null,
                }))}
              >
                <option value="">Ignorar esta coluna</option>
                {CAMPOS_IMPORTAVEIS.map((campo) => (
                  <option key={campo.chave} value={campo.chave}>
                    {campo.label}{campo.obrigatorio ? ' *' : ''}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => setEtapa(0)} leftIcon={<ArrowLeft size={16} />}>
            Voltar
          </Button>
          <Button
            variant="brand"
            disabled={!camposObrigatoriosMapeados}
            onClick={avancarParaMapearPlanos}
            rightIcon={<ArrowRight size={16} />}
          >
            Continuar
          </Button>
        </div>
      </Surface>
    );
  }
```

Adicionar `{etapa === 1 && renderEtapaMapearColunas()}` logo depois de `{etapa === 0 && renderEtapaUpload()}` no `return` do componente.

- [ ] **Step 5: Adicionar a lógica de transição pra Etapa 3 (Mapear planos) — só quando necessário**

Ainda em `webapp/src/pages/ImportarAlunos.jsx`, adicionar a função `avancarParaMapearPlanos` referenciada no Step 4, logo acima de `renderEtapaMapearColunas`:

```jsx
  function avancarParaMapearPlanos() {
    const indiceColunaPlano = Object.entries(mapeamentoColunas).find(([, chave]) => chave === 'plano')?.[0];

    if (indiceColunaPlano == null) {
      // Planilha não tem coluna de plano mapeada — pula direto pra
      // pré-visualização, não faz sentido mostrar uma tela de mapeamento
      // de planos vazia.
      prepararPreVisualizacao({});
      return;
    }

    const nomesDistintos = [...new Set(
      linhasCruas.slice(1)
        .map((linha) => String(linha[Number(indiceColunaPlano)] ?? '').trim())
        .filter(Boolean)
    )];

    const { correspondencias, naoEncontrados } = mapearNomesPlano(nomesDistintos, planosEstudio);

    if (naoEncontrados.length === 0) {
      prepararPreVisualizacao(correspondencias);
      return;
    }

    setMapeamentoPlanos(correspondencias);
    setEtapa(2);
  }
```

- [ ] **Step 6: Adicionar Etapa 3 (Mapear planos)**

Logo depois de `renderEtapaMapearColunas`:

```jsx
  const indiceColunaPlano = Object.entries(mapeamentoColunas).find(([, chave]) => chave === 'plano')?.[0];
  const nomesDistintosPlano = indiceColunaPlano == null ? [] : [...new Set(
    (linhasCruas ?? []).slice(1)
      .map((linha) => String(linha[Number(indiceColunaPlano)] ?? '').trim())
      .filter(Boolean)
  )];
  const nomesNaoMapeados = nomesDistintosPlano.filter((nome) => !(nome in mapeamentoPlanos));

  function renderEtapaMapearPlanos() {
    return (
      <Surface variant="card" padding="lg" className="space-y-4">
        <div>
          <h2 className="text-xl font-black text-foreground">Alguns planos da planilha não foram reconhecidos</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Escolha um plano existente pra cada nome abaixo, ou deixe "Sem plano" pra importar o aluno sem matrícula.
          </p>
        </div>

        <div className="space-y-3">
          {nomesNaoMapeados.map((nome) => (
            <div key={nome} className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-bold text-foreground w-48 truncate" title={nome}>
                "{nome}"
              </span>
              <select
                className="flex-1 min-w-[200px] rounded-xl border border-border bg-card px-3 py-2 text-sm"
                value={mapeamentoPlanos[nome] ?? ''}
                onChange={(e) => setMapeamentoPlanos((prev) => ({
                  ...prev,
                  [nome]: e.target.value ? Number(e.target.value) : null,
                }))}
              >
                <option value="">Sem plano (não matricular)</option>
                {planosEstudio.map((plano) => (
                  <option key={plano.id} value={plano.id}>{plano.nome}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => setEtapa(1)} leftIcon={<ArrowLeft size={16} />}>
            Voltar
          </Button>
          <Button
            variant="brand"
            onClick={() => prepararPreVisualizacao(mapeamentoPlanos)}
            rightIcon={<ArrowRight size={16} />}
          >
            Continuar
          </Button>
        </div>
      </Surface>
    );
  }
```

Adicionar `{etapa === 2 && renderEtapaMapearPlanos()}` no `return` do componente, depois da etapa 1.

- [ ] **Step 7: Adicionar `prepararPreVisualizacao` e Etapa 4 (Pré-visualização)**

Logo acima de `renderEtapaMapearPlanos`:

```jsx
  async function prepararPreVisualizacao(mapeamentoPlanosFinal) {
    const objetos = linhasParaObjetos(linhasCruas, mapeamentoColunas);

    // .eq('estudio_id', idEfetivo) é redundante com a RLS (tenant_select já
    // só deixa este admin enxergar linhas do próprio estúdio), mas o
    // padrão do resto do alunosService.js é sempre reforçar o filtro de
    // tenant explicitamente como defesa em profundidade (ver comentários
    // "Bug #4" em atualizar/excluir/alterarStatus) — mantido aqui pela
    // mesma razão.
    const emails = objetos.map((o) => o.email).filter(Boolean);
    const { data: existentes } = emails.length
      ? await supabase.from('alunos').select('email').eq('estudio_id', idEfetivo).in('email', emails)
      : { data: [] };
    const emailsExistentes = new Set((existentes ?? []).map((a) => a.email.toLowerCase()));

    const validadas = await Promise.all(objetos.map(async (linha) => {
      const { valida, erros } = await validarLinhaAluno(linha);
      const emailDuplicado = linha.email && emailsExistentes.has(String(linha.email).toLowerCase());
      const nomePlano = linha.plano;
      const planoId = nomePlano ? (mapeamentoPlanosFinal[nomePlano] ?? null) : null;

      return {
        linha,
        planoId,
        valida: valida && !emailDuplicado,
        erros: emailDuplicado ? [...erros, 'E-mail já cadastrado no sistema.'] : erros,
      };
    }));

    setMapeamentoPlanos(mapeamentoPlanosFinal);
    setLinhasValidadas(validadas);
    setEtapa(3);
  }

  const linhasValidas = linhasValidadas.filter((l) => l.valida);

  function renderEtapaPreVisualizacao() {
    return (
      <Surface variant="card" padding="lg" className="space-y-4">
        <div>
          <h2 className="text-xl font-black text-foreground">Pré-visualização</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {linhasValidas.length} de {linhasValidadas.length} linhas prontas pra importar.
          </p>
        </div>

        <div className="max-h-96 overflow-y-auto space-y-2">
          {linhasValidadas.map((item, indice) => (
            <div
              key={indice}
              className="flex items-start gap-3 p-3 rounded-xl bg-muted/40 text-sm"
            >
              {item.valida
                ? <CheckCircle2 size={18} className="text-success shrink-0 mt-0.5" />
                : <XCircle size={18} className="text-destructive shrink-0 mt-0.5" />}
              <div className="min-w-0">
                <p className="font-bold text-foreground truncate">
                  {item.linha.nome_completo || '(sem nome)'} — {item.linha.email || '(sem e-mail)'}
                </p>
                {!item.valida && (
                  <p className="text-xs text-destructive">{item.erros.join(' ')}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between pt-2">
          <Button variant="ghost" onClick={() => setEtapa(indiceColunaPlano == null ? 1 : 2)} leftIcon={<ArrowLeft size={16} />}>
            Voltar
          </Button>
          <Button
            variant="brand"
            disabled={linhasValidas.length === 0 || importando}
            onClick={executarImportacao}
            rightIcon={<ArrowRight size={16} />}
          >
            {importando
              ? `Importando ${progresso.atual} de ${progresso.total}...`
              : `Importar ${linhasValidas.length} aluno${linhasValidas.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      </Surface>
    );
  }
```

Adicionar `{etapa === 3 && renderEtapaPreVisualizacao()}` no `return`, depois da etapa 2.

- [ ] **Step 8: Adicionar `executarImportacao` e Etapa 5 (Resumo)**

Logo acima de `renderEtapaPreVisualizacao`:

```jsx
  async function executarImportacao() {
    setImportando(true);
    setProgresso({ atual: 0, total: linhasValidas.length });

    let criados = 0;
    let matriculados = 0;
    const pulados = [];

    for (let i = 0; i < linhasValidas.length; i++) {
      const { linha, planoId } = linhasValidas[i];
      try {
        const { plano: _plano, ...dadosAluno } = linha; // 'plano' não é campo de alunos
        const alunoCriado = await alunosService.criar(dadosAluno, idEfetivo);
        criados += 1;

        if (planoId) {
          try {
            await alunosService.matricularSemMensalidade(alunoCriado.id, planoId, idEfetivo);
            matriculados += 1;
          } catch (errMatricula) {
            console.error('[ImportarAlunos] Falha ao matricular:', errMatricula);
            pulados.push({
              linha,
              motivo: `Aluno criado, mas a matrícula falhou: ${errMatricula.message}`,
            });
          }
        }
      } catch (errCriar) {
        console.error('[ImportarAlunos] Falha ao criar aluno:', errCriar);
        pulados.push({ linha, motivo: errCriar.message || 'Erro ao criar o aluno.' });
      }

      setProgresso({ atual: i + 1, total: linhasValidas.length });
    }

    const pulacoesJaConhecidas = linhasValidadas
      .filter((item) => !item.valida)
      .map((item) => ({ linha: item.linha, motivo: item.erros.join(' ') }));

    setResumo({ criados, matriculados, pulados: [...pulacoesJaConhecidas, ...pulados] });
    setImportando(false);
    setEtapa(4);
  }

  function renderEtapaResumo() {
    return (
      <Surface variant="card" padding="lg" className="space-y-4">
        <div>
          <h2 className="text-xl font-black text-foreground">Import concluído</h2>
        </div>

        <div className="flex gap-4 flex-wrap">
          <Badge tone="success" variant="soft">{resumo.criados} aluno{resumo.criados === 1 ? '' : 's'} criado{resumo.criados === 1 ? '' : 's'}</Badge>
          <Badge tone="info" variant="soft">{resumo.matriculados} matriculado{resumo.matriculados === 1 ? '' : 's'} em plano</Badge>
          {resumo.pulados.length > 0 && (
            <Badge tone="warning" variant="soft">{resumo.pulados.length} pulado{resumo.pulados.length === 1 ? '' : 's'}</Badge>
          )}
        </div>

        {resumo.pulados.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-bold text-foreground">Linhas puladas:</p>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {resumo.pulados.map((item, indice) => (
                <div key={indice} className="p-3 rounded-xl bg-warning-soft text-sm">
                  <p className="font-bold text-foreground">
                    {item.linha.nome_completo || '(sem nome)'} — {item.linha.email || '(sem e-mail)'}
                  </p>
                  <p className="text-xs text-muted-foreground">{item.motivo}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button variant="brand" onClick={() => navigate('/alunos')} className="w-full">
          Voltar para Alunos
        </Button>
      </Surface>
    );
  }
```

Adicionar `{etapa === 4 && resumo && renderEtapaResumo()}` no `return`, depois da etapa 3.

- [ ] **Step 9: Wire up — rota em `App.jsx` e botão em `Alunos.jsx`**

Em `webapp/src/App.jsx`, adicionar o import logo depois de `import NovoAluno from './pages/NovoAluno';` (linha 37 atual):
```jsx
import ImportarAlunos from './pages/ImportarAlunos';
```
E a rota logo depois de `<Route path="/alunos/novo" element={<NovoAluno />} />` (linha 287 atual):
```jsx
            <Route path="/alunos/importar"       element={<ImportarAlunos />} />
```

Em `webapp/src/pages/Alunos.jsx`, adicionar `Upload` aos ícones importados de `lucide-react` (junto com `UserPlus` etc., linhas 4-6 atuais), e adicionar o botão novo antes do botão "Novo Aluno" existente (linhas 293-301 atuais):
```jsx
        <div className="flex gap-3 w-full md:w-auto">
          <Button
            variant="outline" size="lg"
            leftIcon={<Upload size={20} />}
            onClick={() => navigate('/alunos/importar')}
            className="flex-1 md:flex-none rounded-[22px]"
          >
            Importar planilha
          </Button>
          <Button
            variant="brand" size="lg"
            leftIcon={<UserPlus size={20} />}
            onClick={() => navigate('/alunos/novo')}
            className="flex-1 md:flex-none rounded-[22px] hover:scale-[1.02]"
          >
            Novo Aluno
          </Button>
        </div>
```
(troca o `<Button variant="brand" ...>Novo Aluno</Button>` sozinho por esse `<div>` com os dois botões — ajuste as classes `w-full md:w-auto` do botão original pra `flex-1 md:flex-none` como mostrado, já que agora são dois botões lado a lado em vez de um.)

- [ ] **Step 10: Rodar a suíte inteira + lint + build**

```bash
npm test
npm run lint
npm run build
```
Expected: todos os testes passam, sem erro novo de lint/build. `npm run build` é o teste mais importante aqui — confirma que o JSX de todas as 5 etapas está sintaticamente correto e todas as referências (funções, variáveis) resolvem, já que não há teste de render pra pegar isso automaticamente.

- [ ] **Step 11: Commit**

```bash
git add webapp/src/components/shared/FileDropInput.jsx webapp/src/pages/ImportarAlunos.jsx webapp/src/App.jsx webapp/src/pages/Alunos.jsx
git commit -m "feat(import-alunos): wizard de import de planilha em /alunos/importar (PED-106)"
```

---

### Task 4: Validação manual ponta-a-ponta em staging + PR

**Files:** nenhum arquivo novo — só validação e abertura do PR.

- [ ] **Step 1: Passagem manual completa em staging**

Contra o front-end apontado pra staging (`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` de staging):

1. Monte uma planilha de teste pequena (3 linhas) com colunas em ordem/nomes arbitrários (ex.: "Nome", "Email", "Fone", "Plano") — inclua: uma linha 100% válida com um nome de plano que bate exatamente com um plano real do estúdio de teste; uma linha com e-mail que já existe no banco (ex.: reusando um e-mail de um aluno de teste já cadastrado); uma linha com um nome de plano que não existe em nenhum plano do estúdio.
2. Acesse `/alunos` logado como admin de um estúdio de teste, clique "Importar planilha".
3. Suba o arquivo → confirme que a Etapa "Mapear colunas" já sugere Nome/E-mail/Plano corretamente pros cabeçalhos comuns, ajuste se necessário, avance.
4. Confirme que a Etapa "Mapear planos" aparece (porque há um nome de plano não reconhecido) e resolve mapeando manualmente pra um plano existente (ou "sem plano").
5. Na "Pré-visualização", confirme: a linha com e-mail duplicado aparece marcada como inválida com a mensagem "E-mail já cadastrado no sistema."; as outras duas aparecem válidas.
6. Clique "Importar" → confirme a barra de progresso muda e o resumo final mostra as contagens certas (2 criados, 1 matriculado, 1 pulado).
7. Vá em `/alunos`, confirme que os 2 alunos novos aparecem na lista; abra o perfil do aluno que tinha plano mapeado e confirme que `plano_id`/`data_inicio_plano`/`data_fim_plano` aparecem certos e que **não** existe nenhuma mensalidade pendente nova pra ele (verifique em `/financeiro` ou via `execute_sql`: `select count(*) from mensalidades where aluno_id = <id>` deve ser `0`).
8. Limpe os dados de teste criados (`delete from alunos where id in (...)` — cascata cuida de `historico_planos`).

- [ ] **Step 2: Push da branch e abertura do PR**

```bash
git push -u origin worktree-ped-106-import-alunos
```
```bash
export PATH="$PATH:/c/Program Files/GitHub CLI"
gh pr create --title "feat(alunos): import de planilha de alunos com matricula em plano (PED-106)" --body "$(cat <<'EOF'
## Summary
- Nova tela `/alunos/importar`: wizard de import de planilha (.xlsx/.xls/.csv) — upload, mapeamento livre de colunas, mapeamento manual de nomes de plano não reconhecidos, pré-visualização com validação linha a linha (mesmas regras do cadastro manual), importação em lote com barra de progresso, resumo final.
- Aluno é criado pelo mesmo caminho de insert já usado no cadastro manual (`alunosService.criar`); quando a linha tem um plano resolvido, uma RPC nova (`importar_matricula_aluno`) matricula o aluno **sem gerar mensalidade automática** — decisão de design: alunos importados já têm histórico de pagamento próprio, gerar cobrança pendente em massa no momento do import seria enganoso.
- E-mail duplicado (constraint única **global**, não por estúdio) é detectado na pré-visualização e a linha é pulada e reportada — nunca atualiza um cadastro existente.
- Sem mapeamento de modalidade no import (fora de escopo, decisão do design) — admin completa isso manualmente depois.
- Lógica pura (sugestão de coluna, parsing, correspondência de plano, validação) isolada e testada em `webapp/src/lib/importAlunos.js`.
- Migration já aplicada e validada em staging (`qjmybxkfjkxttggdjxga`).

## Test plan
- [x] `npm test` — suíte completa passando (existentes + novos testes de `importAlunos.js`)
- [x] `npm run lint` / `npm run build` — sem erro novo
- [x] RPC `importar_matricula_aluno` validada em staging: matrícula funciona, nenhuma mensalidade é criada, erros de plano/aluno de outro estúdio são rejeitados
- [x] Passagem manual ponta-a-ponta em staging: upload → mapear colunas → mapear planos → pré-visualização (duplicata detectada) → importar → resumo → aluno e matrícula conferidos no banco
- [ ] Migration aplicada em produção (`tciiepqmnrrcjnqhspvw`) — pendente, decisão do Pedro, seguindo a mesma ordem staging→produção documentada em `docs/DEPLOY.md`.

Closes PED-106

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Atualizar o ticket no Linear**

Mover PED-106 para "In Review" e linkar o PR.
