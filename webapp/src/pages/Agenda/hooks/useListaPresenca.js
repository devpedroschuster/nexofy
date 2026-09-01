import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { presencaService } from '../../../services/presencaService';
import { useAuth } from '../../../hooks/useAuth';
import { useImpersonation } from '../../../context/ImpersonationContext';
import { useDebounce } from '../../../hooks/useDebounce';
import { showToast } from '../../../components/shared/Toast';

export function useListaPresenca(aulaParaLista, dataLista, isOpen, onAtualizar) {
  const { estudioId, sessao } = useAuth();
  // FIX (PED-101): mesmo padrão de idEfetivo do restante do app — sem isso,
  // a chamada/lista de presença nunca disparava durante impersonation.
  const { estudioAtivo } = useImpersonation();
  const idEfetivo = estudioAtivo?.id ?? estudioId;
  const [listaPresenca, setListaPresenca] = useState([]);
  const queryClient = useQueryClient();
  const [loadingLista, setLoadingLista] = useState(false);
  const [removendoId, setRemovendoId] = useState(null);
  const [processandoFaltaId, setProcessandoFaltaId] = useState(null);
  const [alunoParaRemover, setAlunoParaRemover] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [erroLista, setErroLista] = useState(null);

  // Bug #9: debounce de 400ms evita disparar a query a cada keystroke enquanto
  // o usuário digita dia/mês/ano no input[type="date"].
  const dataListaDebounced = useDebounce(dataLista, 400);

  useEffect(() => {
    let cancelado = false; // Bug #3: proteção contra unmount (memory leak)

    async function buscarLista() {
      if (isOpen && aulaParaLista && dataListaDebounced && idEfetivo) {
        setLoadingLista(true);
        setErroLista(null);
        try {
          const presencas = await presencaService.listarChamadaCompleta(
            aulaParaLista.id,
            dataListaDebounced,
            idEfetivo
          );
          if (!cancelado) {
            setListaPresenca(presencas || []);
          }
        } catch (err) {
          if (!cancelado) {
            console.error('[useListaPresenca] erro ao carregar lista', err);
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
  }, [isOpen, aulaParaLista, dataListaDebounced, idEfetivo, refreshKey, sessao]);

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
    if (alunoParaRemover === null) return;
    setRemovendoId(alunoParaRemover);
    try {
      await presencaService.cancelarAgendamento(alunoParaRemover, idEfetivo);
      showToast.success("Aluno removido da lista!");
      invalidarTudo();
    } catch (err) {
      console.error('[useListaPresenca] erro ao remover agendamento', err);
      showToast.error("Erro ao remover. Tente novamente.");
    } finally {
      setRemovendoId(null);
      setAlunoParaRemover(null);
    }
  };

  // tipoFalta: 'justificada' | 'nao_avisada'
  const handleRegistrarFalta = async (aluno, tipoFalta = 'justificada') => {
    if (processandoFaltaId === aluno.id_relacao) return; // guard duplo-clique
    // Usa dataListaDebounced, não dataLista bruto: a lista exibida (e o aluno
    // clicado) correspondem sempre à data debounced. Usar dataLista aqui
    // podia gravar a falta contra uma data diferente da que está na tela,
    // caso o usuário tivesse acabado de digitar uma nova data no input.
    if (!dataListaDebounced) return;
    setProcessandoFaltaId(aluno.id_relacao);
    try {
      await presencaService.registrarFalta(
        {
          presencaId: aluno.registroExiste ? aluno.id_relacao : null,
          alunoId: aluno.aluno_id,
          aulaId: aulaParaLista.id,
          dataAula: dataListaDebounced,
          origem: aluno.tipo === 'fixo' ? 'fixo' : 'avulso',
        },
        tipoFalta,
        idEfetivo,
        sessao?.user?.id
      );
      showToast.success("Falta informada.");
      invalidarTudo();
    } catch (err) {
      console.error('[useListaPresenca] erro ao registrar falta', err);
      showToast.error("Erro ao registrar falta.");
    } finally {
      setProcessandoFaltaId(null);
    }
  };

  const handleDesfazerFalta = async (aluno) => {
    if (processandoFaltaId === aluno.id_relacao) return; // guard duplo-clique
    setProcessandoFaltaId(aluno.id_relacao);
    try {
      await presencaService.removerFalta(aluno.id_relacao, idEfetivo);
      showToast.success("Falta removida.");
      invalidarTudo();
    } catch (err) {
      console.error('[useListaPresenca] erro ao remover falta', err);
      showToast.error("Erro ao remover falta.");
    } finally {
      setProcessandoFaltaId(null);
    }
  };

  return {
    listaPresenca, loadingLista, erroLista, removendoId,
    processandoFaltaId,
    handleRegistrarFalta, handleDesfazerFalta,
    alunoParaRemover, solicitarRemocao, confirmarRemocao, cancelarRemocao,
    triggerRefresh, // BUG #8: era refreshKey (estado bruto) — agora só a função
  };
}