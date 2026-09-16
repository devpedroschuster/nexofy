-- supabase/migrations/20260915220000_fix_anonimizar_dados_estudio_cancelado_drift.sql
--
-- PED-191: CI "Supabase DB Diff (staging)" falhava em toda PR com um diff
-- inteiro de `CREATE OR REPLACE FUNCTION public.anonimizar_dados_estudio_cancelado`,
-- mesmo em PRs sem nenhuma mudança em supabase/. Causa raiz confirmada via
-- MCP do Supabase (comparando md5(prosrc) e checando ausência de `--` no
-- corpo armazenado, já que PL/pgSQL guarda o corpo da function verbatim em
-- pg_proc.prosrc): tanto staging quanto produção têm aplicada uma versão
-- da function SEM os comentários explicativos internos (bloco
-- "snapshot antes de qualquer update" / PED-181 / PED-182 / "redige... audit_log")
-- que já estão no arquivo 20260908160000_extend_expurgo_auth_storage_cleanup.sql
-- deste repositório desde que foi commitado. A lógica em si é idêntica nos
-- dois lados — só o texto-fonte (comentários) diverge, o suficiente pro
-- `supabase db diff` (que compara prosrc literal, não só comportamento)
-- acusar drift. Ambos os ambientes receberam a function original via MCP
-- antes do arquivo de migration ser finalizado com a documentação inline.
--
-- Reconciliação: reaplica aqui, verbatim, a MESMA definição já presente em
-- 20260908160000_extend_expurgo_auth_storage_cleanup.sql (CREATE OR REPLACE
-- é idempotente — não muda nenhum comportamento, só sincroniza o texto-fonte
-- armazenado no catálogo com o que já está commitado no repo).
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
  v_fechamentos integer;
  v_urls text[];
  v_arquivos jsonb;
  v_auth_ids uuid[];
  v_auth_ids_remover uuid[] := '{}';
  v_auth_id uuid;
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

  -- Snapshot ANTES de qualquer update: auth_ids ligados a este estúdio
  -- (PED-181) e URLs candidatas a objeto de Storage (PED-182). Precisa vir
  -- antes porque os updates abaixo zeram exatamente essas colunas.
  select coalesce(array_agg(distinct auth_id), '{}')
  into v_auth_ids
  from (
    select auth_id from alunos where estudio_id = p_estudio_id and auth_id is not null
    union
    select auth_id from professores where estudio_id = p_estudio_id and auth_id is not null
  ) t;

  select coalesce(array_agg(v) filter (where v is not null and v <> ''), '{}')
  into v_urls
  from (
    select avatar_url as v from alunos where estudio_id = p_estudio_id
    union all
    select link_anamnese from alunos where estudio_id = p_estudio_id
    union all
    select comprovante_url from fechamento_comissoes where estudio_id = p_estudio_id
  ) t;

  select coalesce(jsonb_agg(obj), '[]'::jsonb)
  into v_arquivos
  from (
    select public.extrair_objeto_storage(u) as obj
    from unnest(v_urls) as u
  ) t
  where obj is not null;

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
    metadata = '{}'::jsonb,
    auth_id = null
  where estudio_id = p_estudio_id;
  get diagnostics v_alunos = row_count;

  update professores set
    nome = v_placeholder,
    email = null,
    telefone = null,
    pix_comissao = null,
    auth_id = null
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

  update fechamento_comissoes set
    comprovante_url = null
  where estudio_id = p_estudio_id;
  get diagnostics v_fechamentos = row_count;

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

  -- Redige (não apaga a linha) o snapshot de PII já guardado em audit_log
  -- para este estúdio — preserva quem/quando/tabela/operação, remove o
  -- dado em si (ver comentário no topo do arquivo).
  update audit_log set
    dados_antigos = null,
    dados_novos = null
  where estudio_id = p_estudio_id
    and (dados_antigos is not null or dados_novos is not null);

  -- PED-181: só agora (depois de já ter zerado o auth_id das próprias
  -- linhas deste estúdio, e já ter marcado este estúdio como anonimizado)
  -- verifica quais dos auth_ids capturados no snapshot ficaram órfãos —
  -- sem NENHUM vínculo ativo em outro estúdio.
  if array_length(v_auth_ids, 1) is not null then
    foreach v_auth_id in array v_auth_ids loop
      if not public.tem_vinculo_pessoal_ativo(v_auth_id, p_estudio_id) then
        v_auth_ids_remover := array_append(v_auth_ids_remover, v_auth_id);
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'skipped', false,
    'alunos_anonimizados', v_alunos,
    'professores_anonimizados', v_professores,
    'mensalidades_anonimizadas', v_mensalidades,
    'fechamentos_anonimizados', v_fechamentos,
    'leads_removidos', v_leads,
    'arquivos_storage_a_remover', v_arquivos,
    'auth_ids_a_remover', to_jsonb(v_auth_ids_remover)
  );
end;
$function$;

revoke execute on function public.anonimizar_dados_estudio_cancelado(uuid, timestamptz)
  from public, anon, authenticated;
