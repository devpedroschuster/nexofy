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
