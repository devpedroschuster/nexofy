import { format, eachDayOfInterval, addMinutes } from 'date-fns';

export const DIAS_MAPA = {
  'domingo': 0,
  'segunda-feira': 1,
  'terça-feira': 2,
  'quarta-feira': 3,
  'quinta-feira': 4,
  'sexta-feira': 5,
  'sábado': 6
};

function extrairDataLocal(dataUTCStr) {
  if (!dataUTCStr) return null;
  if (dataUTCStr.length === 10) return dataUTCStr;

  const dataLocal = new Date(dataUTCStr);
  if (isNaN(dataLocal.getTime())) return null;

  const ano = dataLocal.getFullYear();
  const mes = String(dataLocal.getMonth() + 1).padStart(2, '0');
  const dia = String(dataLocal.getDate()).padStart(2, '0');

  return `${ano}-${mes}-${dia}`;
}

const STATUS_FALTA = new Set(['falta_justificada', 'falta_nao_avisada']);

// Sprint 03 (split presenca/leads): consome o retorno de
// presencaService.listarPeriodo. Cada linha já carrega origem/status, então
// um único índice por aula+data substitui os antigos buildPresencasIndex +
// buildExcecoesIndex.
//
// Para origem 'avulso'/'lead': aparecem na lista (estão explicitamente
// agendados), exceto se status for falta — aí saem da lista de agendados
// do dia (a falta deles já é visível na chamada, não no card resumido
// do calendário).
// Para origem 'fixo': só geram entrada aqui quando há um registro real no
// dia (normalmente falta, já que presença confirmada de fixo raramente
// precisa aparecer separada do "presente implícito" do card).
export function buildPresencasIndex(presencasCalendario) {
  const map = {};
  (presencasCalendario || []).forEach(p => {
    const dataStr = p.data_aula ? extrairDataLocal(p.data_aula) : extrairDataLocal(p.data_checkin);
    if (!dataStr) return;
    if (STATUS_FALTA.has(p.status)) return; // falta não entra na lista de "quem vai"

    const key = `${p.aula_id}-${dataStr}`;
    if (!map[key]) map[key] = [];

    const nomeExibicao = p.leads?.nome_visitante || p.alunos?.nome_completo;
    if (nomeExibicao) {
      map[key].push({
        // BUG #11 fix: propaga o id do aluno/lead para permitir deduplicação
        // por id em compilarAlunosAgendados.
        id: p.aluno_id ?? p.lead_id ?? null,
        nome: nomeExibicao,
        isLead: p.origem === 'lead',
        isFixo: p.origem === 'fixo',
      });
    }
  });
  return map;
}

// Índice de faltas de fixos por aula+data, para suprimir o fixo da lista de
// presentes do card do calendário. Substitui buildExcecoesIndex.
export function buildFaltasFixosIndex(presencasCalendario) {
  const map = {};
  (presencasCalendario || []).forEach(p => {
    if (p.origem !== 'fixo' || !STATUS_FALTA.has(p.status) || !p.aluno_id) return;
    const dataStr = extrairDataLocal(p.data_aula);
    if (!dataStr) return;
    map[`${p.aluno_id}-${p.aula_id}-${dataStr}`] = p.status;
  });
  return map;
}

export function buildFixosIndex(matriculasFixas) {
  const map = {};
  (matriculasFixas || []).forEach(m => {
    if (!map[m.aula_id]) map[m.aula_id] = [];
    if (m.alunos?.nome_completo) {
      map[m.aula_id].push({
        id: m.alunos.id,
        nome: m.alunos.nome_completo,
        inicio: extrairDataLocal(m.alunos.data_inicio_plano),
        fim: extrairDataLocal(m.alunos.data_fim_plano)
      });
    }
  });
  return map;
}

export function isFeriado(dataStr, feriados) {
  return feriados?.find(f => f.data === dataStr && f.bloqueia_agenda);
}

