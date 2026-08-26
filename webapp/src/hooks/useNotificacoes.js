// webapp/src/hooks/useNotificacoes.js
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { startOfDay } from 'date-fns';
import { useAuth } from './useAuth';
import { useImpersonation } from '../context/ImpersonationContext';
import { storageKey } from '../utils/storage';

const slug = import.meta.env.VITE_APP_SLUG ?? 'app';

function chaveResolvidas(estudioId) {
  return storageKey(slug, `notificacoes_resolvidas:${estudioId ?? 'sem-estudio'}`);
}

function lerResolvidas(idEfetivo) {
  if (!idEfetivo) return [];
  try {
    const salvas = localStorage.getItem(chaveResolvidas(idEfetivo));
    return salvas ? JSON.parse(salvas) : [];
  } catch {
    return [];
  }
}

export function useNotificacoes() {
  const { estudioId } = useAuth();
  const { estudioAtivo } = useImpersonation();
  const idEfetivo = estudioAtivo?.id ?? estudioId; // FIX: super_admin em impersonation agora funciona

  const [resolvidas, setResolvidas] = useState(() => lerResolvidas(idEfetivo));
  // Reidrata `resolvidas` a partir do localStorage sempre que o estúdio
  // efetivo mudar (troca de impersonation, login). Ajuste feito durante o
  // render (em vez de em useEffect) para evitar o flash de `resolvidas`
  // vazio entre o mount e a primeira leitura.
  const [idEfetivoCarregado, setIdEfetivoCarregado] = useState(idEfetivo);
  if (idEfetivo !== idEfetivoCarregado) {
    setIdEfetivoCarregado(idEfetivo);
    setResolvidas(lerResolvidas(idEfetivo));
  }

  function persistirResolvidas(novas) {
    // FIX: setItem agora protegido — quota excedida / modo privado não quebra o clique do usuário
    try {
      localStorage.setItem(chaveResolvidas(idEfetivo), JSON.stringify(novas));
    } catch (e) {
      console.error('Falha ao persistir notificações resolvidas:', e);
    }
  }

  const marcarComoResolvida = (idUnico) => {
    setResolvidas(prev => {
      const novas = [...prev, idUnico];
      persistirResolvidas(novas);
      return novas;
    });
  };

  const desfazerResolvida = (idUnico) => {
    setResolvidas(prev => {
      const novas = prev.filter(id => id !== idUnico);
      persistirResolvidas(novas);
      return novas;
    });
  };

  const query = useQuery({
    queryKey: ['notificacoes-gerais', idEfetivo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('alunos')
        // FIX: removido `telefone` — PII não usada nesta tela, sem motivo pra trafegar
        .select('id, nome_completo, data_nascimento, data_fim_plano, planos(nome)')
        .eq('estudio_id', idEfetivo)
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
    enabled: !!idEfetivo,
    staleTime: 1000 * 60 * 5,
  });

  const todasAsNotificacoes = query.data || [];
  const ativas = todasAsNotificacoes.filter(n => !resolvidas.includes(n.idUnico));
  const concluidas = todasAsNotificacoes.filter(n => resolvidas.includes(n.idUnico));

  return {
    ativas,
    concluidas,
    loading: query.isPending, // FIX: isPending é o nome correto no v5 pra "primeira carga sem dados"
    error: query.isError ? query.error : null,
    marcarComoResolvida,
    desfazerResolvida,
  };
}

function ehBissexto(ano) {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
}