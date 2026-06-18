// src/components/ui/Surface.jsx
// ─── Midnight Indigo · Surface (Card) ────────────────────────────────────────
//
// Variantes:
//   card      — superfície padrão (bg-card + border + shadow-card)
//   elevated  — card com sombra elegante (mais destaque)
//   muted     — fundo muted, sem borda (seções internas)
//   flat      — apenas borda, fundo transparente
//   glass     — glass morphism (backdrop-blur)
//
// Padding: none | xs | sm | md | lg | xl
// Radius:  md | lg | xl | 2xl | 3xl (default: xl)
//
// Prop `interactive`: adiciona hover-lift e cursor-pointer
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { cn } from '../../lib/cn';

const VARIANTS = {
  card:     'bg-card text-card-foreground border border-border shadow-card',
  elevated: 'bg-card text-card-foreground border border-border shadow-elegant',
  muted:    'bg-muted text-foreground',
  flat:     'bg-transparent border border-border',
  glass:    'bg-card/70 backdrop-blur-md border border-border/80',
};

const PADDINGS = {
  none: '',
  xs:   'p-3',
  sm:   'p-4',
  md:   'p-5',
  lg:   'p-6',
  xl:   'p-8',
};

const RADII = {
  md:   'rounded-md',
  lg:   'rounded-lg',
  xl:   'rounded-xl',
  '2xl':'rounded-2xl',
  '3xl':'rounded-3xl',
};

const Surface = React.forwardRef(function Surface(
  {
    variant   = 'card',
    padding   = 'lg',
    radius    = 'xl',
    as: Tag   = 'div',
    interactive = false,
    className,
    children,
    ...rest
  },
  ref
) {
  return (
    <Tag
      ref={ref}
      className={cn(
        VARIANTS[variant] ?? VARIANTS.card,
        PADDINGS[padding] ?? PADDINGS.lg,
        RADII[radius]     ?? RADII.xl,
        interactive && [
          'cursor-pointer select-none',
          'transition-all duration-200 ease-out',
          'hover:-translate-y-0.5 hover:shadow-elegant',
          'active:translate-y-0 active:shadow-card',
        ],
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
});

export default Surface;
