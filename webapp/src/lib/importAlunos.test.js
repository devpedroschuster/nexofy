import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import {
  normalizarTexto,
  sugerirCampoPorCabecalho,
  normalizarValorCampo,
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

describe('normalizarValorCampo', () => {
  it('converte string vazia em null', () => {
    expect(normalizarValorCampo('nome_completo', '')).toBeNull();
  });

  it('converte string só com espaços em null', () => {
    expect(normalizarValorCampo('data_nascimento', '   ')).toBeNull();
  });

  it('converte um objeto Date real em string ISO (YYYY-MM-DD)', () => {
    // Maio é o índice de mês 4 (0-based) no construtor Date.
    expect(normalizarValorCampo('data_nascimento', new Date(1990, 4, 1))).toBe('1990-05-01');
  });

  it('converte data_nascimento em dd/mm/yyyy pra ISO, sem confundir com MM/DD/YYYY', () => {
    // Regressão: "01/05/1990" é 1º de maio (dd/mm/yyyy, formato brasileiro),
    // NÃO 5 de janeiro (o que o construtor Date do JS assumiria como MM/DD/YYYY).
    expect(normalizarValorCampo('data_nascimento', '01/05/1990')).toBe('1990-05-01');
    expect(normalizarValorCampo('data_nascimento', '01/05/1990')).not.toBe('1990-01-05');
  });

  it('passa um valor normal de campo não-data adiante, só com trim', () => {
    expect(normalizarValorCampo('nome_completo', '  Maria Silva  ')).toBe('Maria Silva');
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

// Regressão (2ª rodada do review de PED-106): o teste de normalizarValorCampo
// isolado, alimentado com uma string construída à mão, nunca exercitava o
// caminho real — com cellDates: true, o próprio SheetJS já converte uma
// célula de CSV com data ambígua em um Date ANTES de normalizarValorCampo
// rodar, usando a heurística fuzzy-date dele (que por padrão assume
// MM/DD/YYYY, não o DD/MM/YYYY brasileiro). Esse teste roda o pipeline de
// verdade — XLSX.read -> sheet_to_json -> linhasParaObjetos — igual ao que
// ImportarAlunos.jsx faz de fato, pra garantir que a combinação
// cellDates + dateNF realmente resolve a ambiguidade na origem.
describe('pipeline real: CSV com data ambígua via XLSX.read', () => {
  it('interpreta 01/05/1990 como 1º de maio (dd/mm/yyyy), não 5 de janeiro', () => {
    const csv = 'Nome,Data de nascimento\nMaria,01/05/1990\n';
    const buffer = new TextEncoder().encode(csv).buffer;
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dateNF: 'dd/mm/yyyy' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const objetos = linhasParaObjetos(linhas, { 0: 'nome_completo', 1: 'data_nascimento' });
    expect(objetos[0].data_nascimento).toBe('1990-05-01');
  });

  it('interpreta 03/02/2000 como 3 de fevereiro (dd/mm/yyyy), não 2 de março', () => {
    const csv = 'Nome,Data de nascimento\nJoão,03/02/2000\n';
    const buffer = new TextEncoder().encode(csv).buffer;
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dateNF: 'dd/mm/yyyy' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const objetos = linhasParaObjetos(linhas, { 0: 'nome_completo', 1: 'data_nascimento' });
    expect(objetos[0].data_nascimento).toBe('2000-02-03');
  });

  it('não transforma um número de casa tipo "1/2" num campo não-data em data ISO', () => {
    // "1/2" numa coluna de número de casa pode ser lido pelo SheetJS como
    // uma data fuzzy (ex.: 1º de fevereiro) mesmo não sendo uma coluna de
    // data — o campo não deve virar um ISO enganoso nesse caso.
    const csv = 'Nome,Numero\nMaria,1/2\n';
    const buffer = new TextEncoder().encode(csv).buffer;
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, dateNF: 'dd/mm/yyyy' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const objetos = linhasParaObjetos(linhas, { 0: 'nome_completo', 1: 'numero' });
    expect(objetos[0].numero).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
