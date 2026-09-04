-- PED-160 — dois fixes em matricular_aluno(), achados investigando o
-- ticket ("aluno cancela e reassina em plano diferente no mesmo mês pode
-- gerar 2 mensalidades").
--
-- FIX 1 (achado durante a investigação, não é o bug do ticket): confirmado
-- via pg_get_functiondef direto em staging E produção que a versão
-- REALMENTE em execução nos dois bancos nunca incluiu `periodo_fim` no
-- INSERT em mensalidades, apesar de o arquivo local
-- 20260903020000_fix_matricular_aluno_super_admin.sql (aplicado segundo
-- list_migrations nos dois ambientes) já ter essa coluna. A migration
-- rodou, mas com um corpo de função sem periodo_fim — drift entre o que
-- está no repo e o que foi de fato aplicado. Como periodo_fim é NOT NULL
-- desde cobertura_pagamento_periodo (2026-08-22), TODA chamada real de
-- matricular_aluno (aluno novo com plano, ou reassinatura) vem falhando
-- com "null value in column periodo_fim of relation mensalidades" desde
-- então — incidente real em produção, não só teórico. Reaplica
-- periodo_fim = data_vencimento (mesma convenção do cron e de
-- inserir_mensalidades_regulares_idempotente: cobre só o mês da própria
-- cobrança).
--
-- FIX 2 (o bug do ticket): alunosService.alterarStatus ("cancelar
-- matrícula") só faz `UPDATE alunos SET ativo=false` — nunca mexe em
-- mensalidades já geradas. Se o aluno reassina no mesmo mês (mesmo plano
-- ou outro) via matricular_aluno, o INSERT em mensalidades daqui sempre
-- foi direto, sem checar duplicidade de período — o único guard é o
-- índice único mensalidades_lote_unico (estudio_id, aluno_id, plano_id,
-- data_vencimento), que não pega quando plano_id OU data_vencimento
-- mudam (exatamente este caso: plano novo, ou mesma data mas outro dia
-- escolhido no formulário). alunos_com_mensalidade_no_mes(), que já
-- resolve isso corretamente pro fluxo automático do cron
-- (gerar-mensalidades/index.ts), nunca foi usada aqui.
--
-- Regra de negócio decidida: mensalidade 'pendente' 'regular' do mesmo
-- aluno cobrindo o mesmo mês do novo vencimento é cancelada
-- automaticamente antes de inserir a nova — nunca duplica cobrança, não
-- bloqueia o admin. Mensalidade já 'pago' não é tocada — dinheiro já
-- recebido não é estornado automaticamente aqui (ver Financeiro.jsx e
-- AreaAluno.jsx, ajustados no mesmo PR pra tratar status='cancelado'
-- corretamente em vez de cair no fallback 'pendente'/'atrasado').
CREATE OR REPLACE FUNCTION public.matricular_aluno(p_aluno_id bigint, p_plano_id integer, p_modalidades jsonb, p_data_inicio date, p_data_fim date, p_valor_pago numeric, p_vencimento date, p_descricao text, p_estudio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tipo_aula text;
  v_admin_ok boolean;
begin
  if p_estudio_id is null then
    raise exception 'p_estudio_id é obrigatório.';
  end if;

  select
    public.eh_super_admin()
    or exists (
      select 1 from estudio_membros
      where user_id = auth.uid() and estudio_id = p_estudio_id and role = 'admin'
    )
  into v_admin_ok;

  if not v_admin_ok then
    raise exception 'Acesso negado: você não é admin deste estúdio.';
  end if;

  if not exists (select 1 from alunos where id = p_aluno_id and estudio_id = p_estudio_id) then
    raise exception 'Aluno não pertence a este estúdio.';
  end if;

  if not exists (select 1 from planos where id = p_plano_id and estudio_id = p_estudio_id) then
    raise exception 'Plano não pertence a este estúdio.';
  end if;

  select case when is_plano_livre then 'plano_livre' else 'regular' end
    into v_tipo_aula
    from planos where id = p_plano_id;

  update alunos
     set plano_id = p_plano_id,
         modalidades_selecionadas = (
           select coalesce(array_agg(m::uuid), '{}'::uuid[])
           from jsonb_array_elements_text(coalesce(p_modalidades, '[]'::jsonb)) as m
         ),
         ativo = true,
         data_inicio_plano = p_data_inicio,
         data_fim_plano = p_data_fim
   where id = p_aluno_id and estudio_id = p_estudio_id;

  update historico_planos
     set status = 'finalizado'
   where aluno_id = p_aluno_id and estudio_id = p_estudio_id and status = 'ativo';

  insert into historico_planos (aluno_id, plano_id, estudio_id, data_inicio, data_fim, status, valor_pago)
  values (p_aluno_id, p_plano_id, p_estudio_id, p_data_inicio, p_data_fim, 'ativo', p_valor_pago);

  update mensalidades
     set status = 'cancelado'
   where aluno_id = p_aluno_id
     and estudio_id = p_estudio_id
     and tipo_aula = 'regular'
     and status = 'pendente'
     and data_vencimento < (date_trunc('month', p_vencimento) + interval '1 month')::date
     and periodo_fim >= date_trunc('month', p_vencimento)::date;

  insert into mensalidades (aluno_id, plano_id, estudio_id, data_vencimento, periodo_fim, status, descricao, tipo_aula)
  values (p_aluno_id, p_plano_id, p_estudio_id, p_vencimento, p_vencimento, 'pendente', p_descricao, v_tipo_aula);
end;
$function$
;
