-- Reverte 20260902155411_modalidades_nome_unique_por_estudio.sql: volta
-- modalidades.nome à constraint UNIQUE global. CUIDADO: este down FALHA se
-- já existirem 2+ estúidios com o mesmo nome de modalidade cadastrados
-- depois da migration "up" (exatamente o cenário que ela passou a permitir)
-- — checar duplicatas antes:
--   select nome, count(*) from modalidades group by nome having count(*) > 1;
-- e resolver manualmente (renomear) antes de aplicar este down num
-- incidente.
ALTER TABLE public.modalidades DROP CONSTRAINT IF EXISTS modalidades_estudio_id_nome_key;
ALTER TABLE public.modalidades ADD CONSTRAINT modalidades_nome_key UNIQUE (nome);
