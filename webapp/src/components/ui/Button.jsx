// src/components/ui/Button.jsx
// ─── Midnight Indigo · Button ─────────────────────────────────────────────────
//
// Variantes:
//   default     — primary sólido (ação principal)
//   premium     — gradiente + glow (CTAs de destaque)
//   destructive — ação destrutiva
//   success     — confirmação / ação positiva
//   outline     — borda sobre fundo transparente
//   secondary   — fundo muted, menos ênfase
//   ghost       — sem fundo (navegação / ações secundárias)
//   link        — pareado com texto
//
// Tamanhos: sm | default | lg | xl | icon
//
// Estados: hover, active, focus-visible (ring AA), disabled — TODOS obrigatórios
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { cn } from '../../lib/cn';

const BASE = [
  'relative inline-flex items-center justify-center gap-2 whitespace-nowrap',
  'rounded-lg text-sm font-medium leading-none',
  'transition-all duration-200 ease-out outline-none',
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  'active:scale-[0.98]',
  'disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none',
  '[&_svg]:size-4 [&_svg]:shrink-0',
].join(' ');

const VARIANTS = {
  default:
    'bg-primary text-primary-foreground shadow-sm ' +
    'hover:bg-primary/90 hover:-translate-y-0.5 hover:shadow-elegant',

  premium:
    'bg-gradient-primary text-primary-foreground shadow-elegant ' +
    'hover:shadow-glow hover:-translate-y-0.5',

  destructive:
    'bg-destructive text-destructive-foreground shadow-sm ' +
    'hover:bg-destructive/90 hover:-translate-y-0.5',

  success:
    'bg-success text-success-foreground shadow-sm ' +
    'hover:bg-success/90 hover:-translate-y-0.5',

  outline:
    'border border-border bg-transparent text-foreground ' +
    'hover:bg-accent hover:text-accent-foreground hover:border-primary/40',

  secondary:
    'bg-secondary text-secondary-foreground ' +
    'hover:bg-subtle',

  ghost:
    'text-foreground hover:bg-accent hover:text-accent-foreground',

  link:
    'text-primary underline-offset-4 hover:underline active:scale-100',
};

const SIZES = {
  sm:      'h-8 rounded-md px-3 text-xs',
  default: 'h-10 px-5 py-2',
  lg:      'h-12 rounded-xl px-8 text-base',
  xl:      'h-14 rounded-xl px-10 text-base font-semibold',
  icon:    'h-10 w-10 p-0',
};

const Button = React.forwardRef(function Button(
  {
    as: Tag = 'button',
    variant = 'default',
    size = 'default',
    fullWidth = false,
    loading = false,
    leftIcon,
    rightIcon,
    className,
    children,
    disabled,
    ...rest
  },
  ref
) {
  return (
    <Tag
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        BASE,
        VARIANTS[variant] ?? VARIANTS.default,
        SIZES[size]       ?? SIZES.default,
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </Tag>
  );
});

export default Button;
