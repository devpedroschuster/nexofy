-- PED-123: modalidades.nome tinha UNIQUE global (modalidades_nome_key) em
-- vez de por estúdio — dois estúdios diferentes não conseguiam ter uma
-- modalidade com o mesmo nome (ex.: "Yoga"), travando o cadastro logo no
-- primeiro passo do checklist de onboarding (PED-107/108) pra qualquer
-- estúdio novo que escolhesse um nome já usado por outro estúdio.
--
-- Confirmado sem duplicatas (estudio_id, nome) existentes em staging nem em
-- produção antes desta migração — troca segura, sem necessidade de limpar
-- dados primeiro.
ALTER TABLE public.modalidades DROP CONSTRAINT modalidades_nome_key;
ALTER TABLE public.modalidades ADD CONSTRAINT modalidades_estudio_id_nome_key UNIQUE (estudio_id, nome);
