-- Trial de 14 dias (PED-105): guarda quando o trial do estúdio termina.
-- NULL = sem prazo (estúdio já existente antes da feature, ou criado
-- manualmente pelo super_admin via onboarding comercial — ver
-- criar_estudio_transacional, migration seguinte).
ALTER TABLE public.estudios
  ADD COLUMN trial_ends_at timestamptz;
