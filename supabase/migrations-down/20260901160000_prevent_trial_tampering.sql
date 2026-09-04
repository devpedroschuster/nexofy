-- Reverte 20260901160000_prevent_trial_tampering.sql: remove a trigger e a
-- function. Depois deste down, o admin do próprio estúdio volta a poder
-- alterar trial_ends_at via PATCH direto na API REST (RLS de UPDATE em
-- estudios não é por coluna) — reintroduz a lacuna que esta migration
-- fechou. Só para uso de emergência caso a trigger esteja bloqueando um
-- caminho legítimo inesperado.
DROP TRIGGER IF EXISTS trg_prevent_trial_tampering ON public.estudios;
DROP FUNCTION IF EXISTS public.prevent_trial_tampering();
