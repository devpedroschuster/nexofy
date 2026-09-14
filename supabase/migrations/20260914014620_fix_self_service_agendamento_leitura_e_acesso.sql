-- 1) RLS de presencas não tinha policy de SELECT para o próprio aluno — só
-- staff/super_admin liam. O agendamento via agendar_avulso/cancelar_agendamento
-- (SECURITY DEFINER) grava normalmente, mas o app nunca conseguia LER de volta
-- a própria reserva (Dashboard "próxima aula" e badge "Agendado" na Agenda
-- ficavam sempre vazios para o aluno real). Mesmo padrão já usado em mensalidades.
--
-- OBS (2026-09-14): na prática, todo aluno com acesso liberado via
-- criar-acesso-aluno já ganha uma linha em estudio_membros(role='aluno'), o
-- que já fazia a policy tenant_select (baseada em estudio_membros) cobrir
-- esse caso. Esta policy fica como reforço explícito, redundante mas inofensiva
-- (RLS permissive faz OR entre policies).
create policy "presenca_select_proprio_aluno"
on public.presencas
for select
to public
using (
  aluno_id in (
    select id from public.alunos where auth_id = auth.uid()
  )
);

-- 2) verificar_disponibilidade_v2: a guarda de acesso original só reconhecia
-- staff (estudio_id_atual(), que só olha estudio_membros). Quando o chamador
-- não tem NENHUMA linha em estudio_membros, estudio_id_atual() retorna NULL, e
-- "NOT (NULL OR eh_super_admin())" também é NULL — o Postgres trata IF NULL
-- como falso, então a exceção nunca disparava. Isso não bloqueava nenhum
-- usuário autenticado de consultar ocupação/plano de QUALQUER outro estúdio
-- (edge case: conta sem vínculo algum em estudio_membros). Corrigido para
-- reconhecer explicitamente o próprio aluno (mesma checagem de ownership já
-- usada em agendar_avulso/cancelar_agendamento) e negar os demais casos.
create or replace function public.verificar_disponibilidade_v2(p_aula_id bigint, p_data date, p_estudio_id uuid, p_aluno_id bigint DEFAULT NULL::bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
    v_mod_id uuid;
    v_mod_nome text;
    v_mod_area text;
    v_existe_aula boolean;

    v_capacidade_max int;
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

    IF NOT (
      (select public.estudio_id_atual()) = p_estudio_id
      OR (select public.eh_super_admin())
      OR (
        p_aluno_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM alunos al
          WHERE al.id = p_aluno_id
            AND al.estudio_id = p_estudio_id
            AND al.auth_id = auth.uid()
        )
      )
    ) THEN
        RAISE EXCEPTION 'Acesso negado: usuário não pertence a este estúdio.' USING errcode = '42501';
    END IF;

    SELECT true, m.id, COALESCE(m.nome, 'Atividade'), m.area
    INTO v_existe_aula, v_mod_id, v_mod_nome, v_mod_area
    FROM agenda a
    LEFT JOIN modalidades m ON m.id = a.modalidade_id
    WHERE a.id = p_aula_id
      AND a.estudio_id = p_estudio_id;

    IF NOT COALESCE(v_existe_aula, false) THEN
        RAISE EXCEPTION 'Aula não encontrada no banco de dados.';
    END IF;

    SELECT ocupacao_atual, capacidade_max
    INTO v_ocupacao_atual, v_capacidade_max
    FROM public.calcular_ocupacao_turma(p_aula_id, p_data, p_estudio_id);

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

-- 3) calcular_ocupacao_turma estava liberada até para anon (herdava PUBLIC).
-- Não é chamada diretamente pelo app (só internamente por
-- verificar_disponibilidade_v2), então não precisa de acesso público.
revoke execute on function public.calcular_ocupacao_turma(bigint, date, uuid) from public;
revoke execute on function public.calcular_ocupacao_turma(bigint, date, uuid) from anon;
grant execute on function public.calcular_ocupacao_turma(bigint, date, uuid) to authenticated, service_role;
