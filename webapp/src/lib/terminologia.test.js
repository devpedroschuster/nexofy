import { describe, it, expect } from 'vitest';
import { resolverRotuloPlural } from './terminologia';

describe('resolverRotuloPlural', () => {
  it('pluraliza "professor" corretamente em pt-BR (não "Professors")', () => {
    // Regressão (PED-94): sufixo naive 's' produzia "Professors" (parece
    // inglês) em vez de "Professores" no menu lateral do painel do estúdio.
    expect(resolverRotuloPlural('professor', { segmento: 'danca_fitness' })).toBe('Professores');
  });

  it('pluraliza "treinador" corretamente em pt-BR (segmento escolinha_esportiva)', () => {
    expect(resolverRotuloPlural('professor', { segmento: 'escolinha_esportiva' })).toBe('Treinadores');
  });

  it('mantém pluralização simples para palavras terminadas em vogal', () => {
    expect(resolverRotuloPlural('aluno', { segmento: 'danca_fitness' })).toBe('Alunos');
    expect(resolverRotuloPlural('modalidade', { segmento: 'danca_fitness' })).toBe('Modalidades');
  });

  it('respeita terminologia customizada do tenant, pluralizando o rótulo customizado', () => {
    expect(
      resolverRotuloPlural('professor', { terminologia: { professor: 'Mentor' }, segmento: 'danca_fitness' })
    ).toBe('Mentores');
  });
});
