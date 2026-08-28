import { describe, it, expect, vi } from 'vitest';
import { criarDetectorDeAtualizacao } from './useSWUpdateNotifier';

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
