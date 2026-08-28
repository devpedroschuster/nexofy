import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { criarDetectorDeAtualizacao, agendarVerificacaoAtiva } from './useSWUpdateNotifier';

// Isola a função pura sob teste do resto do módulo: useSWUpdateNotifier()
// importa showToast (react-hot-toast + ThemeProvider), que não tem relação
// nenhuma com a lógica de criarDetectorDeAtualizacao e não precisa ser
// carregado de verdade pra este teste (mesmo padrão de rotaModulo.test.js).
vi.mock('../components/shared/Toast', () => ({
  showToast: { custom: vi.fn() },
}));

describe('criarDetectorDeAtualizacao', () => {
  it('não avisa na primeira troca de controller quando a aba ainda não tinha controller (primeira ativação do SW, não é atualização)', () => {
    const deveNotificar = criarDetectorDeAtualizacao(false);
    expect(deveNotificar()).toBe(false);
  });

  it('avisa na troca de controller quando a aba já tinha um controller antes (atualização de verdade)', () => {
    const deveNotificar = criarDetectorDeAtualizacao(true);
    expect(deveNotificar()).toBe(true);
  });

  it('avisa em toda troca subsequente após ignorar a primeira ativação', () => {
    const deveNotificar = criarDetectorDeAtualizacao(false);
    expect(deveNotificar()).toBe(false);
    expect(deveNotificar()).toBe(true);
    expect(deveNotificar()).toBe(true);
  });
});

// doc é um EventTarget simples (não precisa de jsdom — o ambiente de teste
// deste projeto é 'node', ver vitest.config.js) com visibilityState setável
// manualmente, o suficiente pra exercitar agendarVerificacaoAtiva sem
// depender de um DOM de verdade.
function criarDocFake(visibilityStateInicial) {
  const doc = new EventTarget();
  doc.visibilityState = visibilityStateInicial;
  return doc;
}

describe('agendarVerificacaoAtiva', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('chama registration.update() periodicamente, a cada intervalMs', () => {
    const registration = { update: vi.fn().mockResolvedValue(undefined) };
    const doc = criarDocFake('visible');

    agendarVerificacaoAtiva(registration, doc, 1000);
    expect(registration.update).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(registration.update).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000);
    expect(registration.update).toHaveBeenCalledTimes(3);
  });

  it('chama registration.update() quando a aba volta a ficar visível, mas não quando fica oculta', () => {
    const registration = { update: vi.fn().mockResolvedValue(undefined) };
    const doc = criarDocFake('hidden');

    agendarVerificacaoAtiva(registration, doc, 1000);

    doc.dispatchEvent(new Event('visibilitychange'));
    expect(registration.update).not.toHaveBeenCalled();

    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('a função de cancelamento retornada para o polling e remove o listener de visibilitychange', () => {
    const registration = { update: vi.fn().mockResolvedValue(undefined) };
    const doc = criarDocFake('visible');

    const cancelar = agendarVerificacaoAtiva(registration, doc, 1000);
    cancelar();

    vi.advanceTimersByTime(5000);
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(registration.update).not.toHaveBeenCalled();
  });
});
