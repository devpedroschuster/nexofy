// src/components/ui/Badge.jsx
// ─── Midnight Indigo · Badge ──────────────────────────────────────────────────
//
// Tons semânticos: primary | success | warning | destructive | info | neutral
// Variantes visuais: soft (padrão) | solid | outline | premium
//
// Soft  → fundo com opacidade 12%, texto na cor semântica — leitura confortável
// Solid → fundo sólido + foreground contrastante
// Outline → borda + texto semântico, sem fundo
// Premium → gradiente primary (destaque máximo)
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { cn } from '../../lib/cn';

/* Mapa: tone → classes por variante */
const TONES = {
  primary: {
    soft:    'bg-primary-soft text-primary',
    solid:   'bg-primary text-primary-foreground',
    outline: 'border border-primary/60 text-primary',
  },
  success: {
    soft:    'bg-success-soft text-success',
    solid:   'bg-success text-success-foreground',
    outline: 'border border-success/60 text-success',
  },
  warning: {
    soft:    'bg-warning-soft text-warning',
    solid:   'bg-warning text-warning-foreground',
    outline: 'border border-warning/60 text-warning',
  },
  destructive: {
    soft:    'bg-destructive-soft text-destructive',
    solid:   'bg-destructive text-destructive-foreground',
    outline: 'border border-destructive/60 text-destructive',
  },
  info: {
    soft:    'bg-info-soft text-info',
    solid:   'bg-info text-info-foreground',
    outline: 'border border-info/60 text-info',
  },
  neutral: {
    soft:    'bg-muted text-muted-foreground',
    solid:   'bg-foreground text-background',
    outline: 'border border-border text-muted-foreground',
  },
};

const BASE =
  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold leading-5 transition-colors';

export default function Badge({
  tone = 'neutral',
  variant = 'soft',
  className,
  children,
  ...rest
}) {
  /* Variante premium é especial — ignora tone */
  if (variant === 'premium') {
    return (
      <span
        className={cn(
          BASE,
          'bg-gradient-primary text-primary-foreground shadow-sm',
          className
        )}
        {...rest}
      >
        {children}
      </span>
    );
  }

  const toneMap = TONES[tone] ?? TONES.neutral;
  const variantClasses = toneMap[variant] ?? toneMap.soft;

  return (
    <span className={cn(BASE, variantClasses, className)} {...rest}>
      {children}
    </span>
  );
}
