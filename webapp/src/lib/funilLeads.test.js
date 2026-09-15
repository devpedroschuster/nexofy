import { describe, it, expect } from 'vitest';
import { classificarFollowup, ESTAGIOS_FUNIL, ESTAGIOS_ATIVOS, ESTAGIOS_FINAIS } from './funilLeads';

describe('classificarFollowup', () => {
  const agora = new Date('2026-09-14T15:00:00-03:00');

  it('retorna null quando não há follow-up agendado', () => {
    expect(classificarFollowup(null, agora)).toBe(null);
  });

  it('retorna "atrasado" quando a data/hora já passou hoje', () => {
    expect(classificarFollowup('2026-09-14T09:00:00-03:00', agora)).toBe('atrasado');
  });

  it('retorna "atrasado" quando é de um dia anterior', () => {
    expect(classificarFollowup('2026-09-10T09:00:00-03:00', agora)).toBe('atrasado');
  });

  it('retorna "hoje" quando é mais tarde no mesmo dia', () => {
    expect(classificarFollowup('2026-09-14T18:00:00-03:00', agora)).toBe('hoje');
  });

  it('retorna "agendado" quando é um dia futuro', () => {
    expect(classificarFollowup('2026-09-20T09:00:00-03:00', agora)).toBe('agendado');
  });

  it('retorna "hoje" quando o instante é exatamente igual a "agora" (limite estrito)', () => {
    expect(classificarFollowup(agora.toISOString(), agora)).toBe('hoje');
  });

  it('usa `agora = new Date()` como padrão quando o 2º argumento não é passado', () => {
    const futuro = new Date(Date.now() + 86400000).toISOString();
    expect(classificarFollowup(futuro)).toBe('agendado');
  });
});

describe('ESTAGIOS_FUNIL', () => {
  it('tem os 6 estágios na ordem do funil', () => {
    expect(ESTAGIOS_FUNIL.map(e => e.valor)).toEqual([
      'novo', 'contatado', 'aula_agendada', 'negociacao', 'convertido', 'perdido',
    ]);
  });

  it('ESTAGIOS_ATIVOS cobre só os 4 estágios não-finais', () => {
    expect(ESTAGIOS_ATIVOS).toEqual(['novo', 'contatado', 'aula_agendada', 'negociacao']);
  });

  it('ESTAGIOS_FINAIS cobre convertido e perdido', () => {
    expect(ESTAGIOS_FINAIS).toEqual(['convertido', 'perdido']);
  });
});
