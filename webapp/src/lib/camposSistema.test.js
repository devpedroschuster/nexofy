import { describe, it, expect } from 'vitest';
import { sugereCampoSensivel } from './camposSistema';

// PED-173: garante que o heurístico do client fica alinhado com o
// vocabulário da função espelho no banco (sugere_campo_sensivel em
// supabase/migrations/20260908140000_add_sensivel_campos_dinamicos.sql).
describe('sugereCampoSensivel', () => {
  it.each([
    ['condicao_saude', 'Condição de saúde'],
    ['alergias', 'Alergias'],
    ['religiao', 'Religião'],
    ['orientacao_sexual', 'Orientação sexual'],
    ['grupo_pcd', 'É PCD?'],
    ['dado_biometrico', 'Dado biométrico'],
  ])('marca "%s" / "%s" como sugestão de campo sensível', (fieldName, label) => {
    expect(sugereCampoSensivel(fieldName, label)).toBe(true);
  });

  it.each([
    ['pe_dominante', 'Pé dominante'],
    ['numero_camiseta', 'Número da camiseta'],
    ['indicacao', 'Como conheceu o estúdio?'],
  ])('não marca "%s" / "%s" (campo neutro)', (fieldName, label) => {
    expect(sugereCampoSensivel(fieldName, label)).toBe(false);
  });

  it('não quebra com valores ausentes', () => {
    expect(sugereCampoSensivel(undefined, undefined)).toBe(false);
    expect(sugereCampoSensivel('', '')).toBe(false);
  });
});
