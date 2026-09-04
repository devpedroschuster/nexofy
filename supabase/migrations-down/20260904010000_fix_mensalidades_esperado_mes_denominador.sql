-- Reverte 20260904010000_fix_mensalidades_esperado_mes_denominador.sql:
-- volta mensalidades_geradas_vs_esperado_mes() ao denominador antigo
-- ("esperado" = todo aluno ativo com plano pago, sem excluir quem já está
-- coberto por mensalidade anterior, sem congelar o cadastro no corte do
-- cron) — reintroduz o card "Mensalidades do mês" quebrado (PED-148) para
-- qualquer estúdio com planos trimestral/semestral/anual.
CREATE OR REPLACE FUNCTION public.mensalidades_geradas_vs_esperado_mes()
RETURNS TABLE(esperado bigint, gerado bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not eh_super_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  return query
  select
    (
      select count(*)
      from alunos a
      join planos p on p.id = a.plano_id
      where a.ativo = true
        and a.plano_id is not null
        and p.preco > 0
    ) as esperado,
    (
      select count(*)
      from mensalidades m
      where m.tipo_aula = 'regular'
        and date_trunc('month', m.data_vencimento) = date_trunc('month', current_date)
    ) as gerado;
end;
$function$;
