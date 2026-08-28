import { describe, it, expect } from 'vitest';
import { ehFalhaDeChunkDesatualizado } from './chunkLoadError';

describe('ehFalhaDeChunkDesatualizado', () => {
  it('reconhece a mensagem do Chrome/Edge para import dinâmico que não resolve', () => {
    const erro = new Error("Failed to fetch dynamically imported module: https://app.com/assets/xlsx-a1b2c3.js");
    expect(ehFalhaDeChunkDesatualizado(erro)).toBe(true);
  });

  it('reconhece a mensagem do Firefox para o mesmo caso', () => {
    const erro = new Error('error loading dynamically imported module');
    expect(ehFalhaDeChunkDesatualizado(erro)).toBe(true);
  });

  it('reconhece a mensagem do Safari para o mesmo caso', () => {
    const erro = new Error('Importing a module script failed');
    expect(ehFalhaDeChunkDesatualizado(erro)).toBe(true);
  });

  it('reconhece o texto "Loading chunk" usado por outros bundlers/mensagens equivalentes', () => {
    const erro = new Error('Loading chunk 42 failed.');
    expect(ehFalhaDeChunkDesatualizado(erro)).toBe(true);
  });

  it('não reconhece um erro genérico não relacionado a import dinâmico', () => {
    const erro = new Error('Network request failed');
    expect(ehFalhaDeChunkDesatualizado(erro)).toBe(false);
  });

  it('não quebra com erro nulo/indefinido ou sem message', () => {
    expect(ehFalhaDeChunkDesatualizado(null)).toBe(false);
    expect(ehFalhaDeChunkDesatualizado(undefined)).toBe(false);
    expect(ehFalhaDeChunkDesatualizado({})).toBe(false);
  });
});
