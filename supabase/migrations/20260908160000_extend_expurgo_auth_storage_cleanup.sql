-- supabase/migrations/20260908160000_extend_expurgo_auth_storage_cleanup.sql
--
-- Fast-follows de PED-176, deixados fora de propósito do escopo original
-- (ver 20260908130000_add_retencao_lgpd_estudios.sql):
--
-- PED-181 — a rotina anonimizava dados de negócio (alunos/professores) mas
-- nunca tocava a conta `auth.users` ligada via auth_id. Ficou fora porque a
-- mesma pessoa pode ser aluna em vários estúdios com a mesma conta — apagar
-- a conta ao anonimizar UM estúdio cancelado quebraria o acesso dela nos
-- outros. Resolvido aqui em duas etapas: (1) sempre desvincula (auth_id =
-- null) as linhas do estúdio que está sendo anonimizado — o dado de
-- negócio já virou null, a referência não serve mais pra nada; (2) só
-- depois verifica, olhando o sistema inteiro, se aquele auth_id ainda tem
-- QUALQUER vínculo ativo (aluno/professor/estudio_membros de outro estúdio
-- ainda não anonimizado) — se não tiver, marca pra a Edge Function apagar
-- via Admin API (supabase.auth.admin.deleteUser), não por DELETE SQL direto
-- em auth.users: só a Admin API garante a limpeza correta de sessions/
-- refresh_tokens/identities internos do GoTrue.
--
-- PED-182 — a rotina zerava avatar_url/link_anamnese/comprovante_url só na
-- linha do banco, nunca apagava o arquivo correspondente no Storage
-- (ficava órfão no bucket). Resolvido guardando o path ANTES de zerar a
-- coluna (mesma função, via extrair_objeto_storage) e devolvendo a lista
-- pra Edge Function apagar do bucket depois do commit da transação —
-- limpeza de Storage não é transacional junto com o Postgres, então roda
-- best-effort fora da function.
--
-- De propósito também fecha uma lacuna que PED-182 expôs: `fechamento_comissoes`
-- (comprovante_url) nunca era tocado por esta rotina — não porque a decisão
-- fosse deixá-lo de fora, mas porque foi esquecido no escopo original de
-- PED-176 (a tabela guarda dado financeiro de professor, mesma categoria de
-- mensalidades/estudio_dados_asaas, que já eram anonimizados). Corrigido
-- aqui, na mesma function.
--
-- Também redige (não recria) `audit_log.dados_antigos`/`dados_novos` do
-- estúdio anonimizado — sem isso, o audit trail de PED-174 manteria PII
-- completa indefinidamente, contradizendo o próprio propósito desta rotina
-- de retenção. O metadado de accountability (quem/quando/tabela/operação)
-- é preservado; só o snapshot de dado é redigido.

-- Extrai {bucket, path} de uma URL pública de Supabase Storage do próprio
-- projeto (padrão `.../storage/v1/object/public/<bucket>/<path>`). Retorna
-- null pra qualquer URL que não bata com o padrão (ex.: link externo colado
-- manualmente pelo estúdio) — nesse caso não há nada no NOSSO Storage pra
-- limpar.
create or replace function public.extrair_objeto_storage(p_url text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_match text[];
begin
  if p_url is null or p_url = '' then
    return null;
  end if;

  v_match := regexp_match(p_url, '/storage/v1/object/public/([^/]+)/(.+)$');

  if v_match is null then
    return null;
  end if;

  return jsonb_build_object('bucket', v_match[1], 'path', v_match[2]);
end;
$$;

revoke execute on function public.extrair_objeto_storage(text)
  from public, anon, authenticated;

-- Um auth_id "tem vínculo pessoal ativo" quando aparece em aluno/professor/
-- estudio_membros de QUALQUER outro estúdio que ainda não foi anonimizado
-- (estudios.anonimizado_em is null cobre tanto estúdio ativo quanto
-- cancelado-mas-ainda-dentro-do-prazo-de-retenção). p_estudio_id_excluir
-- existe por clareza/defesa em profundidade: no momento em que esta função
-- é chamada pela rotina de expurgo, as linhas do próprio estúdio anonimizado
-- já tiveram auth_id zerado, então o filtro já seria implícito — mas não
-- custa deixar explícito caso a ordem de chamadas mude no futuro.
create or replace function public.tem_vinculo_pessoal_ativo(p_auth_id uuid, p_estudio_id_excluir uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.alunos a
    join public.estudios e on e.id = a.estudio_id
    where a.auth_id = p_auth_id
      and a.estudio_id <> p_estudio_id_excluir
      and e.anonimizado_em is null
  ) or exists (
    select 1
    from public.professores p
    join public.estudios e on e.id = p.estudio_id
    where p.auth_id = p_auth_id
      and p.estudio_id <> p_estudio_id_excluir
      and e.anonimizado_em is null
  ) or exists (
    select 1
    from public.estudio_membros m
    join public.estudios e on e.id = m.estudio_id
    where m.user_id = p_auth_id
      and m.estudio_id <> p_estudio_id_excluir
      and e.anonimizado_em is null
  );
$$;

revoke execute on function public.tem_vinculo_pessoal_ativo(uuid, uuid)
  from public, anon, authenticated;

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
