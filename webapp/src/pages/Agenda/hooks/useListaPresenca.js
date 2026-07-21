import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { presencaService } from '../../../services/presencaService';
import { useAuth } from '../../../hooks/useAuth';
import { useDebounce } from '../../../hooks/useDebounce';
import { showToast } from '../../../components/shared/Toast';

export function useListaPresenca(aulaParaLista, dataLista, isOpen, onAtualizar) {
  const { estudioId, sessao } = useAuth();
  const [listaPresenca, setListaPresenca] = useState([]);
  const queryClient = useQueryClient();
  const [loadingLista, setLoadingLista] = useState(false);
  const [removendoId, setRemovendoId] = useState(null);
  const [alunoParaRemover, setAlunoParaRemover] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [erroLista, setErroLista] = useState(null);

  // Bug #9: debounce de 400ms evita disparar a query a cada keystroke enquanto
  // o usuário digita dia/mês/ano no input[type="date"].
  const dataListaDebounced = useDebounce(dataLista, 400);

  useEffect(() => {
    let cancelado = false; // Bug #3: proteção contra unmount (memory leak)

    async function buscarLista() {
      if (isOpen && aulaParaLista && dataListaDebounced && estudioId) {
        setLoadingLista(true);
        setErroLista(null);
        try {
          const presencas = await presencaService.listarChamadaCompleta(
            aulaParaLista.id,
            dataListaDebounced,
            estudioId
          );
          if (!cancelado) {
            setListaPresenca(presencas || []);
          }
        } catch (err) {
          if (!cancelado) {
            setErroLista('Não foi possível carregar a lista. Tente novamente.');
            setListaPresenca([]);
          }
        } finally {
          if (!cancelado) setLoadingLista(false);
        }
      }
    }
    buscarLista();
    return () => { cancelado = true; }; // cleanup: evita setState após desmonte
  // BUG #13 fix: sessao adicionada ao array de dependências — se a sessão
  // expirar/renovar com o modal aberto, o effect reexecuta com o userId atualizado.
  }, [isOpen, aulaParaLista, dataListaDebounced, estudioId, refreshKey, sessao]);

  const invalidarTudo = () => {
    // BUG #6 fix: prefixo ['agenda'] cobre toda a árvore de cache da agenda,
    // incluindo ['agenda', estudioId, 'dadosMes', inicio, fim] de useAgendaDadosMes.
    queryClient.invalidateQueries({ queryKey: ['agenda'] });
    setRefreshKey(old => old + 1);
    if (onAtualizar) onAtualizar();
  };

  // BUG #8: expõe triggerRefresh em vez do estado bruto refreshKey.
  // refreshKey é um detalhe de implementação interno — consumidores só precisam
  // de uma função para disparar o recarregamento.
  const triggerRefresh = () => setRefreshKey(k => k + 1);

  const solicitarRemocao = (idRelacao) => setAlunoParaRemover(idRelacao);
  const cancelarRemocao = () => setAlunoParaRemover(null);

  // Remove um agendamento avulso/lead da lista (não se aplica a fixos,
  // que nunca têm uma linha "removível" — o botão correspondente para
  // fixos é Informar/Desfazer Falta, tratado abaixo).
  const confirmarRemocao = async () => {
    if (!alunoParaRemover) return;
    setRemovendoId(alunoParaRemover);
    try {
      await presencaService.cancelarAgendamento(alunoParaRemover, estudioId);
      showToast.success("Aluno removido da lista!");
      invalidarTudo();
    } catch (err) {
      showToast.error("Erro ao remover: " + err.message);
    } finally {
      setRemovendoId(null);
      setAlunoParaRemover(null);
    }
  };

  // tipoFalta: 'justificada' | 'nao_avisada'
  const handleRegistrarFalta = async (aluno, tipoFalta = 'justificada') => {
    try {
      await presencaService.registrarFalta(
        {
          presencaId: aluno.registroExiste ? aluno.id_relacao : null,
          alunoId: aluno.aluno_id,
          aulaId: aulaParaLista.id,
          dataAula: dataLista,
          origem: aluno.tipo === 'fixo' ? 'fixo' : 'avulso',
        },
        tipoFalta,
        estudioId,
        sessao?.user?.id
      );
      showToast.success("Falta informada.");
      invalidarTudo();
    } catch (err) {
      showToast.error("Erro ao registrar falta.");
    }
  };

  const handleDesfazerFalta = async (aluno) => {
    try {
      await presencaService.removerFalta(aluno.id_relacao, estudioId);
      showToast.success("Falta removida.");
      invalidarTudo();
    } catch (err) {
      showToast.error("Erro ao remover falta.");
    }
  };

  return {
    listaPresenca, loadingLista, erroLista, removendoId,
    handleRegistrarFalta, handleDesfazerFalta,
    alunoParaRemover, solicitarRemocao, confirmarRemocao, cancelarRemocao,
    triggerRefresh, // BUG #8: era refreshKey (estado bruto) — agora só a função
  };
}