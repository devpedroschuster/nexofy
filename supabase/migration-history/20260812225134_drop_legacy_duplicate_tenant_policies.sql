-- Remove as policies ALL legadas que duplicam (e mascaram) as policies granulares tenant_*.
-- Confirmado antes de aplicar: todas as 13 tabelas já têm tenant_select/insert/update/delete
-- cobrindo o mesmo isolamento por estudio_id.
DROP POLICY IF EXISTS "agenda: isolamento por estudio" ON public.agenda;
DROP POLICY IF EXISTS "agenda_excecoes: isolamento por estudio" ON public.agenda_excecoes;
DROP POLICY IF EXISTS "alunos: isolamento por estudio" ON public.alunos;
DROP POLICY IF EXISTS "configuracoes_repasse: isolamento por estudio" ON public.configuracoes_repasse;
DROP POLICY IF EXISTS "despesas: isolamento por estudio" ON public.despesas;
DROP POLICY IF EXISTS "fechamento_comissoes: isolamento por estudio" ON public.fechamento_comissoes;
DROP POLICY IF EXISTS "feriados: isolamento por estudio" ON public.feriados;
DROP POLICY IF EXISTS "historico_planos: isolamento por estudio" ON public.historico_planos;
DROP POLICY IF EXISTS "mensalidades: isolamento por estudio" ON public.mensalidades;
DROP POLICY IF EXISTS "modalidades: isolamento por estudio" ON public.modalidades;
DROP POLICY IF EXISTS "planos: isolamento por estudio" ON public.planos;
DROP POLICY IF EXISTS "professores: isolamento por estudio" ON public.professores;
DROP POLICY IF EXISTS "repasses_lancamentos: isolamento por estudio" ON public.repasses_lancamentos;
