-- PED-16: fecha a race condition de gerar-mensalidades.
-- O fluxo antigo era SELECT (quem já tem mensalidade) -> INSERT em lote.
-- Duas invocações concorrentes (cron duplicado / retry manual durante o
-- cron) podem ambas passar pelo SELECT antes de qualquer INSERT e tentar
-- inserir os mesmos alunos. O índice único parcial mensalidades_lote_unico
-- (estudio_id, aluno_id, plano_id, data_vencimento) WHERE tipo_aula='regular'
-- já impede a duplicata no banco — mas como o INSERT era um único statement
-- multi-linha, uma violação de constraint em 1 aluno derrubava a inserção
-- de TODOS os alunos do lote (erro 500, nenhuma mensalidade gerada naquele
-- estúdio no mês, mesmo para quem não tinha conflito nenhum).
--
-- Esta RPC insere linha a linha via INSERT ... SELECT ... ON CONFLICT
-- DO NOTHING, batendo exatamente no predicado do índice parcial acima.
-- Cada linha é resolvida independentemente: quem colide é ignorado, quem
-- não colide é inserido, numa única operação atômica e sem depender de
-- um SELECT anterior pra decidir o que inserir.
create or replace function public.inserir_mensalidades_regulares_idempotente(
  p_mensalidades jsonb
)
returns table (aluno_id bigint, inserida boolean)
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
    -- só faz sentido casar com o índice parcial quando tipo_aula='regular',
    -- que é o único caso desta função (gerar-mensalidades sempre envia isso)
    on conflict (estudio_id, aluno_id, plano_id, data_vencimento) where tipo_aula = 'regular'
    do nothing
    returning mensalidades.aluno_id
  )
  select e.aluno_id, (e.aluno_id in (select i.aluno_id from inseridas i)) as inserida
  from entrada e;
end;
$$;

comment on function public.inserir_mensalidades_regulares_idempotente is
  'PED-16: insere mensalidades regulares em lote com ON CONFLICT DO NOTHING por linha, evitando que uma colisão de idempotência derrube o lote inteiro. Uso restrito à edge function gerar-mensalidades (service_role).';

revoke all on function public.inserir_mensalidades_regulares_idempotente(jsonb) from public, anon, authenticated;
grant execute on function public.inserir_mensalidades_regulares_idempotente(jsonb) to service_role;