function compilarAlunosAgendados(aulaId, dataStr, todosFixosDaTurma, indexes) {
  const { faltasFixosMap, presencasMap } = indexes;

  const fixosPresentesHoje = todosFixosDaTurma.filter(aluno => {
    if (faltasFixosMap[`${aluno.id}-${aulaId}-${dataStr}`]) return false;
    if (aluno.inicio && dataStr < aluno.inicio) return false;
    return true;
  }).map(aluno => {
    const isVencido = aluno.fim && dataStr > aluno.fim;
    return {
      id: aluno.id,   // BUG #11 fix: propaga id para deduplicação correta
      nome: aluno.nome,
      isLead: false,
      isVencido: !!isVencido,
    };
  });

  const alunosAvulsos = (presencasMap[`${aulaId}-${dataStr}`] || []).filter(a => !a.isFixo);
  const listaCompleta = [...fixosPresentesHoje, ...alunosAvulsos];

  // BUG #11 fix: deduplicação por id em vez de nome — evita descartar alunos
  // com nomes idênticos (ex: dois "João Silva" na mesma turma).
  // Leads sem cadastro (id null) usam fallback para nome como chave.
  const idsVistos = new Set();
  return listaCompleta.filter(item => {
    const chave = item.id != null ? item.id : `nome:${item.nome}`;
    if (idsVistos.has(chave)) return false;
    idsVistos.add(chave);
    return true;
  });
}

export function expandirRecorrencia(aula, inicioVisivel, fimVisivel, feriados, indexes) {
  const eventos = [];

  const diaNormalizado = String(aula.dia_semana || '').toLowerCase();
  const diaAlvo = DIAS_MAPA[diaNormalizado];

  if (diaAlvo === undefined) return [];

  // Bug #12: horário ausente ou mal formatado (null, "08h00", etc.) geraria
  // NaN → Invalid Date → react-big-calendar trava.
  if (!aula.horario || !/^\d{2}:\d{2}/.test(aula.horario)) {
    console.warn('[calendarioParser] horario inválido na aula', aula.id, aula.horario);
    return [];
  }

  const [hora, minuto] = aula.horario.split(':').map(Number);
  const duracaoMin = aula.duracao_minutos ?? 60;
  const todosFixosDaTurma = indexes.fixasMap[aula.id] || [];

  const diasNoPeriodo = eachDayOfInterval({ start: inicioVisivel, end: fimVisivel });

  diasNoPeriodo.forEach(dataIterador => {
    if (dataIterador.getDay() === diaAlvo) {
      const dataStr = format(dataIterador, 'yyyy-MM-dd');

      if (isFeriado(dataStr, feriados)) return;

      const inicio = new Date(dataIterador);
      inicio.setHours(hora, minuto, 0, 0);

      const fim = addMinutes(inicio, duracaoMin);

      eventos.push({
        idUnico: `${aula.id}-${dataStr}`,
        title: aula.atividade,
        start: inicio,
        end: fim,
        dadosOriginais: aula,
        isEventoLivre: false,
        alunosAgendados: compilarAlunosAgendados(aula.id, dataStr, todosFixosDaTurma, indexes)
      });
    }
  });

  return eventos;
}

export function expandirEventoUnico(aula, feriados, indexes) {
  if (isFeriado(aula.data_especifica, feriados)) return [];

  // Bug #12 (mesmo padrão): horário ausente ou mal formatado → Invalid Date.
  if (!aula.horario || !/^\d{2}:\d{2}/.test(aula.horario)) {
    console.warn('[calendarioParser] horario inválido na aula', aula.id, aula.horario);
    return [];
  }

  const [ano, mes, dia] = aula.data_especifica.split('-');
  const [hora, minuto] = aula.horario.split(':').map(Number);
  const duracaoMin = aula.duracao_minutos ?? 60;

  const inicio = new Date(ano, mes - 1, dia, hora, minuto, 0, 0);
  const fim = addMinutes(inicio, duracaoMin);

  const todosFixosDaTurma = indexes.fixasMap[aula.id] || [];

  return [{
    idUnico: `${aula.id}-${aula.data_especifica}`,
    title: `⭐ ${aula.atividade}`,
    start: inicio,
    end: fim,
    dadosOriginais: aula,
    isEventoLivre: true,
    alunosAgendados: compilarAlunosAgendados(aula.id, aula.data_especifica, todosFixosDaTurma, indexes)
  }];
}

export function gerarEventosFeriados(feriados) {
  if (!feriados) return [];
  return feriados.filter(f => f.bloqueia_agenda).map(f => {
    const [ano, mes, dia] = f.data.split('-');
    return {
      idUnico: `feriado-${f.id || f.data}`,
      title: `⛔ ${f.descricao}`,
      start: new Date(ano, mes - 1, dia, 0, 0, 0, 0),
      end: new Date(ano, mes - 1, dia, 23, 59, 59, 999),
      allDay: true,
      isFeriado: true,
      dadosOriginais: f
    };
  });
}