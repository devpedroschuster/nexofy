// src/components/ui/ThemeToggle.jsx
// ─── Midnight Indigo · ThemeToggle ───────────────────────────────────────────
//
// Toggle 3 posições: Claro | Sistema | Escuro
// Acessível: role="radiogroup" + aria-checked por opção
// Design: pill com indicador flutuante animado
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from '../../providers/ThemeProvider';
import { cn } from '../../lib/cn';

const OPTIONS = [
  { value: 'light',  Icon: Sun,     label: 'Claro'   },
  { value: 'system', Icon: Monitor, label: 'Sistema' },
  { value: 'dark',   Icon: Moon,    label: 'Escuro'  },
];

export default function ThemeToggle({ className }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Tema da interface"
      className={cn(
        'inline-flex items-center gap-0.5 rounded-2xl',
        'border border-border bg-muted p-1',
        className
      )}
    >
      {OPTIONS.map(({ value, Icon, label }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-xl',
              'transition-all duration-200 ease-out outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-muted',
              active
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon size={14} strokeWidth={active ? 2.5 : 1.75} />
          </button>
        );
      })}
    </div>
  );
}
