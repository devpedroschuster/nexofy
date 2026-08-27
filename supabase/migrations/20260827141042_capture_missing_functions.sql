-- Captura 38 functions que já existiam no banco de staging mas nunca
-- tinham sido registradas em nenhuma migration (PED-30). Gerado a partir
-- da saída de `supabase db diff --db-url "$STAGING_DB_URL" --schema public`,
-- comparando o schema real de staging contra as migrations existentes —
-- portanto reflete exatamente o que já está em produção/staging hoje,
-- não uma mudança de comportamento. CREATE OR REPLACE é idempotente.

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.fake_bairro(seed bigint)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (array['Centro','Jardim America','Vila Nova','Bela Vista','Sao Jose','Boa Vista','Cidade Alta','Parque Industrial','Vila Rica','Santa Cruz'])[1 + (seed % 10)];
$function$
;

CREATE OR REPLACE FUNCTION public.fake_cep(seed bigint)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select lpad((10000000 + (seed*13 % 89999999))::text, 8, '0');
$function$
;

CREATE OR REPLACE FUNCTION public.fake_cidade(seed bigint)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (array['Sao Paulo','Rio de Janeiro','Belo Horizonte','Curitiba','Porto Alegre','Salvador','Recife','Fortaleza','Campinas','Florianopolis'])[1 + (seed % 10)];
$function$
;

CREATE OR REPLACE FUNCTION public.fake_cnpj(seed bigint)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  base text := lpad(((seed * 104729 + 54321) % 100000000)::text, 8, '0') || '0001';
  d int[];
  w13 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w14 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int; r int; d13 int; d14 int;
  i int;
begin
  for i in 1..12 loop
    d[i] := substring(base from i for 1)::int;
  end loop;
  s := 0;
  for i in 1..12 loop
    s := s + d[i] * w13[i];
  end loop;
  r := s % 11;
  d13 := case when r < 2 then 0 else 11 - r end;
  d[13] := d13;
  s := 0;
  for i in 1..13 loop
    s := s + d[i] * w14[i];
  end loop;
  r := s % 11;
  d14 := case when r < 2 then 0 else 11 - r end;
  return base || d13::text || d14::text;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fake_cpf(seed bigint)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  base text := lpad(((seed * 7919 + 12345) % 1000000000)::text, 9, '0');
  d int[];
  s int; r int; d10 int; d11 int;
  i int;
