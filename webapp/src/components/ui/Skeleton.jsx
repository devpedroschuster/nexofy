// src/components/ui/Skeleton.jsx
// ─── Midnight Indigo · Skeleton ───────────────────────────────────────────────
//
// Componentes de loading state consistentes com o design system.
// Usa animate-pulse (Tailwind) + tokens do Midnight Indigo.
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { cn } from '../../lib/cn';

/* ── Base Skeleton ───────────────────────────────────────────────────────────── */
export function Skeleton({ className, ...rest }) {
  return (
    <div
      className={cn('animate-pulse rounded-lg bg-muted', className)}
      aria-hidden="true"
      {...rest}
    />
  );
}

/* ── Linha de texto ─────────────────────────────────────────────────────────── */
export function SkeletonText({ lines = 3, className }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-4', i === lines - 1 ? 'w-3/4' : 'w-full')}
        />
      ))}
    </div>
  );
}

/* ── Card Skeleton ──────────────────────────────────────────────────────────── */
export function SkeletonCard({ className }) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-6 space-y-4',
        className
      )}
      aria-hidden="true"
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  );
}

/* ── Row Skeleton (NOVO) ───────────────────────────────────────────────────── */
export function SkeletonRow({ className }) {
  return (
    <div
      className={cn('flex items-center gap-4 p-4', className)}
      aria-hidden="true"
    >
      <Skeleton className="h-12 w-12 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/* ── Avatar Skeleton ────────────────────────────────────────────────────────── */
export function SkeletonAvatar({ size = 'md', className }) {
  const sizes = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
  };
  return (
    <Skeleton
      className={cn('rounded-full shrink-0', sizes[size] ?? sizes.md, className)}
    />
  );
}

/* ── Compound component: anexa as variantes ao Skeleton base ───────────────── */
Skeleton.Text = SkeletonText;
Skeleton.Card = SkeletonCard;
Skeleton.Row = SkeletonRow;
Skeleton.Avatar = SkeletonAvatar;

export default Skeleton;