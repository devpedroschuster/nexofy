import { describe, it, expect } from 'vitest';
import {
  construirConsentimentoPendente,
  parseConsentimentoPendente,
  CONSENTIMENTO_PENDENTE_KEY,
} from './consentimento';
import { DOCUMENTOS_LEGAIS } from './constants';

describe('construirConsentimentoPendente', () => {
  it('retorna as versões vigentes de termos e privacidade', () => {
    expect(construirConsentimentoPendente()).toEqual({
      termos_versao: DOCUMENTOS_LEGAIS.TERMOS.versao,
      privacidade_versao: DOCUMENTOS_LEGAIS.PRIVACIDADE.versao,
    });
  });
});

describe('parseConsentimentoPendente', () => {
  it('faz round-trip com o que construirConsentimentoPendente gera', () => {
    const original = construirConsentimentoPendente();
    const bruto = JSON.stringify(original);
    expect(parseConsentimentoPendente(bruto)).toEqual(original);
  });

  it('retorna null para null/undefined/string vazia', () => {
    expect(parseConsentimentoPendente(null)).toBeNull();
    expect(parseConsentimentoPendente(undefined)).toBeNull();
    expect(parseConsentimentoPendente('')).toBeNull();
  });

  it('retorna null para JSON inválido', () => {
    expect(parseConsentimentoPendente('{não é json')).toBeNull();
  });

  it('retorna null quando faltam campos ou têm tipo errado', () => {
    expect(parseConsentimentoPendente(JSON.stringify({ termos_versao: '2026-09-03' }))).toBeNull();
    expect(parseConsentimentoPendente(JSON.stringify({ termos_versao: 1, privacidade_versao: '2026-09-03' }))).toBeNull();
    expect(parseConsentimentoPendente(JSON.stringify('string solta'))).toBeNull();
  });

  it('exporta uma chave de sessionStorage estável', () => {
    expect(CONSENTIMENTO_PENDENTE_KEY).toBe('nexofy_consentimento_pendente');
  });
});
