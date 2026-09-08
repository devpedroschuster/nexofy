-- supabase/migrations/20260908130000_add_retencao_lgpd_estudios.sql
--
-- PED-176 (achado de auditoria LGPD): não existia nenhuma rotina de
-- expurgo/anonimização automatizada. Estúdios cancelados
-- (estudios.status = 'cancelado', soft delete desde
-- supabase/migration-history/20260812131411_add_status_column_to_estudios.sql)
-- ficavam com todos os dados — inclusive de alunos — retidos
-- indefinidamente, e webhook_events.payload não tinha TTL.
--
-- Prazos (parecer da auditoria): ~5 anos pós-cancelamento pra dado
-- financeiro/fiscal, 12 meses pra payload de webhook. Método: anonimização
-- por redação direta (NULL), preferido a dado fake — mantém contagens e
-- valores agregados como "controle" sem manter dado real do cliente
-- (ver docs/superpowers/specs/2026-09-08-ped176-retencao-lgpd-design.md).
--
-- Estúdios não tinham NENHUM timestamp de quando viraram 'cancelado' — só
-- o status em si. Sem isso não dá pra saber quando o prazo de 5 anos
-- começa a contar. cancelado_em resolve isso via trigger (abaixo).
-- anonimizado_em marca quando o expurgo já rodou pra aquele estúdio
-- (idempotência — a rotina roda todo mês, não pode reprocessar o que já
-- foi anonimizado).
--
-- Estúdios JÁ cancelados hoje (antes desta migration) não têm data real
-- de cancelamento pra recuperar — o backfill abaixo usa now() de
-- propósito, uma escolha conservadora: preferimos começar a contar o
-- prazo agora a arriscar expurgar algo que ainda podia estar dentro do
-- período de retenção real.

alter table public.estudios
  add column cancelado_em timestamptz,
  add column anonimizado_em timestamptz;

update public.estudios
set cancelado_em = now()
where status = 'cancelado'
  and cancelado_em is null;

-- Popula cancelado_em na transição PARA 'cancelado' (e zera se o estúdio
-- for reativado depois — não faz sentido contar prazo de cancelamento de
-- quem voltou a ficar ativo). anonimizado_em também zera nessa transição,
-- pro caso (raro) de um estúdio cancelado/anonimizado no passado, reativado,
-- e cancelado de novo — precisa recontar o prazo do zero.
create or replace function public.set_cancelado_em_estudios()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelado' and old.status <> 'cancelado' then
    new.cancelado_em := now();
    new.anonimizado_em := null;
  elsif old.status = 'cancelado' and new.status <> 'cancelado' then
    new.cancelado_em := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_cancelado_em_estudios on public.estudios;

create trigger trg_set_cancelado_em_estudios
  before update on public.estudios
  for each row execute function public.set_cancelado_em_estudios();

revoke execute on function public.set_cancelado_em_estudios()
  from public, anon, authenticated;

