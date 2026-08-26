-- "Leitura pública feriados" tinha qual=true, vazando feriados de TODOS os estúdios
-- para qualquer usuário autenticado. tenant_select já cobre o acesso legítimo.
DROP POLICY IF EXISTS "Leitura pública feriados" ON public.feriados;
