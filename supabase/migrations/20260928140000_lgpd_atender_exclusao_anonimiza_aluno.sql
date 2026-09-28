-- supabase/migrations/20260928140000_lgpd_atender_exclusao_anonimiza_aluno.sql
--
-- PED-261 (LGPD art. 18 VI): "Marcar como atendida" num pedido de exclusão
-- só fazia UPDATE de status em solicitacoes_titular — nenhum dado do aluno
-- era de fato eliminado, e a UI não coletava nem exibia quem tratou/por quê.
--
-- Decisão de produto: atender um pedido de exclusão ANONIMIZA o aluno (não
-- apaga a linha). Mensalidades/presenças/histórico de planos continuam
-- existindo sem identificação — obrigação legal/fiscal do estúdio (art. 16
-- I) e integridade dos relatórios financeiros e de repasse. Mesma regra de
-- colunas de anonimizar_dados_estudio_cancelado (expurgo de estúdio
-- cancelado), aplicada a UM aluno de um estúdio ativo.
--
-- O que esta migration faz:
--   1. solicitacoes_titular vira trilha que sobrevive ao aluno: aluno_id
--      nullable + ON DELETE SET NULL (antes CASCADE: apagar o aluno apagava
--      a própria prova do pedido), e ganha atendido_por_email (snapshot de
--      quem tratou — não há nome de admin em nenhuma tabela pública).
--   2. FKs para auth.users sem ON DELETE passam a SET NULL. Sem isso,
--      auth.admin.deleteUser() da conta do aluno falha com FK violation
--      (solicitado_por do próprio pedido, audit_log.alterado_por de uma
--      edição do próprio perfil, presencas.registrado_por de um check-in),
--      e o mesmo vale pro expurgo de estúdio cancelado (PED-181).
--   3. Trigger em solicitacoes_titular: carimba atendido_por/atendido_em/
--      atendido_por_email no servidor (não confia no client), exige motivo
--      na recusa, torna o registro imutável depois de tratado e impede
--      marcar exclusão como 'atendida' por UPDATE direto — só a RPC abaixo
--      pode, e ela anonimiza de fato.
--   4. RPC atender_solicitacao_exclusao: anonimiza o aluno e marca o pedido
--      atendido na MESMA transação. Devolve os arquivos de Storage e a conta
--      auth a remover — isso exige service role e é feito pela Edge Function
--      atender-solicitacao-exclusao, depois do commit (mesmo desenho do
--      expurgo-retencao-lgpd).

-- 1. Trilha que sobrevive ao aluno ------------------------------------------

alter table public.solicitacoes_titular
  alter column aluno_id drop not null;

alter table public.solicitacoes_titular
  drop constraint solicitacoes_titular_aluno_id_fkey,
  add constraint solicitacoes_titular_aluno_id_fkey
    foreign key (aluno_id) references public.alunos(id) on delete set null;

alter table public.solicitacoes_titular
  add column if not exists atendido_por_email text;

alter table public.alunos
  add column if not exists anonimizado_em timestamptz;

-- 2. FKs para auth.users: SET NULL em vez de bloquear a remoção da conta ----

alter table public.solicitacoes_titular
  drop constraint solicitacoes_titular_solicitado_por_fkey,
  add constraint solicitacoes_titular_solicitado_por_fkey
    foreign key (solicitado_por) references auth.users(id) on delete set null,
  drop constraint solicitacoes_titular_atendido_por_fkey,
  add constraint solicitacoes_titular_atendido_por_fkey
    foreign key (atendido_por) references auth.users(id) on delete set null;

alter table public.audit_log
  drop constraint audit_log_alterado_por_fkey,
  add constraint audit_log_alterado_por_fkey
    foreign key (alterado_por) references auth.users(id) on delete set null;

alter table public.presencas
  drop constraint presenca_registrado_por_fkey,
  add constraint presenca_registrado_por_fkey
    foreign key (registrado_por) references auth.users(id) on delete set null;

alter table public.consentimentos_dados_sensiveis_saude
  drop constraint consentimentos_dados_sensiveis_saude_registrado_por_fkey,
  add constraint consentimentos_dados_sensiveis_saude_registrado_por_fkey
    foreign key (registrado_por) references auth.users(id) on delete set null;

alter table public.consentimentos_responsavel_legal
  drop constraint consentimentos_responsavel_legal_registrado_por_fkey,
  add constraint consentimentos_responsavel_legal_registrado_por_fkey
    foreign key (registrado_por) references auth.users(id) on delete set null;

