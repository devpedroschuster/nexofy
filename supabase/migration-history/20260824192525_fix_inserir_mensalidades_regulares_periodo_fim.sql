drop function if exists public.inserir_mensalidades_regulares_idempotente(jsonb);

create function public.inserir_mensalidades_regulares_idempotente(
  p_mensalidades jsonb
)
returns table (out_aluno_id bigint, out_inserida boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with entrada as (
    select
      (x->>'estudio_id')::uuid          as estudio_id,
      (x->>'aluno_id')::bigint          as aluno_id,
      (x->>'plano_id')::integer         as plano_id,
      (x->>'data_vencimento')::date     as data_vencimento,
      (x->>'status')::text              as status,
      (x->>'tipo_aula')::text           as tipo_aula,
      (x->>'valor_pago')::numeric       as valor_pago,
      coalesce((x->>'desconto_aplicado')::numeric, 0) as desconto_aplicado,
      coalesce((x->>'multa_aplicada')::numeric, 0)    as multa_aplicada,
      coalesce((x->>'juros_aplicados')::numeric, 0)   as juros_aplicados,
      -- periodo_fim é NOT NULL desde a migration cobertura_pagamento_periodo.
      -- Na criação da pendência (antes de qualquer cobrança Asaas), o
      -- período cobre só o próprio mês — mesma convenção usada por
      -- criar-cobranca-asaas.calcularPeriodoFim quando cobre_periodo_completo
      -- é false/ausente. A expansão para múltiplos meses só acontece depois,
      -- no UPDATE feito por criar-cobranca-asaas quando o operador escolhe
      -- cobrar o período completo do plano.
      coalesce((x->>'periodo_fim')::date, (x->>'data_vencimento')::date) as periodo_fim
    from jsonb_array_elements(p_mensalidades) as x
  ),
  inseridas as (
    insert into public.mensalidades (
      estudio_id, aluno_id, plano_id, data_vencimento, status,
      tipo_aula, valor_pago, desconto_aplicado, multa_aplicada, juros_aplicados,
      periodo_fim
    )
    select
      e.estudio_id, e.aluno_id, e.plano_id, e.data_vencimento, e.status,
      e.tipo_aula, e.valor_pago, e.desconto_aplicado, e.multa_aplicada, e.juros_aplicados,
      e.periodo_fim
    from entrada e
    on conflict (estudio_id, aluno_id, plano_id, data_vencimento) where tipo_aula = 'regular'
    do nothing
    returning mensalidades.aluno_id
  )
  select e.aluno_id as out_aluno_id, (e.aluno_id in (select i.aluno_id from inseridas i)) as out_inserida
  from entrada e;
end;
$$;

comment on function public.inserir_mensalidades_regulares_idempotente is
  'PED-16: insere mensalidades regulares em lote com ON CONFLICT DO NOTHING por linha (evita que 1 colisão derrube o lote todo) e preenche periodo_fim=data_vencimento por padrão (coluna NOT NULL desde cobertura_pagamento_periodo). Uso restrito à edge function gerar-mensalidades (service_role).';

revoke all on function public.inserir_mensalidades_regulares_idempotente(jsonb) from public, anon, authenticated;
grant execute on function public.inserir_mensalidades_regulares_idempotente(jsonb) to service_role;

