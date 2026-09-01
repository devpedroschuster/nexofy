// src/components/shared/IndicadorForcaSenha.jsx
//
// Medidor de força de senha (barras + label + dica), extraído de
// RedefinirSenha.jsx para ser reaproveitado também no Cadastro — mesma
// lógica de pontuação em lib/security.js (calcularForcaSenha).

import React, { useMemo } from 'react';
import { calcularForcaSenha, FORCA_SENHA_CONFIG } from '../../lib/security';
import { cn } from '../../lib/cn';

export default function IndicadorForcaSenha({ senha, minimo }) {
  const nivel  = useMemo(() => (senha ? calcularForcaSenha(senha, minimo) : 0), [senha, minimo]);
  const config = FORCA_SENHA_CONFIG[nivel];

  if (!senha) return null;

  return (
    <div className="mt-2 space-y-1.5" aria-live="polite" aria-atomic="true">
      <div className="flex gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={nivel}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-all duration-300',
              nivel > 0 && i <= (config?.segmentos ?? 0)
                ? config.barClass
                : 'bg-muted'
            )}
          />
        ))}
      </div>

      {config && (
        <p className={cn('text-xs font-medium leading-snug', config.textoClass)}>
          Senha {config.label}
          {config.dica && (
            <span className="ml-1 font-normal text-muted-foreground">
              — {config.dica}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
