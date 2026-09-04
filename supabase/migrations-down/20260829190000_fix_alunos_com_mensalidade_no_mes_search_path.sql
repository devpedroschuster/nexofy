-- Reverte 20260829190000_fix_alunos_com_mensalidade_no_mes_search_path.sql:
-- remove o SET search_path fixo, voltando a function ao search_path mutável
-- de antes. Não recria o corpo (a lógica não mudou naquela migration, só o
-- search_path) — RESET basta e preserva os GRANTs existentes.
ALTER FUNCTION public.alunos_com_mensalidade_no_mes(uuid, date) RESET search_path;
