// src/components/ui/Input.jsx
// ─── Midnight Indigo · Input + Label ─────────────────────────────────────────
//
// Input:
//   - Estados: default, focus (ring), disabled, error
//   - Suporta ícone à esquerda e à direita (leftIcon / rightIcon)
//   - Pode ser renderizado como <input> ou <textarea> via prop `as`
//
// Label:
//   - Tipografia muted pequena, uppercase tracking — padrão Midnight Indigo
//   - Suporte a `required` (asterisco destructive)
//   - Suporte a `hint` (texto auxiliar inline)
//
// FormField:
//   - Wrapper conveniente: Label + Input + ErrorMessage
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { cn } from '../../lib/cn';

/* ── Base compartilhada ─────────────────────────────────────────────────────── */
export const inputBaseClass = cn(
  'w-full rounded-xl border border-input bg-background text-foreground',
  'placeholder:text-muted-foreground',
  'px-4 py-2.5 text-sm font-normal leading-relaxed',
  'outline-none transition-all duration-200',
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:border-primary',
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-muted/50',
);

const inputErrorClass = 'border-destructive focus-visible:ring-destructive';

/* ── Input ──────────────────────────────────────────────────────────────────── */
const Input = React.forwardRef(function Input(
  {
    as = 'input',
    leftIcon,
    rightIcon,
    error,
    className,
    wrapperClassName,
    rows,
    ...rest
  },
  ref
) {
  const Tag = as;

  const classes = cn(
    inputBaseClass,
    leftIcon  && 'pl-10',
    rightIcon && 'pr-10',
    as === 'textarea' && 'resize-none min-h-[100px] py-3',
    error && inputErrorClass,
    className
  );

  const extraProps = as === 'textarea' ? { rows: rows ?? 4 } : {};

  if (!leftIcon && !rightIcon) {
    return <Tag ref={ref} className={classes} {...extraProps} {...rest} />;
  }

  return (
    <div className={cn('relative', wrapperClassName)}>
      {leftIcon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
          {leftIcon}
        </span>
      )}
      <Tag ref={ref} className={classes} {...extraProps} {...rest} />
      {rightIcon && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
          {rightIcon}
        </span>
      )}
    </div>
  );
});

export default Input;

/* ── Label ──────────────────────────────────────────────────────────────────── */
export function Label({ children, htmlFor, className, required, hint }) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        'mb-1.5 flex items-center gap-1.5',
        'text-xs font-semibold uppercase tracking-wider text-muted-foreground',
        className
      )}
    >
      {children}
      {required && <span className="text-destructive">*</span>}
      {hint && (
        <span className="ml-auto text-[10px] font-normal normal-case tracking-normal text-muted-foreground/60">
          {hint}
        </span>
      )}
    </label>
  );
}

/* ── ErrorMessage ───────────────────────────────────────────────────────────── */
export function ErrorMessage({ children, className }) {
  if (!children) return null;
  return (
    <p className={cn('mt-1.5 text-xs font-medium text-destructive', className)}>
      {children}
    </p>
  );
}

/* ── FormField — wrapper completo ───────────────────────────────────────────── */
export function FormField({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  className,
}) {
  return (
    <div className={cn('space-y-0', className)}>
      {label && (
        <Label htmlFor={htmlFor} required={required} hint={hint}>
          {label}
        </Label>
      )}
      {children}
      <ErrorMessage>{error}</ErrorMessage>
    </div>
  );
}
