import { describe, it, expect } from 'vitest';
import { ETAPAS_CHECKLIST, calcularProgressoChecklist, calcularEstadoChecklist } from './onboardingChecklist';

describe('ETAPAS_CHECKLIST', () => {
  it('define as 4 etapas na ordem Modalidade -> Professor -> Plano -> Aluno', () => {
    expect(ETAPAS_CHECKLIST.map(e => e.id)).toEqual(['modalidade', 'professor', 'plano', 'aluno']);
  });

  it('marca só o professor como opcional', () => {
    expect(ETAPAS_CHECKLIST.filter(e => e.opcional).map(e => e.id)).toEqual(['professor']);
  });
});

describe('calcularProgressoChecklist', () => {
  it('com todas as contagens zeradas, nada concluído e 0%', () => {
    const progresso = calcularProgressoChecklist({});
    expect(progresso.etapas.every(e => !e.concluida)).toBe(true);
    expect(progresso.concluidasObrigatorias).toBe(0);
    expect(progresso.totalObrigatorias).toBe(3);
    expect(progresso.percentual).toBe(0);
    expect(progresso.completo).toBe(false);
  });

  it('conclusão parcial calcula o percentual só sobre as etapas obrigatórias', () => {
    const progresso = calcularProgressoChecklist({ modalidade: 1, professor: 0, plano: 0, aluno: 0 });
    expect(progresso.concluidasObrigatorias).toBe(1);
    expect(progresso.percentual).toBe(33);
    expect(progresso.completo).toBe(false);
  });

  it('fica completo com as 3 etapas obrigatórias feitas, mesmo sem professor', () => {
    const progresso = calcularProgressoChecklist({ modalidade: 2, professor: 0, plano: 1, aluno: 5 });
    expect(progresso.completo).toBe(true);
    expect(progresso.percentual).toBe(100);
    expect(progresso.etapas.find(e => e.id === 'professor').concluida).toBe(false);
  });

  it('trata contagens ausentes/nulas como zero, sem lançar erro', () => {
    const progresso = calcularProgressoChecklist({ modalidade: null, plano: undefined, aluno: 0 });
    expect(progresso.completo).toBe(false);
    expect(progresso.etapas.every(e => typeof e.concluida === 'boolean')).toBe(true);
  });

  it('a etapa opcional fica concluída quando tem contagem, mesmo não contando pro percentual', () => {
    const progresso = calcularProgressoChecklist({ modalidade: 1, professor: 2, plano: 1, aluno: 1 });
    expect(progresso.etapas.find(e => e.id === 'professor').concluida).toBe(true);
    expect(progresso.percentual).toBe(100);
  });

  it('2 de 3 obrigatórias arredonda o percentual pra 67%', () => {
    const progresso = calcularProgressoChecklist({ modalidade: 1, professor: 0, plano: 1, aluno: 0 });
    expect(progresso.concluidasObrigatorias).toBe(2);
    expect(progresso.percentual).toBe(67);
    expect(progresso.completo).toBe(false);
  });
});

describe('calcularEstadoChecklist', () => {
  it('oculta se já foi reconhecido (completedAck), não importa o resto', () => {
    expect(calcularEstadoChecklist({ completo: false, dismissed: false, seenIncomplete: true, completedAck: true }))
      .toEqual({ estado: 'oculto', marcarConcluido: false });
  });

  it('comemora quando completou e já tinha sido visto incompleto antes', () => {
    expect(calcularEstadoChecklist({ completo: true, dismissed: false, seenIncomplete: true, completedAck: false }))
      .toEqual({ estado: 'comemorando', marcarConcluido: false });
  });

  it('oculta e marca concluído em silêncio quando já estava completo sem nunca ter sido visto incompleto', () => {
    expect(calcularEstadoChecklist({ completo: true, dismissed: false, seenIncomplete: false, completedAck: false }))
      .toEqual({ estado: 'oculto', marcarConcluido: true });
  });

  it('mostra colapsado quando incompleto e dispensado', () => {
    expect(calcularEstadoChecklist({ completo: false, dismissed: true, seenIncomplete: true, completedAck: false }))
      .toEqual({ estado: 'colapsado', marcarConcluido: false });
  });

  it('mostra expandido quando incompleto e não dispensado', () => {
    expect(calcularEstadoChecklist({ completo: false, dismissed: false, seenIncomplete: false, completedAck: false }))
      .toEqual({ estado: 'expandido', marcarConcluido: false });
  });

  it('completo vence um dismissed "esquecido" de antes de terminar o checklist — ainda comemora', () => {
    expect(calcularEstadoChecklist({ completo: true, dismissed: true, seenIncomplete: true, completedAck: false }))
      .toEqual({ estado: 'comemorando', marcarConcluido: false });
  });
});
