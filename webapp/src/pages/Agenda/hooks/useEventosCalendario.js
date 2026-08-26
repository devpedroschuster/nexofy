import { useMemo } from 'react';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, isValid } from 'date-fns';
import {
  buildPresencasIndex, buildFixosIndex, buildFaltasFixosIndex,
  expandirRecorrencia, expandirEventoUnico, gerarEventosFeriados
} from '../../../utils/calendarioParser';

export function useEventosCalendario({ aulas, feriados, presencasCalendario, matriculasFixas, filtroProf, filtroEspaco, currentDate, currentView }) {

  const indexes = useMemo(() => {
    // Bug #6: guard corrigido de && para ||. Com &&, bastava apenas um dos dois
    // ser undefined para o guard falhar e buildFixosIndex(undefined) ser chamado.
    // Com ||, retornamos mapas vazios enquanto qualquer query ainda carrega.
    if (presencasCalendario === undefined || matriculasFixas === undefined) {
      return { presencasMap: {}, fixasMap: {}, faltasFixosMap: {} };
    }
    return {
      presencasMap:   buildPresencasIndex(presencasCalendario || []),
      fixasMap:       buildFixosIndex(matriculasFixas || []),
      faltasFixosMap: buildFaltasFixosIndex(presencasCalendario || [])
    };
  }, [presencasCalendario, matriculasFixas]);

  const eventosFeriados = useMemo(() => {
    return gerarEventosFeriados(feriados || []);
  }, [feriados]);

  const aulasFiltradas = useMemo(() => {
    if (!aulas) return [];
    return aulas.filter(aula => {
      const matchProf = filtroProf === 'todos' || String(aula.professor_id) === String(filtroProf);
      const espacoAula = aula.espaco || 'funcional';
      const matchEspaco = filtroEspaco === 'todos' || espacoAula === filtroEspaco;
      return matchProf && matchEspaco;
    });
  }, [aulas, filtroProf, filtroEspaco]);

  const limitesVisiveis = useMemo(() => {
    // Guard defensivo: se currentDate vier null/undefined/inválido do estado do
    // componente pai, date-fns lançaria exceção dentro deste useMemo e quebraria
    // a renderização inteira do calendário (não um card isolado). Recuamos para
    // "hoje" e avisamos em dev em vez de propagar o crash.
    const dataBase = currentDate instanceof Date && isValid(currentDate) ? currentDate : new Date();
    if (currentDate && dataBase !== currentDate && import.meta.env.DEV) {
      console.warn('[useEventosCalendario] currentDate inválido recebido, usando data atual como fallback', currentDate);
    }

    if (currentView === 'day') {
      return { inicio: dataBase, fim: dataBase };
    } else if (currentView === 'week') {
      return {
        inicio: startOfWeek(dataBase, { weekStartsOn: 0 }),
        fim: endOfWeek(dataBase, { weekStartsOn: 0 })
      };
    } else {
      // Fallback explícito: qualquer view desconhecida (ex: uma futura 'agenda')
      // cai aqui silenciosamente sem isso — deixamos o aviso em dev registrado.
      if (currentView !== 'month' && import.meta.env.DEV) {
        console.warn('[useEventosCalendario] currentView desconhecida, usando range de mês como fallback', currentView);
      }
      return {
        inicio: startOfWeek(startOfMonth(dataBase), { weekStartsOn: 0 }),
        fim: endOfWeek(endOfMonth(dataBase), { weekStartsOn: 0 })
      };
    }
  }, [currentDate, currentView]);

  return useMemo(() => {
    if (!aulasFiltradas.length) return eventosFeriados;

    const eventosGerados = [...eventosFeriados];
    const { inicio, fim } = limitesVisiveis;

    aulasFiltradas.forEach(aula => {
      if (aula.eh_recorrente) {
        eventosGerados.push(...expandirRecorrencia(aula, inicio, fim, feriados, indexes));
      } else if (aula.data_especifica) {
        eventosGerados.push(...expandirEventoUnico(aula, feriados, indexes));
      }
    });

    return eventosGerados;
  }, [aulasFiltradas, limitesVisiveis, eventosFeriados, feriados, indexes]);
}