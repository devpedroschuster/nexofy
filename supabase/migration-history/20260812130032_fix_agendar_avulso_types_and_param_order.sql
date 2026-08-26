create or replace function public.agendar_avulso(
  p_estudio_id     uuid,
  p_aluno_id       bigint,
  p_aula_id        bigint,
  p_data_aula      date,
  p_ignorar_avisos boolean default false
)
returns presencas
language plpgsql
set search_path to 'public'
as $function$
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
$function$;
