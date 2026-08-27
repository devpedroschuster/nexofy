-- supabase/migrations/20260827171659_observabilidade_dashboard_slo.sql
--
-- PED-34 — dashboard de saúde básico no SuperAdmin.
--
-- 1) webhook_events.duracao_ms: tempo (ms) de processamento do webhook de
--    pagamento até o ack, gravado por webhook-pagamento/index.ts só no
--    caminho de sucesso (idempotência/ordem continuam decidindo os
--    retornos antecipados, essa coluna só descreve o caso feliz).
-- 2) mensalidades_geradas_vs_esperado_mes(): compara quantas mensalidades
--    foram geradas este mês contra quantos alunos ativos com plano
--    cobrável existem — mesmo filtro que gerar-mensalidades/index.ts usa
--    pra decidir quem cobrar (ativo=true, plano_id not null, preco > 0).
-- 3) latencia_webhook_pagamento_mes(): p95/média de duracao_ms no mês
--    corrente, usada pelo dashboard e pelo SLO do PED-35 (<5s em 99%).
--
-- Ambas as RPCs seguem o padrão de receita_total_paga() (baseline schema,
-- linha ~1155): STABLE SECURITY DEFINER + gate eh_super_admin(), porque
-- só o SuperAdmin (cross-tenant) deve ver essas métricas, e
-- webhook_events tem "revoke all from anon, authenticated" — sem
-- SECURITY DEFINER a função não conseguiria ler a tabela.

alter table public.webhook_events
  add column duracao_ms integer;

comment on column public.webhook_events.duracao_ms is
  'Tempo (ms) entre o início do handler e a resposta de ack em webhook-pagamento/index.ts. Só gravado no caminho de sucesso (PED-34). Usado pelo dashboard de observabilidade e pelo SLO de latência (PED-35).';

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

CREATE OR REPLACE FUNCTION public.latencia_webhook_pagamento_mes()
RETURNS TABLE(p95_ms numeric, media_ms numeric, amostras bigint)
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
    percentile_cont(0.95) within group (order by duracao_ms)::numeric as p95_ms,
    avg(duracao_ms) as media_ms,
    count(*) as amostras
  from webhook_events
  where duracao_ms is not null
    and date_trunc('month', recebido_em) = date_trunc('month', current_date);
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.mensalidades_geradas_vs_esperado_mes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mensalidades_geradas_vs_esperado_mes() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.latencia_webhook_pagamento_mes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.latencia_webhook_pagamento_mes() TO authenticated;
