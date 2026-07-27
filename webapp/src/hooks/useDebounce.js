import { useState, useEffect } from 'react';

/**
 * Retorna uma versão "atrasada" (debounced) de um valor, útil para
 * evitar disparar buscas/requisições a cada mudança (ex: digitação).
 *
 * @template T
 * @param {T} value - Valor a ser debounced.
 * @param {number} [delay=500] - Atraso em ms antes de atualizar o valor.
 * @returns {T} Valor debounced.
 */
export function useDebounce(value, delay = 500) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    // Garante um delay não-negativo, evitando comportamento inesperado
    // caso algum consumidor passe um valor inválido.
    const safeDelay = Number.isFinite(delay) && delay >= 0 ? delay : 0;

    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, safeDelay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}