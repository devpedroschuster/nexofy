-- Nível 2: Cor de marca customizável
-- cor_primaria já existia na tabela (sem constraint); adicionamos cor_secundaria
-- e um check de formato hex para os dois campos, permitindo NULL (fallback tratado no front-end).

alter table public.estudios
  add column if not exists cor_secundaria text;

alter table public.estudios
  add constraint estudios_cor_primaria_check
  check (cor_primaria is null or cor_primaria ~ '^#[0-9A-Fa-f]{6}$');

alter table public.estudios
  add constraint estudios_cor_secundaria_check
  check (cor_secundaria is null or cor_secundaria ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.estudios.cor_primaria is 'Cor principal da marca do estúdio (hex #RRGGBB). NULL = usa paleta padrão do Nexofy.';
comment on column public.estudios.cor_secundaria is 'Cor secundária/apoio da marca do estúdio (hex #RRGGBB). NULL = usa paleta padrão do Nexofy.';
