-- Reverte 20260901120000_add_trial_ends_at_estudios.sql: remove a coluna
-- trial_ends_at. Estrutural, perde o dado de prazo de trial de qualquer
-- estúdio que já tenha essa coluna preenchida — confirmar que não há
-- dependência viva (trigger trg_prevent_trial_tampering,
-- 20260901160000_prevent_trial_tampering.sql, e a própria coluna sendo lida
-- por estudio_id_atual()/verificar_status_estudio() desde
-- 20260901122000/20260902160000) antes de aplicar num incidente — reverter
-- esta migration sozinha sem reverter as que passaram a depender da coluna
-- quebra essas functions.
ALTER TABLE public.estudios
  DROP COLUMN IF EXISTS trial_ends_at;
