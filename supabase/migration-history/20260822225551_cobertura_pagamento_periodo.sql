-- Cobertura de período para pagamentos à vista (Seção 1 — extensão)
--
-- Problema: mensalidades de planos com duracao_meses > 1 pagas à vista
-- (valor cheio numa única linha) desaparecem do Financeiro nos meses
-- seguintes, pois toda leitura hoje filtra por igualdade de mês exato
-- em data_vencimento. Pagamentos parcelados (uma linha por mês, valor =
-- preco mensal) já funcionam corretamente e não são afetados por esta
-- mudança, pois periodo_fim = data_vencimento para eles (sem alterar
-- comportamento).

-- 1. Nova coluna: até quando esta mensalidade cobre o aluno.
--    Default = data_vencimento (equivalente ao comportamento atual: só
--    cobre o próprio mês). Só é diferente para lançamentos à vista.
ALTER TABLE mensalidades
  ADD COLUMN IF NOT EXISTS periodo_fim date;

UPDATE mensalidades
SET periodo_fim = data_vencimento
WHERE periodo_fim IS NULL;

ALTER TABLE mensalidades
  ALTER COLUMN periodo_fim SET NOT NULL,
  ALTER COLUMN periodo_fim SET DEFAULT NULL; -- valor é sempre calculado explicitamente na aplicação, sem default mágico

COMMENT ON COLUMN mensalidades.periodo_fim IS
  'Último dia coberto por este pagamento. Igual a data_vencimento para mensalidades normais/parceladas. Maior que data_vencimento apenas para pagamentos à vista de planos com duracao_meses > 1, cobrindo o período inteiro do plano.';

-- 2. Backfill retroativo dos ~26 registros já identificados como
--    pagamento à vista (valor_pago > 1.2x o preço mensal do plano, em
--    plano com duracao_meses > 1). Critério confirmado com o founder em
--    2026-08-22 e validado contra os dados reais antes de aplicar.
UPDATE mensalidades m
SET periodo_fim = (m.data_vencimento + ((p.duracao_meses - 1) || ' months')::interval)::date
FROM planos p
WHERE m.plano_id = p.id
  AND p.duracao_meses > 1
  AND m.valor_pago IS NOT NULL
  AND m.valor_pago > (p.preco * 1.2);

-- 3. RPC alunos_com_mensalidade_no_mes: trocar igualdade de mês exato por
--    sobreposição de intervalo [data_vencimento, periodo_fim] com o mês
--    de referência. Isso faz o gerar-mensalidades (Edge Function) parar
--    de tentar cobrar de novo alunos já cobertos por um pagamento à
--    vista anterior.
CREATE OR REPLACE FUNCTION public.alunos_com_mensalidade_no_mes(p_estudio_id uuid, p_data_referencia date)
 RETURNS TABLE(aluno_id bigint)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if p_estudio_id is null then
    raise exception 'p_estudio_id é obrigatório.';
  end if;

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

  return query
  select distinct m.aluno_id
  from mensalidades m
  where m.estudio_id = p_estudio_id
    and m.data_vencimento <= (date_trunc('month', p_data_referencia) + interval '1 month - 1 day')::date
    and m.periodo_fim >= date_trunc('month', p_data_referencia)::date;
end;
$function$;
