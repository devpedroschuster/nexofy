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
      ordem,
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
      coalesce((x->>'periodo_fim')::date, (x->>'data_vencimento')::date) as periodo_fim
    from jsonb_array_elements(p_mensalidades) with ordinality as arr(x, ordem)
  ),
  -- Marca linhas duplicadas dentro do próprio lote (mesma chave de conflito
  -- aparecendo mais de uma vez no payload) para não tentar inserir 2x a
  -- mesma linha na mesma instrução — mantém só a primeira ocorrência,
  -- as demais já nascem "não inserida" sem precisar tocar o banco.
  entrada_dedup as (
    select *,
      row_number() over (
        partition by estudio_id, aluno_id, plano_id, data_vencimento
        order by ordem
      ) as ocorrencia
    from entrada
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
    from entrada_dedup e
    where e.ocorrencia = 1
    on conflict (estudio_id, aluno_id, plano_id, data_vencimento) where tipo_aula = 'regular'
    do nothing
    returning mensalidades.estudio_id, mensalidades.aluno_id, mensalidades.plano_id, mensalidades.data_vencimento
  )
  select
    e.aluno_id as out_aluno_id,
    (e.ocorrencia = 1 and exists (
      select 1 from inseridas i
      where i.estudio_id = e.estudio_id and i.aluno_id = e.aluno_id
        and i.plano_id = e.plano_id and i.data_vencimento = e.data_vencimento
    )) as out_inserida
  from entrada_dedup e
  order by e.ordem;
end;
$$;

comment on function public.inserir_mensalidades_regulares_idempotente is
  'PED-16: insere mensalidades regulares em lote com ON CONFLICT DO NOTHING por linha (evita que 1 colisão derrube o lote todo), preenche periodo_fim=data_vencimento por padrão, e dedupe defensivo intra-lote via ordinalidade. Uso restrito à edge function gerar-mensalidades (service_role).';

revoke all on function public.inserir_mensalidades_regulares_idempotente(jsonb) from public, anon, authenticated;
grant execute on function public.inserir_mensalidades_regulares_idempotente(jsonb) to service_role;