begin
  for i in 1..9 loop
    d[i] := substring(base from i for 1)::int;
  end loop;
  s := 0;
  for i in 1..9 loop
    s := s + d[i] * (11 - i);
  end loop;
  r := s % 11;
  d10 := case when r < 2 then 0 else 11 - r end;
  d[10] := d10;
  s := 0;
  for i in 1..10 loop
    s := s + d[i] * (12 - i);
  end loop;
  r := s % 11;
  d11 := case when r < 2 then 0 else 11 - r end;
  return base || d10::text || d11::text;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fake_email(seed bigint, prefix text DEFAULT 'user'::text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select prefix || seed::text || '@staging.nexofy.test';
$function$
;

CREATE OR REPLACE FUNCTION public.fake_nome(seed bigint)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (array['Ana','Bruno','Carla','Diego','Elisa','Fabio','Gabriela','Hugo','Isabela','Joao',
                'Karina','Lucas','Marina','Nicolas','Olivia','Pedro','Queila','Rafael','Sofia','Thiago'])[1 + (seed % 20)]
    || ' ' ||
    (array['Silva','Souza','Oliveira','Santos','Pereira','Costa','Rodrigues','Almeida','Nascimento','Lima',
           'Araujo','Fernandes','Carvalho','Gomes','Martins','Rocha','Ribeiro','Alves','Monteiro','Cardoso'])[1 + ((seed/7) % 20)];
$function$
;

CREATE OR REPLACE FUNCTION public.fake_telefone(seed bigint)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select '(' || (11 + (seed % 89))::text || ') 9' || lpad(((seed*3 + 10007) % 100000000)::text, 8, '0');
$function$
;

CREATE OR REPLACE FUNCTION public.agendar_avulso(p_estudio_id uuid, p_aluno_id bigint, p_aula_id bigint, p_data_aula date, p_ignorar_avisos boolean DEFAULT false)
 RETURNS public.presencas
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_disp      jsonb;
  v_resultado presencas;
begin
  if p_estudio_id is null then
    raise exception 'p_estudio_id é obrigatório.';
  end if;
  if p_aula_id is null or p_data_aula is null then
    raise exception 'p_aula_id e p_data_aula são obrigatórios.';
  end if;

  -- Lock por aula+data: serializa checagem+insert entre requisições
  -- concorrentes disputando a mesma vaga.
  perform pg_advisory_xact_lock(hashtextextended(p_aula_id::text || '|' || p_data_aula::text, 0));

  if not p_ignorar_avisos then
    -- ordem corrigida: verificar_disponibilidade_v2(p_aula_id, p_data, p_estudio_id, p_aluno_id)
    v_disp := verificar_disponibilidade_v2(p_aula_id, p_data_aula, p_estudio_id, p_aluno_id);

    if (v_disp->>'podeAgendarLivremente')::boolean is false then
      if (v_disp->>'ocupacaoAtual')::int >= (v_disp->>'capacidadeMax')::int then
        raise exception '%', coalesce(v_disp->>'avisoCritico', 'Turma lotada.')
          using errcode = 'P0100';
      else
        raise exception '%', coalesce(v_disp->>'avisoCritico', 'Fora do plano do aluno.')
          using errcode = 'P0101';
      end if;
    end if;
  end if;

  insert into presencas (estudio_id, aluno_id, aula_id, data_aula, origem, status)
  values (p_estudio_id, p_aluno_id, p_aula_id, p_data_aula, 'avulso', 'agendado')
  returning * into v_resultado;

  return v_resultado;

exception
  when unique_violation then
    raise exception 'Este aluno já possui um agendamento nesta mesma turma e mesma data.'
      using errcode = '23505';
end;
$function$
;

CREATE OR REPLACE FUNCTION public.alunos_com_mensalidade_no_mes(p_estudio_id uuid, p_data_referencia date)
 RETURNS TABLE(aluno_id bigint)
 LANGUAGE plpgsql
AS $function$
begin
  if p_estudio_id is null then
    raise exception 'p_estudio_id é obrigatório.';
  end if;

  if auth.role() <> 'service_role' then
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
  end if;

  return query
  select distinct m.aluno_id
  from mensalidades m
  where m.estudio_id = p_estudio_id
    and m.data_vencimento <= (date_trunc('month', p_data_referencia) + interval '1 month - 1 day')::date
    and m.periodo_fim >= date_trunc('month', p_data_referencia)::date;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.atualizar_landing_config(p_estudio_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  update estudios
  set landing_config = landing_config || p_patch
  where id = p_estudio_id
  returning landing_config;
$function$
;

CREATE OR REPLACE FUNCTION public.cancelar_agendamento(p_aluno_id bigint, p_aula_id bigint, p_data date, p_estudio_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_auth_user_id uuid;
  v_linhas_afetadas int;
begin
  if p_estudio_id is null then
    raise exception 'p_estudio_id é obrigatório.';
  end if;

  select auth_id into v_auth_user_id
  from alunos
  where id = p_aluno_id
    and estudio_id = p_estudio_id;

  if v_auth_user_id is distinct from auth.uid() then
    raise exception 'Acesso negado: você só pode cancelar agendamentos próprios.';
  end if;

  delete from public.presencas
  where aluno_id = p_aluno_id
    and aula_id = p_aula_id
    and estudio_id = p_estudio_id
    and (data_aula = p_data or date(data_checkin) = p_data);

  get diagnostics v_linhas_afetadas = row_count;

  if v_linhas_afetadas = 0 then
    return json_build_object('sucesso', false, 'mensagem', 'Nenhum agendamento encontrado para cancelar.');
  end if;

  return json_build_object('sucesso', true, 'mensagem', 'Agendamento cancelado com sucesso', 'linhas_afetadas', v_linhas_afetadas);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.clear_estudio_override()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not eh_super_admin() then
    raise exception 'Usuário não autorizado.' using errcode = '42501';
  end if;

  delete from public.impersonation_sessions
  where user_id = auth.uid();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.criar_estudio_transacional(p_nome text, p_slug text, p_whatsapp text, p_instagram text, p_admin_id uuid, p_admin_nome text, p_admin_email text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_estudio_id UUID;
BEGIN

  -- ── 1. CRIAR ESTÚDIO ───────────────────────────────────────────────────────
  INSERT INTO public.estudios (nome, slug, whatsapp, instagram)
  VALUES (p_nome, p_slug, p_whatsapp, p_instagram)
  RETURNING id INTO v_estudio_id;

  -- ── 2. VINCULAR ADMIN AO ESTÚDIO ──────────────────────────────────────────
  -- Removido o ON CONFLICT pois o estúdio acabou de ser criado, não há risco de duplicação
  INSERT INTO public.estudio_membros (estudio_id, user_id, role)
  VALUES (v_estudio_id, p_admin_id, 'admin');

  -- ── 3. PROVISIONAR CONFIGURAÇÕES DE REPASSE PADRÃO ────────────────────────
  -- Removido o ON CONFLICT
  INSERT INTO public.configuracoes_repasse (
    estudio_id,
    valor_1_modalidade,
    valor_multi_modalidade,
    plano_livre_pct_prof,
    plano_livre_pct_casa,
    aula_avulsa_valor,
    aula_avulsa_pct_prof,
    aula_avulsa_pct_casa,
    aula_experimental_valor,
    aula_experimental_pct_prof
  )
  VALUES (
    v_estudio_id,
    0, 0, 0, 100,
    0, 0, 100,
    0, 0
  );

  -- ── RETORNO ────────────────────────────────────────────────────────────────
  RETURN json_build_object(
    'estudio_id', v_estudio_id,
    'estudio_nome', p_nome,
    'estudio_slug', p_slug
  );

END;
$function$
;

CREATE OR REPLACE FUNCTION public.criar_lead_com_presenca(p_estudio_id uuid, p_nome text, p_telefone text, p_aula_id bigint, p_data_visita date)
 RETURNS public.leads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lead leads;
  v_pode_escrever boolean;
begin
  select exists (
    select 1 from estudio_membros
    where user_id = auth.uid()
      and estudio_id = p_estudio_id
      and role = any(array['admin', 'professor'])
  ) into v_pode_escrever;

  if not v_pode_escrever then
    raise exception 'Acesso negado: você não tem permissão para criar leads neste estúdio.';
  end if;

  insert into leads (estudio_id, nome_visitante, telefone_visitante,
                     aula_id, data_visita, status_conversao)
  values (p_estudio_id, p_nome, p_telefone,
          p_aula_id, p_data_visita, 'pendente')
  returning * into v_lead;

  insert into presencas (estudio_id, aula_id, data_aula, origem, lead_id, status)
  values (p_estudio_id, p_aula_id, p_data_visita, 'lead', v_lead.id, 'agendado');

  return v_lead;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.eh_admin_do_estudio_atual()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    public.eh_super_admin()
    OR EXISTS (
      SELECT 1 FROM estudio_membros
      WHERE user_id = auth.uid()
        AND estudio_id = estudio_id_atual()
        AND role IN ('admin', 'super_admin')
    )
$function$
;

CREATE OR REPLACE FUNCTION public.eh_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM estudio_membros
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
$function$
;

CREATE OR REPLACE FUNCTION public.estudio_ativo_via_override()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select estudio_id
  from public.impersonation_sessions
  where user_id = auth.uid()
    and expira_em > now()
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.estudio_id_atual()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    public.estudio_ativo_via_override(),
    (
      select em.estudio_id
      from estudio_membros em
      join estudios e on e.id = em.estudio_id
      where em.user_id = auth.uid()
        and e.status = 'ativo'
      limit 1
    )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.estudio_publico(p_slug text)
 RETURNS TABLE(id uuid, nome text, slug text, whatsapp text, instagram text, maps_url text, maps_embed_url text, segmento text, cor_primaria text, cor_secundaria text, landing_config jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.id, e.nome, e.slug, e.whatsapp, e.instagram,
         e.maps_url, e.maps_embed_url, e.segmento, e.cor_primaria, e.cor_secundaria,
         e.landing_config
  FROM estudios e
  WHERE e.slug = p_slug AND e.status = 'ativo';
$function$
;

CREATE OR REPLACE FUNCTION public.excluir_aula_cascata(p_aula_id bigint, p_estudio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (
    (select public.estudio_id_atual()) = p_estudio_id
    and public.eh_admin_do_estudio_atual()
  ) and not (select public.eh_super_admin()) then
    raise exception 'Acesso negado: usuário não é admin deste estúdio.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from agenda where id = p_aula_id and estudio_id = p_estudio_id
  ) then
    raise exception 'Aula não encontrada neste estúdio.';
  end if;

  delete from agenda_fixa
    where aula_id = p_aula_id;

  delete from presencas
    where aula_id = p_aula_id
      and estudio_id = p_estudio_id;

  delete from leads
    where aula_id = p_aula_id
      and estudio_id = p_estudio_id;

  delete from agenda
    where id = p_aula_id
      and estudio_id = p_estudio_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.inserir_mensalidades_regulares_idempotente(p_mensalidades jsonb)
 RETURNS TABLE(out_aluno_id bigint, out_inserida boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;

CREATE OR REPLACE FUNCTION public.listar_estudios_admin(p_limit integer, p_offset integer, p_busca text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, nome text, slug text, whatsapp text, instagram text, criado_em timestamp with time zone, status text, total_alunos bigint, total_professores bigint, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not eh_super_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  return query
  select
    e.id, e.nome, e.slug, e.whatsapp, e.instagram,
    e.created_at                     as criado_em,
    e.status,
    coalesce(a.total_alunos, 0)      as total_alunos,
    coalesce(p.total_professores, 0) as total_professores,
    count(*) over ()                 as total_count
  from estudios e
  left join (select estudio_id, count(*) as total_alunos from alunos group by estudio_id) a
    on a.estudio_id = e.id
  left join (select estudio_id, count(*) as total_professores from professores group by estudio_id) p
    on p.estudio_id = e.id
  where p_busca is null
     or e.nome ilike '%' || p_busca || '%'
     or e.slug ilike '%' || p_busca || '%'
  order by e.created_at desc
  limit p_limit offset p_offset;
end;
$function$
;

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

  select exists (
    select 1 from estudio_membros
    where user_id = auth.uid() and estudio_id = p_estudio_id and role = 'admin'
  ) into v_admin_ok;

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
         modalidades_selecionadas = p_modalidades,
         ativo = true,
         data_inicio_plano = p_data_inicio,
         data_fim_plano = p_data_fim
   where id = p_aluno_id and estudio_id = p_estudio_id;

  update historico_planos
     set status = 'finalizado'
   where aluno_id = p_aluno_id and estudio_id = p_estudio_id and status = 'ativo';

  insert into historico_planos (aluno_id, plano_id, estudio_id, data_inicio, data_fim, status, valor_pago)
  values (p_aluno_id, p_plano_id, p_estudio_id, p_data_inicio, p_data_fim, 'ativo', p_valor_pago);

  insert into mensalidades (aluno_id, plano_id, estudio_id, data_vencimento, status, descricao, tipo_aula)
  values (p_aluno_id, p_plano_id, p_estudio_id, p_vencimento, 'pendente', p_descricao, v_tipo_aula);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.meu_estudio_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.estudio_id_atual();
$function$
;

CREATE OR REPLACE FUNCTION public.modalidades_publicas(p_estudio_id uuid)
 RETURNS TABLE(id uuid, nome text, area text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.id, m.nome, m.area
  from modalidades m
  join estudios e on e.id = m.estudio_id
  where m.estudio_id = p_estudio_id
    and e.status = 'ativo'
  order by m.area nulls last, m.nome;
$function$
;

CREATE OR REPLACE FUNCTION public.obter_impersonation_ativa()
 RETURNS TABLE(estudio_id uuid, criado_em timestamp with time zone, expira_em timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.estudio_id, s.criado_em, s.expira_em
  FROM public.impersonation_sessions s
  WHERE s.user_id = auth.uid()
    AND s.expira_em > now()
  LIMIT 1;
$function$
;

CREATE OR REPLACE FUNCTION public.planos_publicos(p_estudio_id uuid)
 RETURNS TABLE(id integer, nome text, preco numeric, duracao_meses integer, frequencia_semanal text, regras_acesso jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.nome, p.preco, p.duracao_meses, p.frequencia_semanal, p.regras_acesso
  from planos p
  join estudios e on e.id = p.estudio_id
  where p.estudio_id = p_estudio_id
    and e.status = 'ativo'
  order by p.preco asc;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_role_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.role != old.role and not (
    eh_admin_do_estudio_atual() and old.estudio_id = estudio_id_atual()
  ) then
    raise exception 'Alteração de role não permitida';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.receita_total_paga()
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not eh_super_admin() then
    raise exception 'access denied' using errcode = '42501';
  end if;

  return (
    select coalesce(sum(valor_pago), 0)
    from mensalidades
    where status = 'pago'
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.renovar_plano_aluno(p_aluno_id bigint, p_plano_id integer, p_data_inicio date, p_data_fim date, p_valor_pago numeric, p_estudio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_admin_ok boolean;
begin
  if p_estudio_id is null then
    raise exception 'p_estudio_id é obrigatório.';
  end if;

  select exists (
    select 1 from estudio_membros
    where user_id = auth.uid() and estudio_id = p_estudio_id and role = 'admin'
  ) into v_admin_ok;

  if not v_admin_ok then
    raise exception 'Acesso negado: você não é admin deste estúdio.';
  end if;

  if not exists (select 1 from alunos where id = p_aluno_id and estudio_id = p_estudio_id) then
    raise exception 'Aluno não pertence a este estúdio.';
  end if;

  if not exists (select 1 from planos where id = p_plano_id and estudio_id = p_estudio_id) then
    raise exception 'Plano não pertence a este estúdio.';
  end if;

  update historico_planos
     set status = 'finalizado'
   where aluno_id = p_aluno_id and estudio_id = p_estudio_id and status = 'ativo' and data_fim < current_date;

  insert into historico_planos (aluno_id, plano_id, estudio_id, data_inicio, data_fim, valor_pago, status)
  values (
    p_aluno_id, p_plano_id, p_estudio_id, p_data_inicio, p_data_fim, p_valor_pago,
    case when p_data_inicio > current_date then 'agendado' else 'ativo' end
  );

  update alunos
     set plano_id = p_plano_id, data_fim_plano = p_data_fim
   where id = p_aluno_id and estudio_id = p_estudio_id;

  insert into mensalidades (aluno_id, plano_id, estudio_id, data_vencimento, status)
  values (p_aluno_id, p_plano_id, p_estudio_id, p_data_inicio, 'pendente');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.reorder_tabela_colunas(p_estudio_id uuid, p_ids uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  update tabela_colunas_config t
  set display_order = x.ordem
  from unnest(p_ids) with ordinality as x(id, ordem)
  where t.id = x.id
    and t.estudio_id = p_estudio_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_estudio_override(p_estudio_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not eh_super_admin() then
    raise exception 'Usuário não autorizado a impersonar este estúdio';
  end if;

  insert into public.impersonation_sessions (user_id, estudio_id, criado_em, expira_em)
  values (auth.uid(), p_estudio_id, now(), now() + interval '4 hours')
  on conflict (user_id)
  do update set
    estudio_id = excluded.estudio_id,
    criado_em  = excluded.criado_em,
    expira_em  = excluded.expira_em;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at_campos_dinamicos()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.substituir_repasses_mensalidade(p_estudio_id uuid, p_mensalidade_id bigint, p_ids_lote_remover uuid[], p_itens jsonb)
 RETURNS SETOF public.repasses_lancamentos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.role() <> 'service_role' then
    if not (
      eh_super_admin()
      or exists (
        select 1 from estudio_membros
        where user_id = auth.uid()
          and estudio_id = p_estudio_id
          and role = 'admin'
      )
    ) then
      raise exception 'Acesso negado: você não tem permissão para alterar repasses deste estúdio.';
    end if;
  end if;

  delete from repasses_lancamentos
  where mensalidade_id = p_mensalidade_id
    and estudio_id = p_estudio_id;

  if p_ids_lote_remover is not null and array_length(p_ids_lote_remover, 1) > 0 then
    delete from repasses_lancamentos
    where id = any(p_ids_lote_remover)
      and estudio_id = p_estudio_id;
  end if;

  return query
  insert into repasses_lancamentos (
    estudio_id, professor_id, aluno_id, mensalidade_id,
    tipo_aula, modalidade, valor, data_referencia
  )
  select
    (item->>'estudio_id')::uuid,
    (item->>'professor_id')::uuid,
    (item->>'aluno_id')::bigint,
    (item->>'mensalidade_id')::bigint,
    item->>'tipo_aula',
    item->>'modalidade',
    (item->>'valor')::numeric,
    (item->>'data_referencia')::date
  from jsonb_array_elements(p_itens) as item
  where p_estudio_id = (item->>'estudio_id')::uuid
    and p_mensalidade_id = (item->>'mensalidade_id')::bigint
  returning *;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.verificar_disponibilidade_v2(p_aula_id bigint, p_data date, p_estudio_id uuid, p_aluno_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_aula RECORD;
    v_capacidade_max int;
    v_mod_id uuid;
    v_mod_nome text;
    v_mod_area text;

    v_qtd_avulsos int;
    v_qtd_fixos int;
    v_ocupacao_atual int;

    v_aviso text := null;
    v_aviso_lotacao text := null;
    v_aviso_plano text := null;

    v_aluno RECORD;
    v_plano RECORD;
    v_regra_area jsonb := NULL;
    v_is_livre boolean := false;
    v_tem_mod_no_plano boolean := true;
    v_limite_semanal int := 0;
    v_uso_semanal int := 0;

    v_uso_agendados int := 0;
    v_uso_fixos int := 0;
BEGIN
    IF p_estudio_id IS NULL THEN
        RAISE EXCEPTION 'p_estudio_id é obrigatório.';
    END IF;

    IF NOT ( (select public.estudio_id_atual()) = p_estudio_id OR (select public.eh_super_admin()) ) THEN
        RAISE EXCEPTION 'Acesso negado: usuário não pertence a este estúdio.' USING errcode = '42501';
    END IF;

    SELECT a.capacidade, m.id as mod_id, m.nome as mod_nome, m.area as mod_area, m.capacidade_padrao
    INTO v_aula
    FROM agenda a
    LEFT JOIN modalidades m ON m.id = a.modalidade_id
    WHERE a.id = p_aula_id
      AND a.estudio_id = p_estudio_id;

    IF v_aula IS NULL THEN
        RAISE EXCEPTION 'Aula não encontrada no banco de dados.';
    END IF;

    v_capacidade_max := COALESCE(v_aula.capacidade_padrao, v_aula.capacidade, 15);
    v_mod_id := v_aula.mod_id;
    v_mod_nome := COALESCE(v_aula.mod_nome, 'Atividade');
    v_mod_area := v_aula.mod_area;

    SELECT count(*) INTO v_qtd_avulsos
    FROM presencas p
    WHERE p.aula_id = p_aula_id
      AND p.estudio_id = p_estudio_id
      AND p.data_aula = p_data
      AND p.origem IN ('avulso', 'lead')
      AND p.status IN ('agendado', 'presente');

    SELECT count(*) INTO v_qtd_fixos
    FROM agenda_fixa af
    WHERE af.aula_id = p_aula_id
      AND af.estudio_id = p_estudio_id
    AND NOT EXISTS (
        SELECT 1 FROM presencas p
        WHERE p.aluno_id = af.aluno_id
          AND p.aula_id = p_aula_id
          AND p.estudio_id = p_estudio_id
          AND p.data_aula = p_data
          AND p.origem = 'fixo'
          AND p.status IN ('falta_justificada', 'falta_nao_avisada')
    );

    v_ocupacao_atual := COALESCE(v_qtd_avulsos, 0) + COALESCE(v_qtd_fixos, 0);

    IF v_ocupacao_atual >= v_capacidade_max THEN
        v_aviso_lotacao := 'Esta turma já está lotada! Capacidade máxima: ' || v_capacidade_max || ' vagas. Deseja forçar o agendamento mesmo assim?';
    END IF;

    IF p_aluno_id IS NOT NULL THEN
        SELECT modalidades_selecionadas, plano_id
        INTO v_aluno
        FROM alunos
        WHERE id = p_aluno_id
          AND estudio_id = p_estudio_id;

        IF v_aluno.plano_id IS NOT NULL THEN
            SELECT regras_acesso
            INTO v_plano
            FROM planos
            WHERE id = v_aluno.plano_id
              AND estudio_id = p_estudio_id;

            IF v_plano.regras_acesso IS NOT NULL AND jsonb_typeof(v_plano.regras_acesso) = 'array' THEN
                SELECT elem INTO v_regra_area
                FROM jsonb_array_elements(v_plano.regras_acesso) AS elem
                WHERE elem->>'modalidade' = v_mod_area
                LIMIT 1;
            END IF;

            IF v_regra_area IS NULL THEN
                v_aviso_plano := 'Atenção: O plano atual do aluno NÃO permite acesso à área de "' || COALESCE(v_mod_area, 'Desconhecida') || '". Deseja forçar a entrada mesmo assim?';
                v_tem_mod_no_plano := false;
            ELSE
                v_limite_semanal := COALESCE((v_regra_area->>'limite')::int, 0);
                v_is_livre := (v_limite_semanal = 999);

                IF NOT v_is_livre AND (COALESCE(v_aluno.modalidades_selecionadas::text, '') NOT LIKE '%' || v_mod_id::text || '%') THEN
                    v_aviso_plano := 'Atenção: O aluno não possui a modalidade "' || v_mod_nome || '" ativa no perfil dele. Deseja forçar?';
                    v_tem_mod_no_plano := false;
                ELSIF NOT v_is_livre THEN

                    SELECT count(*) INTO v_uso_agendados
                    FROM presencas p
                    JOIN agenda ag ON ag.id = p.aula_id
                    JOIN modalidades mo ON mo.id = ag.modalidade_id
                    WHERE p.aluno_id = p_aluno_id
                      AND p.estudio_id = p_estudio_id
                      AND p.origem IN ('avulso', 'lead')
                      AND p.status IN ('agendado', 'presente')
                      AND mo.area = v_mod_area
                      AND date_trunc('week', p.data_aula::timestamp) = date_trunc('week', p_data::timestamp)
                      AND NOT EXISTS (
                          SELECT 1 FROM feriados f
                          WHERE f.data = p.data_aula
                            AND f.estudio_id = p_estudio_id
                            AND f.bloqueia_agenda = true
                      );

                    SELECT count(*) INTO v_uso_fixos
                    FROM agenda_fixa af2
                    JOIN agenda ag ON ag.id = af2.aula_id
                    JOIN modalidades mo ON mo.id = ag.modalidade_id
                    WHERE af2.aluno_id = p_aluno_id
                      AND af2.estudio_id = p_estudio_id
                      AND mo.area = v_mod_area
                      AND NOT EXISTS (
                          SELECT 1 FROM feriados f
                          WHERE f.bloqueia_agenda = true
                            AND f.estudio_id = p_estudio_id
                            AND f.data >= date_trunc('week', p_data::timestamp)::date
                            AND f.data <= (date_trunc('week', p_data::timestamp) + interval '6 days')::date
                            AND EXTRACT(DOW FROM f.data) = CASE LOWER(ag.dia_semana)
                                WHEN 'domingo'       THEN 0
                                WHEN 'segunda-feira' THEN 1
                                WHEN 'terça-feira'   THEN 2
                                WHEN 'quarta-feira'  THEN 3
                                WHEN 'quinta-feira'  THEN 4
                                WHEN 'sexta-feira'   THEN 5
                                WHEN 'sábado'        THEN 6
                            END
                      )
                      AND NOT EXISTS (
                          SELECT 1 FROM presencas p
                          WHERE p.aluno_id = af2.aluno_id
                            AND p.aula_id = af2.aula_id
                            AND p.estudio_id = p_estudio_id
                            AND p.origem = 'fixo'
                            AND p.status IN ('falta_justificada', 'falta_nao_avisada')
                            AND date_trunc('week', p.data_aula::timestamp) = date_trunc('week', p_data::timestamp)
                      );

                    v_uso_semanal := COALESCE(v_uso_agendados, 0) + COALESCE(v_uso_fixos, 0);

                    IF v_uso_semanal >= v_limite_semanal AND v_limite_semanal > 0 THEN
                        v_aviso_plano := 'O aluno já atingiu o limite de ' || v_limite_semanal || 'x aulas na semana para a área de ' || COALESCE(v_mod_area, 'Desconhecida') || '. Deseja agendar assim mesmo?';
                    END IF;
                END IF;
            END IF;
        ELSE
            v_aviso_plano := 'Este aluno não possui um plano ativo vinculado. Deseja forçar o agendamento?';
            v_tem_mod_no_plano := false;
        END IF;
    END IF;

    IF v_aviso_plano IS NOT NULL AND v_aviso_lotacao IS NOT NULL THEN
        v_aviso := v_aviso_lotacao || ' ' || v_aviso_plano;
    ELSE
        v_aviso := COALESCE(v_aviso_plano, v_aviso_lotacao);
    END IF;

    RETURN jsonb_build_object(
        'podeAgendarLivremente', (v_aviso IS NULL),
        'avisoCritico', v_aviso,
        'capacidadeMax', v_capacidade_max,
        'ocupacaoAtual', v_ocupacao_atual,
        'limiteSemanal', v_limite_semanal,
        'usoSemanal', v_uso_semanal,
        'isLivre', v_is_livre,
        'modNome', v_mod_nome,
        'temModalidadeNoPlano', v_tem_mod_no_plano
    );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.verificar_status_estudio()
 RETURNS TABLE(estudio_id uuid, nome text, status text, bloqueado boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.nome, e.status, (e.status <> 'ativo') as bloqueado
  from estudio_membros em
  join estudios e on e.id = em.estudio_id
  where em.user_id = auth.uid()
  order by em.created_at asc
  limit 1;
$function$
;



