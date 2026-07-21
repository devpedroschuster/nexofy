import { supabase } from '../lib/supabase';

// ─────────────────────────────────────────────────────────────────────────
// presencaService
//
// Responsável pela tabela `presenca` (check-in, agendamento e falta de
// alunos fixos e avulsos). Leads vivem em `leadsService` / tabela `leads` —
// a ponte entre os dois é presenca.lead_id, usado apenas quando
// origem = 'lead'.
//
// Modelo de negócio (ver migration 001_split_presenca_leads.sql):
//   - origem 'fixo'   -> nunca nasce como 'agendado'; só ganha linha quando
//                        o resultado do dia é registrado (presente/falta_*).
//   - origem 'avulso' -> nasce explicitamente como 'agendado' ao ser marcado
//                        na agenda, depois transiciona para presente/falta_*.
//   - origem 'lead'   -> nasce como 'agendado', vinculada a leads.id.
//
// status: 'agendado' | 'presente' | 'falta_justificada' | 'falta_nao_avisada'
// ─────────────────────────────────────────────────────────────────────────

const SELECT_CHAMADA =
  'id, aluno_id, lead_id, origem, status, data_checkin, observacao, ' +
  'alunos(id, nome_completo), leads(id, nome_visitante)';

export const presencaService = {
  // ── AGENDAMENTO (avulso) ──────────────────────────────────────────────
  // Cria o registro explícito de agendamento para um aluno cadastrado que
  // marcou presença numa aula pontual (fora da matrícula fixa).
  //
  // BUG #5 fix: o parâmetro ignorarAvisos é agora recebido e propagado para
  // o RPC `agendar_avulso` via p_ignorar_avisos. Quando true, o banco
  // bypassa as validações de capacidade e restrição de plano, permitindo que
  // o agendamento seja confirmado mesmo em turma lotada ou fora do plano.
  //
  // IMPORTANTE: o RPC `agendar_avulso` precisa existir no banco com a
  // assinatura abaixo. Enquanto não existir, a função cai no fallback de
  // INSERT direto (sem bypass), que é o comportamento original.
  //
  // Assinatura esperada do RPC:
  //   agendar_avulso(
  //     p_estudio_id   uuid,
  //     p_aluno_id     uuid,
  //     p_aula_id      uuid,
  //     p_data_aula    date,
  //     p_ignorar_avisos boolean DEFAULT false
  //   ) RETURNS presenca
  async agendarAvulso({ alunoId, aulaId, dataAula, ignorarAvisos = false }, estudioId) {
    // ── Caminho via RPC (com suporte a p_ignorar_avisos) ─────────────────
    // Use este caminho quando o RPC `agendar_avulso` estiver implementado
    // no banco. Ele é o único que consegue realmente bypasear as validações
    // de negócio (triggers de capacidade/plano) quando ignorarAvisos = true.
    //
    // Para ativar: remova o bloco de comentário abaixo e apague o bloco
    // "Caminho via INSERT direto" que vem depois.
    //
    // const { data, error } = await supabase.rpc('agendar_avulso', {
    //   p_estudio_id:      estudioId,
    //   p_aluno_id:        alunoId,
    //   p_aula_id:         aulaId,
    //   p_data_aula:       dataAula,
    //   p_ignorar_avisos:  ignorarAvisos,
    // });
    //
    // if (error && error.code === '23505') {
    //   throw new Error('Este aluno já possui um agendamento nesta mesma turma e mesma data.');
    // }
    // if (error) throw error;
    // return data;

    // ── Caminho via INSERT direto (comportamento original) ────────────────
    // Mantido enquanto o RPC ainda não existe no banco.
    // Neste caminho, ignorarAvisos não tem efeito prático — o banco vai
    // rejeitar o INSERT pelos mesmos triggers/constraints de antes.
    // Assim que o RPC for criado, substitua este bloco pelo bloco acima.
    const payload = {
      estudio_id: estudioId,
      aluno_id: alunoId,
      aula_id: aulaId,
      data_aula: dataAula,
      origem: 'avulso',
      status: 'agendado',
    };

    const { data, error } = await supabase
      .from('presenca')
      .insert([payload])
      .select()
      .single();

    if (error && error.code === '23505') {
      throw new Error('Este aluno já possui um agendamento nesta mesma turma e mesma data.');
    }
    if (error) throw error;
    return data;
  },

  async cancelarAgendamento(id, estudioId) {
    const { data, error } = await supabase
      .from('presenca')
      .delete()
      .eq('id', id)
      .eq('estudio_id', estudioId)
      .select();
    if (error) throw error;
    return data;
  },

  // ── LEITURA PARA O CALENDÁRIO (visão mensal) ──────────────────────────
  // Usado por useAgendaDadosMes — traz todas as linhas de presenca no
  // período visível, para indexar quem está agendado/presente/faltou por
  // aula+data ao montar os eventos do calendário.
  async listarPeriodo(inicio, fim, estudioId) {
    const { data, error } = await supabase
      .from('presenca')
      .select('id, aula_id, data_aula, origem, status, aluno_id, lead_id, alunos(id, nome_completo), leads(id, nome_visitante)')
      .eq('estudio_id', estudioId)
      .gte('data_aula', inicio)
      .lte('data_aula', fim);
    if (error) throw error;
    return data;
  },

  // ── CHAMADA DE UMA AULA ESPECÍFICA (ModalListaPresenca) ───────────────
  // Combina:
  //   1. Alunos fixos da turma (agenda_fixa) — aparecem mesmo sem linha em
  //      presenca, com status implícito 'presente' até que algo diga o
  //      contrário (falta registrada).
  //   2. Avulsos/leads explicitamente agendados (presenca, origem != fixo).
  //   3. Resultado já registrado para os fixos naquele dia (presenca,
  //      origem = 'fixo'), que sobrepõe o status implícito.
  async listarChamadaCompleta(aulaId, dataAula, estudioId) {
    const [{ data: fixos, error: errFixos }, { data: registros, error: errRegistros }] =
      await Promise.all([
        supabase
          .from('agenda_fixa')
          .select('id, aluno_id, alunos(id, nome_completo)')
          .eq('aula_id', aulaId)
          .eq('estudio_id', estudioId), // Bug #2: filtro de tenant explícito
        supabase
          .from('presenca')
          .select(SELECT_CHAMADA)
          .eq('estudio_id', estudioId)
          .eq('aula_id', aulaId)
          .eq('data_aula', dataAula),
      ]);

    if (errFixos) throw errFixos;
    if (errRegistros) throw errRegistros;

    const registrosPorAluno = new Map(
      (registros || [])
        .filter(r => r.origem === 'fixo' && r.aluno_id)
        .map(r => [r.aluno_id, r])
    );

    const lista = [];

    // 1) Fixos — status implícito 'presente' (visual), sobreposto pelo
    //    registro real do dia se houver (falta ou check-in explícito).
    (fixos || []).forEach(f => {
      const registroDoDia = registrosPorAluno.get(f.aluno_id);
      lista.push({
        id_relacao: registroDoDia?.id ?? f.id,
        aluno_id: f.aluno_id,
        nome: f.alunos?.nome_completo || 'Aluno',
        tipo: 'fixo',
        status: registroDoDia?.status ?? 'presente',
        registroExiste: !!registroDoDia,
      });
    });

    // 2) Avulsos e leads — sempre vêm de uma linha explícita em presenca.
    (registros || [])
      .filter(r => r.origem !== 'fixo')
      .forEach(r => {
        lista.push({
          id_relacao: r.id,
          aluno_id: r.aluno_id,
          lead_id: r.lead_id,
          nome: r.alunos?.nome_completo || r.leads?.nome_visitante || 'Visitante',
          tipo: r.origem === 'lead' ? 'experimental' : 'avulso',
          status: r.status,
          registroExiste: true,
        });
      });

    return lista;
  },

  // ── CHECK-IN ───────────────────────────────────────────────────────────
  // Confirma presença. Para fixo/avulso já agendado, atualiza a linha
  // existente; para fixo sem linha prévia (caso comum), cria a linha agora.
  async registrarCheckin({ presencaId, alunoId, aulaId, dataAula, origem }, estudioId, userId = null) {
    const agora = new Date().toISOString();

    if (presencaId) {
      const { data, error } = await supabase
        .from('presenca')
        .update({ status: 'presente', data_checkin: agora, registrado_por: userId })
        .eq('id', presencaId)
        .eq('estudio_id', estudioId)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const payload = {
      estudio_id: estudioId,
      aluno_id: alunoId,
      aula_id: aulaId,
      data_aula: dataAula,
      origem: origem || 'fixo',
      status: 'presente',
      data_checkin: agora,
      registrado_por: userId,
    };

    const { data, error } = await supabase
      .from('presenca')
      .upsert([payload], {
        onConflict: 'aluno_id,aula_id,data_aula',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async desfazerCheckin(presencaId, estudioId) {
    // Para fixo: volta ao estado implícito apagando a linha.
    // Para avulso/lead: não pode sumir (perderia o rastro do agendamento),
    // então volta para 'agendado'.
    const { data: registro, error: errBusca } = await supabase
      .from('presenca')
      .select('id, origem')
      .eq('id', presencaId)
      .eq('estudio_id', estudioId)
      .single();
    if (errBusca) throw errBusca;

    if (registro.origem === 'fixo') {
      const { error } = await supabase
        .from('presenca')
        .delete()
        .eq('id', presencaId)
        .eq('estudio_id', estudioId);
      if (error) throw error;
      return null;
    }

    const { data, error } = await supabase
      .from('presenca')
      .update({ status: 'agendado', data_checkin: null, registrado_por: null })
      .eq('id', presencaId)
      .eq('estudio_id', estudioId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ── FALTA ──────────────────────────────────────────────────────────────
  // tipoFalta: 'justificada' | 'nao_avisada'
  async registrarFalta({ presencaId, alunoId, aulaId, dataAula, origem }, tipoFalta, estudioId, userId = null) {
    const status = tipoFalta === 'justificada' ? 'falta_justificada' : 'falta_nao_avisada';

    if (presencaId) {
      const { data, error } = await supabase
        .from('presenca')
        .update({ status, data_checkin: null, registrado_por: userId })
        .eq('id', presencaId)
        .eq('estudio_id', estudioId)
        .select()
        .single();
      if (error) throw error;
      return data;
    }

    const payload = {
      estudio_id: estudioId,
      aluno_id: alunoId,
      aula_id: aulaId,
      data_aula: dataAula,
      origem: origem || 'fixo',
      status,
      registrado_por: userId,
    };

    const { data, error } = await supabase
      .from('presenca')
      .upsert([payload], {
        onConflict: 'aluno_id,aula_id,data_aula',
        ignoreDuplicates: false,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Desfazer falta: fixo volta ao estado implícito (apaga linha);
  // avulso/lead volta para 'agendado'.
  async removerFalta(presencaId, estudioId) {
    return presencaService.desfazerCheckin(presencaId, estudioId);
  },

  // ── HISTÓRICO / RELATÓRIOS ────────────────────────────────────────────
  async buscarHistoricoFrequencia(alunoId, estudioId) {
    const { data, error } = await supabase
      .from('presenca')
      .select('*, agenda(atividade, horario)')
      .eq('aluno_id', alunoId)
      .eq('estudio_id', estudioId)
      .order('data_aula', { ascending: false });
    if (error) throw error;
    return data;
  },
};