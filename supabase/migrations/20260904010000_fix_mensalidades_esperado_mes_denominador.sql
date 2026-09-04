-- supabase/migrations/20260904010000_fix_mensalidades_esperado_mes_denominador.sql
--
-- PED-148 — mensalidades_geradas_vs_esperado_mes() calcula "esperado" como
-- todo aluno ativo com plano pago, sem olhar se ele já está coberto por um
-- pagamento anterior. Isso deixa o card "Mensalidades do mês" (SuperAdmin)
-- permanentemente quebrado pra qualquer estúdio com planos trimestral/
-- semestral/anual: em produção hoje mostra 40/61 (~66%) num mês
-- perfeitamente saudável — a "falta" de 21 é inteiramente artefato do
-- denominador (cron rodou com sucesso, ver PED-148).
--
-- NÃO é `duracao_meses` (investigado e descartado): a sugestão original do
-- ticket era filtrar `esperado` por `planos.duracao_meses = 1`, mas isso
-- está errado — confirmado lendo matricular_aluno()/renovar_plano_aluno()
-- (20260902140000_fix_mensalidades_periodo_fim_missing_functions.sql):
-- toda mensalidade automática (matrícula, renovação, cron) grava
-- periodo_fim = data_vencimento, ou seja, cobre só 1 mês, INDEPENDENTE da
-- duração do plano. O que de fato suspende a cobrança mensal de um aluno
-- de plano multi-mês é um pagamento manual "à vista" (ver
-- financeiroService.calcularPeriodoFim / ModalAdicionarPagamentoManual.jsx),
-- que grava periodo_fim = data_vencimento + (duracao_meses - 1) meses. Um
-- filtro por duracao_meses=1 teria o efeito oposto ao pretendido: planos
-- multi-mês sem pagamento à vista continuam gerando mensalidade todo mês, e
-- excluí-los do denominador levaria o card de ~66% pra >100% (gerado maior
-- que esperado) em vez de resolver. Verificado direto em produção: com a
-- regra de cobertura abaixo (não com duracao_meses), os 4 grupos de
-- duracao_meses batem 3/3, 5/5, 3/3 e ~28/27 — a mesma quebra por grupo já
-- levantada na investigação do ticket.
--
-- FIX 1 (denominador por cobertura, não por duração): `esperado` agora usa
-- a MESMA regra de cobertura que o cron usa pra decidir quem cobrar
-- (alunos_com_mensalidade_no_mes, capturada em
-- 20260827141042_capture_missing_functions.sql) — exclui quem já tem uma
-- mensalidade de um mês ANTERIOR cujo periodo_fim alcança o mês corrente.
-- Restrito a `m.data_vencimento < início deste mês` (não "<=") de
-- propósito: a mensalidade que o cron gerou ESTE mês não pode ser usada
-- pra excluir o próprio aluno do denominador — isso tornaria a métrica
-- circular (sempre N/N, mesmo se o cron tivesse rodado errado).
--
-- FIX 2 (congela o cadastro considerado, PED-148 item 2): `esperado` era
-- calculado sobre o cadastro de HOJE, enquanto `gerado` reflete o cadastro
-- do dia 1 (quando o cron rodou, `0 8 1 * *` America/Sao_Paulo — ver
-- CRON_SCHEDULE em supabase/functions/gerar-mensalidades/index.ts). Todo
-- aluno matriculado depois do dia 1 inflava `esperado` até o mês seguinte,
-- sem nunca poder aparecer em `gerado` (o cron já passou). `esperado` agora
-- só considera alunos cadastrados antes do instante em que o cron deste mês
-- rodou (dia 1, 08:00 BRT). Um aluno matriculado DEPOIS desse corte ainda
-- pode aparecer em `gerado` (matricular_aluno já insere a primeira
-- mensalidade na hora) sem estar em `esperado` — o card pode passar de
-- ~100% em vez de travar em menos; aceito, é sinal real (matrícula nova no
-- meio do ciclo), não um bug de métrica.

CREATE OR REPLACE FUNCTION public.mensalidades_geradas_vs_esperado_mes()
RETURNS TABLE(esperado bigint, gerado bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_inicio_mes date := date_trunc('month', current_date)::date;
  -- Dia 1 do mês corrente, 08:00 América/São Paulo — mesmo instante do
  -- CRON_SCHEDULE de gerar-mensalidades/index.ts (`0 8 1 * *`,
  -- America/Sao_Paulo). Só congela o cadastro considerado em `esperado`;
  -- `gerado` continua trabalhando só com datas (colunas date, sem hora).
  v_corte_cadastro timestamptz :=
    (v_inicio_mes::timestamp + time '08:00') at time zone 'America/Sao_Paulo';
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
        and a.created_at < v_corte_cadastro
        and not exists (
          select 1
          from mensalidades m
          where m.aluno_id = a.id
            and m.estudio_id = a.estudio_id
            and m.data_vencimento < v_inicio_mes
            and m.periodo_fim >= v_inicio_mes
        )
    ) as esperado,
    (
      select count(*)
      from mensalidades m
      where m.tipo_aula = 'regular'
        and date_trunc('month', m.data_vencimento) = date_trunc('month', current_date)
    ) as gerado;
end;
$function$;