-- 3. Carimbo e imutabilidade do tratamento ----------------------------------

create or replace function public.carimbar_tratamento_solicitacao_titular()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- UPDATE disparado por ação referencial de FK (ON DELETE SET NULL de
  -- aluno_id/solicitado_por/atendido_por) roda aninhado no trigger de RI —
  -- não é um "tratamento" e precisa passar mesmo com o pedido já fechado.
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Insert vindo de client (aluno, via aluno_cria_propria_solicitacao)
    -- sempre nasce pendente. A Edge Function exportar-dados-aluno insere
    -- com service role (auth.uid() nulo) já como 'atendida' — segue igual.
    if auth.uid() is not null then
      new.status := 'pendente';
      new.observacao := null;
      new.atendido_por := null;
      new.atendido_em := null;
      new.atendido_por_email := null;
      new.solicitado_em := now();
    end if;
    return new;
  end if;

  if old.status <> 'pendente' then
    raise exception 'Esta solicitação já foi tratada (%) e não pode ser alterada.', old.status
      using errcode = 'P0001';
  end if;

  -- Campos de identificação do pedido nunca mudam num tratamento.
  new.aluno_id := old.aluno_id;
  new.estudio_id := old.estudio_id;
  new.tipo := old.tipo;
  new.solicitado_por := old.solicitado_por;
  new.solicitado_em := old.solicitado_em;

  if new.status = 'pendente' then
    return new;
  end if;

  if new.tipo = 'exclusao' and new.status = 'atendida'
     and coalesce(current_setting('nexofy.atendendo_exclusao_titular', true), '') <> 'on' then
    raise exception 'Pedido de exclusão só pode ser atendido pela anonimização do aluno.'
      using errcode = 'P0001';
  end if;

  if new.status = 'recusada' and nullif(btrim(coalesce(new.observacao, '')), '') is null then
    raise exception 'Informe o motivo da recusa.' using errcode = 'P0001';
  end if;

  new.atendido_por := auth.uid();
  new.atendido_em := now();
  new.atendido_por_email := (select u.email from auth.users u where u.id = auth.uid());
  return new;
end;
$$;

revoke execute on function public.carimbar_tratamento_solicitacao_titular()
  from public, anon, authenticated;

drop trigger if exists trg_carimbar_tratamento_solicitacao_titular on public.solicitacoes_titular;
create trigger trg_carimbar_tratamento_solicitacao_titular
  before insert or update on public.solicitacoes_titular
  for each row execute function public.carimbar_tratamento_solicitacao_titular();

-- 4. Atender exclusão = anonimizar ------------------------------------------

