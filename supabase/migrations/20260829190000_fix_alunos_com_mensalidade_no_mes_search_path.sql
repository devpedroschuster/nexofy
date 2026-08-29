-- PED-79: o Supabase security advisor (get_advisors, lint
-- 0011_function_search_path_mutable) aponta que
-- public.alunos_com_mensalidade_no_mes não tem search_path fixado —
-- diferente das demais functions capturadas no mesmo lote
-- (20260827141042_capture_missing_functions.sql /
-- 20260829180000_normalize_crlf_in_captured_functions.sql), que quase
-- todas têm SET search_path TO 'public'.
--
-- A function não é SECURITY DEFINER (roda com privilégios de quem chama),
-- então o risco de search_path hijacking é menor do que numa SECURITY
-- DEFINER, mas um search_path mutável ainda permite que a resolução de
-- identificadores não qualificados (estudio_membros, mensalidades,
-- eh_super_admin()) seja sequestrada se o search_path da sessão for
-- alterado antes da chamada.
--
-- Confirmado sem drift entre staging (qjmybxkfjkxttggdjxga) e produção
-- (tciiepqmnrrcjnqhspvw) antes desta migration — mesma definição nos dois
-- ambientes. Aplicada em ambos. Comportamento inalterado (mesma lógica,
-- só o search_path da function fica fixo).

CREATE OR REPLACE FUNCTION public.alunos_com_mensalidade_no_mes(p_estudio_id uuid, p_data_referencia date)
 RETURNS TABLE(aluno_id bigint)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if p_estudio_id is null then
    raise exception 'p_estudio_id é obrigatório.';
  end if;

  if auth.role() <> 'service_role' then
    if not (
      eh_super_admin()
      or exists (
        select 1 from estudio_membros
        where user_id = auth.uid()
          and estudio_id = p_estudio_id
      )
    ) then
      raise exception 'Acesso negado: você não pertence a este estúdio.' using errcode = '42501';
    end if;
  end if;

  return query
  select distinct m.aluno_id
  from mensalidades m
  where m.estudio_id = p_estudio_id
    and m.data_vencimento <= (date_trunc('month', p_data_referencia) + interval '1 month - 1 day')::date
    and m.periodo_fim >= date_trunc('month', p_data_referencia)::date;
end;
$function$
;
