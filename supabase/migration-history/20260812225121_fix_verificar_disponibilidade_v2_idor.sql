-- MÉDIO/ALTO: verificar_disponibilidade_v2 aceitava p_estudio_id arbitrário sem validar
-- que o chamador pertence àquele estúdio, vazando ocupação de turma e regras de plano
-- de alunos de outros estúdios para qualquer usuário autenticado.
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
$function$;
