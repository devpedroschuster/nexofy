-- Fix de segurança na migration anterior (20260909190000): auth.uid() IS NULL
-- (chamador anon/sem sessão) nunca deve "casar" com alunos.auth_id IS NULL
-- (aluno matriculado que ainda não fez o primeiro acesso) — a comparação
-- "x IS DISTINCT FROM y" avalia FALSE quando os dois lados são NULL, o que
-- permitiria a uma chamada sem sessão nenhuma agendar/cancelar em nome desse
-- aluno. Achado pelo get_advisors (anon_security_definer_function_executable)
-- logo depois de aplicar a migration anterior em staging.
--
-- Também revoga o EXECUTE de agendar_avulso do role anon — só authenticated
-- deve poder chamar (admin/professor/aluno self-service, sempre logados).

revoke execute on function public.agendar_avulso(uuid, bigint, bigint, date, boolean) from anon;

create or replace function public.agendar_avulso(
  p_estudio_id uuid,
  p_aluno_id bigint,
  p_aula_id bigint,
  p_data_aula date,
  p_ignorar_avisos boolean default false
)
returns presencas
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_disp            jsonb;
  v_resultado       presencas;
  v_pode_gerenciar  boolean;
  v_auth_id_aluno   uuid;
  v_dias_atraso     int;
  v_tolerancia      int;
  v_link_pagamento  text;
begin
  if p_estudio_id is null then
    raise exception 'p_estudio_id é obrigatório.';
  end if;
  if p_aula_id is null or p_data_aula is null then
    raise exception 'p_aula_id e p_data_aula são obrigatórios.';
  end if;

  select exists (
    select 1 from estudio_membros em
    where em.user_id = auth.uid()
      and em.estudio_id = p_estudio_id
      and em.role in ('admin', 'professor', 'super_admin')
  ) into v_pode_gerenciar;

  if not v_pode_gerenciar then
    select auth_id into v_auth_id_aluno
    from alunos
    where id = p_aluno_id and estudio_id = p_estudio_id;

    if auth.uid() is null or v_auth_id_aluno is distinct from auth.uid() then
      raise exception 'Acesso negado: você só pode agendar aulas para si mesmo.';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_aula_id::text || '|' || p_data_aula::text, 0));

  if not p_ignorar_avisos then
    select dias_atraso into v_dias_atraso
    from alunos
    where id = p_aluno_id and estudio_id = p_estudio_id;

    select dias_tolerancia_inadimplencia into v_tolerancia
    from estudios
    where id = p_estudio_id;

    if coalesce(v_dias_atraso, 0) > coalesce(v_tolerancia, 5) then
      select link_pagamento into v_link_pagamento
      from mensalidades
      where aluno_id = p_aluno_id
        and estudio_id = p_estudio_id
        and status = 'pendente'
      order by data_vencimento desc
      limit 1;

      raise exception 'Mensalidade em atraso há % dias.', v_dias_atraso
        using errcode = 'P0102',
              detail = json_build_object(
                'dias_atraso', v_dias_atraso,
                'link_pagamento', v_link_pagamento
              )::text;
    end if;

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
$function$;

create or replace function public.cancelar_agendamento(
  p_aluno_id bigint,
  p_aula_id bigint,
  p_data date,
  p_estudio_id uuid
)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_auth_user_id     uuid;
  v_linhas_afetadas  int;
  v_horario          time;
  v_timezone         text;
  v_horas_min        int;
  v_momento_aula     timestamptz;
begin
  if p_estudio_id is null then
    raise exception 'p_estudio_id é obrigatório.';
  end if;

  select auth_id into v_auth_user_id
  from alunos
  where id = p_aluno_id
    and estudio_id = p_estudio_id;

  if auth.uid() is null or v_auth_user_id is distinct from auth.uid() then
    raise exception 'Acesso negado: você só pode cancelar agendamentos próprios.';
  end if;

  select a.horario, coalesce(e.timezone, 'America/Sao_Paulo'), coalesce(e.horas_min_cancelamento, 4)
    into v_horario, v_timezone, v_horas_min
  from agenda a
  join estudios e on e.id = p_estudio_id
  where a.id = p_aula_id and a.estudio_id = p_estudio_id;

  if v_horario is not null then
    v_momento_aula := (p_data + v_horario)::timestamp at time zone v_timezone;

    if now() > (v_momento_aula - make_interval(hours => v_horas_min)) then
      raise exception 'Cancelamento permitido até % horas antes da aula.', v_horas_min
        using errcode = 'P0103';
    end if;
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
$function$;
