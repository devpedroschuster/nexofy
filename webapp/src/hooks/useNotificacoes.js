import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { startOfDay } from 'date-fns';
import { useAuth } from './useAuth';
import { storageKey } from '../utils/storage';

const slug = import.meta.env.VITE_APP_SLUG ?? 'app';

// FIX (Bug #2): a chave de localStorage agora inclui o estudioId, evitando
// que "notificações resolvidas" de um estúdio vazem/colidam com outro
// (o isolamento por subdomínio em produção era acidental, não garantido).
function chaveResolvidas(estudioId) {
  return storageKey(slug, `notificacoes_resolvidas:${estudioId ?? 'sem-estudio'}`);
}

export function useNotificacoes() {
  const { estudioId } = useAuth();
  const [resolvidas, setResolvidas] = useState([]);

  // FIX (Bug #3): agora depende de estudioId, recarregando o estado local
  // sempre que o contexto de estúdio mudar.
  useEffect(() => {
    if (!estudioId) return;

    try {
      const salvas = localStorage.getItem(chaveResolvidas(estudioId));
      setResolvidas(salvas ? JSON.parse(salvas) : []);
    } catch {
      // FIX (edge case): JSON corrompido não deve derrubar a tela —
      // apenas reseta o estado local de "resolvidas".
      setResolvidas([]);
    }
  }, [estudioId]);

  // FIX (Bug #1): forma funcional do setState evita perder atualizações
  // quando duas resoluções acontecem em sequência rápida.
  const marcarComoResolvida = (idUnico) => {
    setResolvidas(prev => {
      const novas = [...prev, idUnico];
      localStorage.setItem(chaveResolvidas(estudioId), JSON.stringify(novas));
      return novas;
    });
  };

  const desfazerResolvida = (idUnico) => {
    setResolvidas(prev => {
      const novas = prev.filter(id => id !== idUnico);
      localStorage.setItem(chaveResolvidas(estudioId), JSON.stringify(novas));
      return novas;
    });
  };

  const query = useQuery({
    queryKey: ['notificacoes-gerais', estudioId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alunos')
        .select('id, nome_completo, telefone, data_nascimento, data_fim_plano, planos(nome)')
        .eq('estudio_id', estudioId) // filtro de tenant obrigatório
        .eq('ativo', true);

      if (error) throw error;

      const hoje = startOfDay(new Date());
      const anoAtual = hoje.getFullYear();
      const notificacoes = [];

      data.forEach(aluno => {
        if (aluno.data_fim_plano) {
          const dataFim = startOfDay(new Date(aluno.data_fim_plano + 'T12:00:00'));
          const diasFaltando = Math.ceil((dataFim - hoje) / (1000 * 60 * 60 * 24));

          if (diasFaltando <= 7 && diasFaltando >= -60) {
            notificacoes.push({
              idUnico: `venc-${aluno.id}-${aluno.data_fim_plano}`,
              tipo: 'vencimento',
              aluno,
              dataAlvo: aluno.data_fim_plano,
              diasFaltando
            });
          }
        }

        if (aluno.data_nascimento) {
          const [, mesNasc, diaNasc] = aluno.data_nascimento.split('-');

          // FIX (edge case): aniversariantes de 29/02 em anos não bissextos
          // caíam em 01/03 por overflow do Date. Ajustamos para 28/02 nesse caso.
          const diaAjustado = Number(mesNasc) === 2 && Number(diaNasc) === 29 && !ehBissexto(anoAtual)
            ? 28
            : Number(diaNasc);

          let niverEsteAno = startOfDay(new Date(anoAtual, mesNasc - 1, diaAjustado));
          let diasFaltandoNiver = Math.ceil((niverEsteAno - hoje) / (1000 * 60 * 60 * 24));

          if (diasFaltandoNiver < -20) {
            const diaAjustadoProx = Number(mesNasc) === 2 && Number(diaNasc) === 29 && !ehBissexto(anoAtual + 1)
              ? 28
              : Number(diaNasc);
            niverEsteAno = startOfDay(new Date(anoAtual + 1, mesNasc - 1, diaAjustadoProx));
            diasFaltandoNiver = Math.ceil((niverEsteAno - hoje) / (1000 * 60 * 60 * 24));
          }

          if (diasFaltandoNiver <= 7) {
            notificacoes.push({
              idUnico: `niver-${aluno.id}-${niverEsteAno.getFullYear()}`,
              tipo: 'aniversario',
              aluno,
              dataAlvo: niverEsteAno.toISOString().split('T')[0],
              diasFaltando: diasFaltandoNiver
            });
          }
        }
      });

      return notificacoes.sort((a, b) => a.diasFaltando - b.diasFaltando);
    },
    enabled: !!estudioId,
    staleTime: 1000 * 60 * 5, // notificações não mudam minuto a minuto
  });

  const todasAsNotificacoes = query.data || [];
  const ativas = todasAsNotificacoes.filter(n => !resolvidas.includes(n.idUnico));
  const concluidas = todasAsNotificacoes.filter(n => resolvidas.includes(n.idUnico));

  return {
    ativas,
    concluidas,
    loading: query.isLoading,
    // FIX (edge case): expõe o estado de erro em vez de mascará-lo como "sem notificações".
    error: query.isError ? query.error : null,
    marcarComoResolvida,
    desfazerResolvida,
  };
}

function ehBissexto(ano) {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}