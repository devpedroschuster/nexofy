// src/components/ui/EmptyState.jsx
// ─── Midnight Indigo · EmptyState ────────────────────────────────────────────
//
// Estado vazio consistente: ícone + título + descrição + ação opcional.
// Tratado como convite à ação, não como erro.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { SearchX } from 'lucide-react';
import { cn } from '../../lib/cn';

export default function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  /* aliases para retrocompatibilidade */
  titulo,
  mensagem,
}) {
  const _title       = title       ?? titulo;
  const _description = description ?? mensagem;
  const _icon        = icon ?? <SearchX size={24} />;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        'py-16 px-6 rounded-xl',
        'border border-dashed border-border bg-muted/30',
        className
      )}
    >
      {/* Ícone em container colorido */}
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-soft text-primary">
        {_icon}
      </div>

      {_title && (
        <h3 className="text-base font-semibold text-foreground">
          {_title}
        </h3>
      )}

      {_description && (
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted-foreground">
          {_description}
        </p>
      )}

      {action && (
        <div className="mt-6">
          {action}
        </div>
      )}
    </div>
  );
}
