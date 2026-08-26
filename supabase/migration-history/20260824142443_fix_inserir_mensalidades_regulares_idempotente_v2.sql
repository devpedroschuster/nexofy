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
      coalesce((x->>'juros_aplicados')::numeric, 0)   as juros_aplicados
    from jsonb_array_elements(p_mensalidades) as x
  ),
  inseridas as (
    insert into public.mensalidades (
      estudio_id, aluno_id, plano_id, data_vencimento, status,
      tipo_aula, valor_pago, desconto_aplicado, multa_aplicada, juros_aplicados
    )
    select
      e.estudio_id, e.aluno_id, e.plano_id, e.data_vencimento, e.status,
      e.tipo_aula, e.valor_pago, e.desconto_aplicado, e.multa_aplicada, e.juros_aplicados
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
  'PED-16: insere mensalidades regulares em lote com ON CONFLICT DO NOTHING por linha, evitando que uma colisão de idempotência derrube o lote inteiro. Uso restrito à edge function gerar-mensalidades (service_role).';

revoke all on function public.inserir_mensalidades_regulares_idempotente(jsonb) from public, anon, authenticated;
grant execute on function public.inserir_mensalidades_regulares_idempotente(jsonb) to service_role;