-- Anonimiza os dados identificáveis de UM estúdio cancelado, atomicamente
-- (uma função = uma transação implícita). Rechecagem de elegibilidade
-- DENTRO da function (não confia cegamente em quem chamou) — torna
-- chamadas repetidas/concorrentes seguras: se já não for mais elegível
-- (por exemplo já processado), retorna {skipped: true} sem tocar em nada.
--
-- Uso de placeholder textual em vez de NULL: professores.nome e 8 colunas
-- de estudio_dados_asaas são NOT NULL no schema atual — setar NULL
-- violaria a constraint. O placeholder deixa claro que o dado foi
-- removido sem quebrar a coluna. Todas as outras colunas de PII tocadas
-- aqui são nullable, e usam NULL puro (a preferência do design).
--
-- leads: DELETE, não update — decisão do design (prospect não convertido,
-- sem trilha de consentimento, sem valor de controle). Cascata: FK
-- presenca_lead_id_fkey é ON DELETE CASCADE, então presencas vinculadas a
-- esses leads também são removidas — efeito esperado, não colateral.
create or replace function public.anonimizar_dados_estudio_cancelado(
  p_estudio_id uuid,
  p_data_corte timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_elegivel boolean;
  v_placeholder constant text := '[dado removido - retenção LGPD]';
  v_alunos integer;
  v_professores integer;
  v_mensalidades integer;
  v_leads integer;
begin
  select exists (
    select 1 from estudios
    where id = p_estudio_id
      and status = 'cancelado'
      and cancelado_em is not null
      and cancelado_em < p_data_corte
      and anonimizado_em is null
  ) into v_elegivel;

  if not v_elegivel then
    return jsonb_build_object('skipped', true);
  end if;

  update alunos set
    nome_completo = null,
    email = null,
    telefone = null,
    cpf = null,
    cep = null,
    rua = null,
    numero = null,
    bairro = null,
    cidade = null,
    complemento = null,
    data_nascimento = null,
    contato_emergencia = null,
    link_anamnese = null,
    observacoes_medicas = null,
    avatar_url = null,
    push_token = null,
    asaas_customer_id = null,
    metadata = '{}'::jsonb
  where estudio_id = p_estudio_id;
  get diagnostics v_alunos = row_count;

  update professores set
    nome = v_placeholder,
    email = null,
    telefone = null,
    pix_comissao = null
  where estudio_id = p_estudio_id;
  get diagnostics v_professores = row_count;

  update mensalidades set
    nome_visitante = null,
    observacoes_pagamento = null,
    descricao = null,
    link_pagamento = null,
    asaas_payment_id = null,
    asaas_subscription_id = null,
    idempotency_key = null
  where estudio_id = p_estudio_id;
  get diagnostics v_mensalidades = row_count;

  update estudio_dados_asaas set
    nome_responsavel = v_placeholder,
    email_responsavel = v_placeholder,
    telefone_celular = v_placeholder,
    telefone_fixo = null,
    cnpj = v_placeholder,
    site = null,
    cep = v_placeholder,
    endereco = v_placeholder,
    numero = v_placeholder,
    complemento = null,
    bairro = v_placeholder
  where estudio_id = p_estudio_id;

  delete from leads where estudio_id = p_estudio_id;
  get diagnostics v_leads = row_count;

  update estudios set
    whatsapp = null,
    email = null,
    email_suporte = null,
    asaas_api_key = null,
    anonimizado_em = now()
  where id = p_estudio_id;

  return jsonb_build_object(
    'skipped', false,
    'alunos_anonimizados', v_alunos,
    'professores_anonimizados', v_professores,
    'mensalidades_anonimizadas', v_mensalidades,
    'leads_removidos', v_leads
  );
end;
$function$;

revoke execute on function public.anonimizar_dados_estudio_cancelado(uuid, timestamptz)
  from public, anon, authenticated;

-- Expurga (NULL) o payload de webhook_events mais antigo que p_data_corte,
-- em lotes de p_tamanho_lote — evita segurar um lock longo numa tabela que
-- pode crescer bastante. Mantém id/origem/asaas_payment_id/recebido_em
-- (trilha de auditoria sem o corpo bruto do evento).
create or replace function public.expurgar_webhook_events_antigos(
  p_data_corte timestamptz,
  p_tamanho_lote integer default 500
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total integer := 0;
  v_afetadas integer;
begin
  loop
    update webhook_events
    set payload = null
    where id in (
      select id from webhook_events
      where payload is not null
        and recebido_em < p_data_corte
      limit p_tamanho_lote
    );
    get diagnostics v_afetadas = row_count;
    v_total := v_total + v_afetadas;
    exit when v_afetadas = 0;
  end loop;

  return v_total;
end;
$function$;

revoke execute on function public.expurgar_webhook_events_antigos(timestamptz, integer)
  from public, anon, authenticated;
