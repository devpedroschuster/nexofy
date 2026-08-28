import { describe, it, expect, vi } from 'vitest';
import { destinoRotaModulo } from './rotaModulo';

vi.mock('./navigation', () => ({
  rotaPorPerfil: (perfil) => (perfil === 'professor' ? '/agenda' : '/dashboard'),
}));

describe('destinoRotaModulo', () => {
  it('libera acesso (retorna null) quando o módulo está na lista', () => {
    expect(destinoRotaModulo(['agenda', 'landing_page_builder'], 'landing_page_builder', 'admin')).toBeNull();
  });

  it('bloqueia e redireciona pra rota do perfil quando o módulo não está na lista', () => {
    expect(destinoRotaModulo(['agenda', 'financeiro'], 'landing_page_builder', 'admin')).toBe('/dashboard');
  });

  it('bloqueia (fail-closed) quando a lista de módulos está vazia', () => {
    // Diferente da salvaguarda do Sidebar (lista vazia não esconde item de
    // menu) — aqui lista vazia BLOQUEIA. RotaComModulo só renderiza depois
    // que RotaPrivada já resolveu `loading`, então não existe a mesma
    // corrida de carregamento que o Sidebar precisa absorver; e o custo de
    // errar é oposto (liberar de mais é pior que bloquear de mais).
    expect(destinoRotaModulo([], 'landing_page_builder', 'professor')).toBe('/agenda');
  });

  it('bloqueia quando modulosAtivos é null/undefined', () => {
    expect(destinoRotaModulo(undefined, 'landing_page_builder', 'admin')).toBe('/dashboard');
  });
});
