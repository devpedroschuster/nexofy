// src/components/ui/Input.jsx
// ─── Midnight Indigo · Input + Label ─────────────────────────────────────────
//
// Input:
//   - Estados: default, focus (ring), disabled, error
//   - Suporta ícone à esquerda e à direita (leftIcon / rightIcon)
//   - Pode ser renderizado como <input> ou <textarea> via prop `as`
//   - rightIcon é INTENCIONALMENTE clicável (sem pointer-events-none), pois é
//     usado para ações como toggle de "mostrar senha". Não adicionar
//     pointer-events-none aqui sem revisar os usos existentes de rightIcon.
//
// Label / ErrorMessage / FormField:
//   - FormField é o padrão recomendado para novos formulários (garante
//     aria-describedby e ids consistentes). Preferir FormField a montar
//     Label + Input + ErrorMessage manualmente.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useId } from 'react';
import { cn } from '../../lib/cn';

export const inputBaseClass = cn(
  'w-full rounded-xl border border-input bg-background text-foreground',
  'placeholder:text-muted-foreground',
  'px-4 py-2.5 text-sm font-normal leading-relaxed',
  'outline-none transition-all duration-200',
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0 focus-visible:border-primary',
  'disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-muted/50',
);

const inputErrorClass = 'border-destructive focus-visible:ring-destructive';

const Input = React.forwardRef(function Input(
  {
    as = 'input',
    leftIcon,
    rightIcon,
    error,
    errorId,
    className,
    wrapperClassName,
    rows,
    'aria-describedby': ariaDescribedBy,
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

  const a11yProps = {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error && errorId ? errorId : ariaDescribedBy,
  };

  if (!leftIcon && !rightIcon) {
    return <Tag ref={ref} className={classes} {...extraProps} {...a11yProps} {...rest} />;
  }

  return (
    <div className={cn('relative', wrapperClassName)}>
      {leftIcon && (
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
          {leftIcon}
        </span>
      )}
      <Tag ref={ref} className={classes} {...extraProps} {...a11yProps} {...rest} />
      {rightIcon && (
        // Sem pointer-events-none de propósito — ver comentário no topo do arquivo.
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground [&_svg]:size-4">
          {rightIcon}
        </span>
      )}
    </div>
  );
});

export default Input;

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

export function ErrorMessage({ children, className, id }) {
  if (!children) return null;
  return (
    <p id={id} className={cn('mt-1.5 text-xs font-medium text-destructive', className)} role="alert">
      {children}
    </p>
  );
}

/* FormField agora gera e conecta os ids automaticamente (Label ⇄ Input ⇄ ErrorMessage) */
export function FormField({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  className,
}) {
  const generatedId = useId();
  const fieldId = htmlFor || generatedId;
  const errorId = error ? `${fieldId}-error` : undefined;

  const enhancedChildren = React.isValidElement(children)
    ? React.cloneElement(children, {
        id: children.props.id || fieldId,
        error: children.props.error ?? Boolean(error),
        errorId: children.props.errorId || errorId,
      })
    : children;

  return (
    <div className={cn('space-y-0', className)}>
      {label && (
        <Label htmlFor={fieldId} required={required} hint={hint}>
          {label}
        </Label>
      )}
      {enhancedChildren}
      <ErrorMessage id={errorId}>{error}</ErrorMessage>
    </div>
  );
}