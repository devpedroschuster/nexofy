alter table public.estudios
  add column status text not null default 'ativo'
  check (status in ('ativo', 'inativo', 'suspenso', 'cancelado'));

comment on column public.estudios.status is
  'Status do estúdio: ativo (operando normalmente), inativo (pausado pelo estúdio/inadimplência), suspenso (bloqueado pelo super_admin), cancelado (soft-delete, encerrado).';
