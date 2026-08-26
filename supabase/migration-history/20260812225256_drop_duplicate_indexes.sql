-- estudio_membros_user_id_idx e idx_estudio_membros_user_id são idênticos -> mantém o primeiro
DROP INDEX IF EXISTS public.idx_estudio_membros_user_id;
-- estudios_slug_key e estudios_slug_unique são duas UNIQUE constraints idênticas -> mantém estudios_slug_key
ALTER TABLE public.estudios DROP CONSTRAINT IF EXISTS estudios_slug_unique;