create or replace function public.atender_solicitacao_exclusao(
  p_solicitacao_id uuid,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sol public.solicitacoes_titular%rowtype;
  v_aluno public.alunos%rowtype;
  v_pendentes integer;
  v_mensalidade_ids text[];
  v_arquivos jsonb;
  v_auth_id_remover uuid;
begin
  select * into v_sol
  from public.solicitacoes_titular
  where id = p_solicitacao_id
  for update;

  if not found then
    raise exception 'Solicitação não encontrada.' using errcode = 'P0002';
  end if;

  -- Mesmo critério das policies de escrita do tenant: admin do estúdio
  -- atual (super_admin só no estúdio em que está com override ativo).
  if not (v_sol.estudio_id = public.estudio_id_atual() and public.eh_admin_do_estudio_atual()) then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;

  if v_sol.tipo <> 'exclusao' then
    raise exception 'Somente pedidos de exclusão são atendidos por anonimização.' using errcode = 'P0001';
  end if;

  if v_sol.status <> 'pendente' then
    raise exception 'Esta solicitação já foi tratada (%).', v_sol.status using errcode = 'P0001';
  end if;

  select * into v_aluno
  from public.alunos
  where id = v_sol.aluno_id and estudio_id = v_sol.estudio_id
  for update;

  if not found then
    raise exception 'O aluno desta solicitação não existe mais neste estúdio.' using errcode = 'P0002';
  end if;

  -- Cobrança em aberto é vínculo financeiro que o estúdio pode precisar
  -- exercer (art. 16) — não anonimiza no escuro: o admin quita/cancela as
  -- cobranças primeiro, ou recusa o pedido registrando o motivo.
  select count(*) into v_pendentes
  from public.mensalidades
  where aluno_id = v_aluno.id and status = 'pendente';

  if v_pendentes > 0 then
    raise exception 'O aluno possui % mensalidade(s) pendente(s). Quite ou cancele essas cobranças antes de anonimizar, ou recuse o pedido informando o motivo.', v_pendentes
      using errcode = 'P0001';
  end if;

  -- Snapshot ANTES dos updates (eles zeram exatamente essas colunas).
  select coalesce(array_agg(id::text), '{}')
  into v_mensalidade_ids
  from public.mensalidades
  where aluno_id = v_aluno.id;

  select coalesce(jsonb_agg(obj), '[]'::jsonb)
  into v_arquivos
  from (
    select public.extrair_objeto_storage(u) as obj
    from unnest(array[v_aluno.avatar_url, v_aluno.link_anamnese]) as u
  ) t
  where obj is not null;

  -- Vínculo de acesso do aluno a ESTE estúdio.
  if v_aluno.auth_id is not null then
    delete from public.estudio_membros
    where user_id = v_aluno.auth_id
      and estudio_id = v_aluno.estudio_id
      and role = 'aluno';
  end if;

  update public.alunos set
    nome_completo = 'Aluno anonimizado (LGPD)',
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
    auth_id = null,
    ativo = false,
    anonimizado_em = now()
  where id = v_aluno.id;

  update public.mensalidades set
    nome_visitante = null,
    observacoes_pagamento = null,
    descricao = null,
    link_pagamento = null
  where aluno_id = v_aluno.id;

  update public.presencas set observacao = null
  where aluno_id = v_aluno.id and observacao is not null;

  -- Reservas futuras liberam a vaga (o trigger de fila promove quem espera);
  -- o histórico (datas passadas) fica, sem identificação.
  delete from public.presencas where aluno_id = v_aluno.id and data_aula > current_date;
  delete from public.lista_espera where aluno_id = v_aluno.id and data_aula >= current_date;
  delete from public.agenda_fixa where aluno_id = v_aluno.id;

  -- Lead que originou este aluno guarda nome/telefone da mesma pessoa.
  update public.leads set
    nome_visitante = 'Lead anonimizado (LGPD)',
    telefone_visitante = null,
    observacao_lead = null,
    nota_followup = null
  where aluno_convertido_id = v_aluno.id;

  -- Redige o snapshot de PII no audit_log — inclusive as linhas que os
  -- próprios updates acima acabaram de gerar (trigger registrar_audit_log
  -- grava dados_antigos com o cadastro completo). Mantém quem/quando/o quê.
  update public.audit_log set
    dados_antigos = null,
    dados_novos = null
  where estudio_id = v_aluno.estudio_id
    and (
      (tabela = 'alunos' and registro_id = v_aluno.id::text)
      or (tabela = 'mensalidades' and registro_id = any(v_mensalidade_ids))
    )
    and (dados_antigos is not null or dados_novos is not null);

  -- Conta de login só sai se não sobrou NENHUM outro vínculo (outro
  -- cadastro de aluno, professor ou membro em estúdio não anonimizado).
  if v_aluno.auth_id is not null
     and not exists (
       select 1 from public.alunos a
       join public.estudios e on e.id = a.estudio_id
       where a.auth_id = v_aluno.auth_id and e.anonimizado_em is null
     )
     and not exists (
       select 1 from public.professores p
       join public.estudios e on e.id = p.estudio_id
       where p.auth_id = v_aluno.auth_id and e.anonimizado_em is null
     )
     and not exists (
       select 1 from public.estudio_membros m
       join public.estudios e on e.id = m.estudio_id
       where m.user_id = v_aluno.auth_id and e.anonimizado_em is null
     )
  then
    v_auth_id_remover := v_aluno.auth_id;
  end if;

  perform set_config('nexofy.atendendo_exclusao_titular', 'on', true);
  update public.solicitacoes_titular set
    status = 'atendida',
    observacao = nullif(btrim(coalesce(p_observacao, '')), '')
  where id = v_sol.id;
  perform set_config('nexofy.atendendo_exclusao_titular', 'off', true);

  return jsonb_build_object(
    'aluno_id', v_aluno.id,
    'arquivos_storage_a_remover', v_arquivos,
    'auth_id_a_remover', v_auth_id_remover
  );
end;
$$;

revoke execute on function public.atender_solicitacao_exclusao(uuid, text) from public, anon;
grant execute on function public.atender_solicitacao_exclusao(uuid, text) to authenticated;
