import { describe, it, expect } from 'vitest';
import { moduloEstaAtivo } from './modulos';

describe('moduloEstaAtivo', () => {
  it('retorna true quando a chave está na lista', () => {
    expect(moduloEstaAtivo(['agenda', 'landing_page_builder'], 'landing_page_builder')).toBe(true);
  });

  it('retorna false quando a chave não está na lista', () => {
    expect(moduloEstaAtivo(['agenda', 'financeiro'], 'landing_page_builder')).toBe(false);
  });

  it('fail-closed (false) quando modulosAtivos é null', () => {
    expect(moduloEstaAtivo(null, 'landing_page_builder')).toBe(false);
  });

  it('fail-closed (false) quando modulosAtivos é undefined', () => {
    expect(moduloEstaAtivo(undefined, 'landing_page_builder')).toBe(false);
  });

  it('fail-closed (false) quando modulosAtivos vem como string, mesmo contendo a chave como substring', () => {
    // Regressão (PED-61): `.includes()` em string faz busca de substring, não
    // de elemento — 'landing_page_builder_v2'.includes('landing_page_builder')
    // é true, o que inverteria este guard de fail-closed pra fail-open.
    expect(moduloEstaAtivo('landing_page_builder_v2', 'landing_page_builder')).toBe(false);
  });
});
