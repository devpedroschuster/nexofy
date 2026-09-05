import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { presencaService } from '../../../services/presencaService';
import { useAuth } from '../../../hooks/useAuth';
import { useImpersonation } from '../../../context/ImpersonationContext';
import { useDebounce } from '../../../hooks/useDebounce';
import { showToast } from '../../../components/shared/Toast';

// Monta o payload de mutação de presença (check-in ou falta) a partir da
// linha exibida na chamada. Extraída como função pura (mesmo padrão de
// useSWUpdateNotifier.js) para poder ser testada sem precisar renderizar
// o hook.
export function montarPayloadPresenca(aluno, aulaId, dataAula) {
  return {
    presencaId: aluno.registroExiste ? aluno.id_relacao : null,
    alunoId: aluno.aluno_id,
    aulaId,
    dataAula,
    origem: aluno.tipo === 'fixo' ? 'fixo' : 'avulso',
  };
}

// Deriva o estado visual da chamada (Modo Kiosk) a partir da linha do
// aluno. `status` sozinho não basta: presencaService.listarChamadaCompleta
// retorna status:'presente' por convenção pra um fixo sem registro do dia
// (ver comentário do service), o que não é uma confirmação real de
// presença — só `registroExiste` diz se a linha existe de fato. Sem essa
// distinção, o toggle mostraria "Presente" já marcado pra todo fixo antes
// de o professor tocar em qualquer coisa, escondendo quem ainda falta
// confirmar.
export function deriveEstadoChamada(aluno) {
  if (aluno.status === 'falta_justificada' || aluno.status === 'falta_nao_avisada') {
    return 'falta';
  }
  if (aluno.registroExiste && aluno.status === 'presente') {
    return 'presente';
  }
  return 'pendente';
}

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
  const [processandoAcaoId, setProcessandoAcaoId] = useState(null);
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
    if (processandoAcaoId === aluno.id_relacao) return; // guard duplo-clique
    // Usa dataListaDebounced, não dataLista bruto: a lista exibida (e o aluno
    // clicado) correspondem sempre à data debounced. Usar dataLista aqui
    // podia gravar a falta contra uma data diferente da que está na tela,
    // caso o usuário tivesse acabado de digitar uma nova data no input.
    if (!dataListaDebounced) return;
    setProcessandoAcaoId(aluno.id_relacao);
    try {
      await presencaService.registrarFalta(
        montarPayloadPresenca(aluno, aulaParaLista.id, dataListaDebounced),
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
      setProcessandoAcaoId(null);
    }
  };

  // Modo Kiosk: marca presença explícita (Presente). Reaproveita
  // presencaService.registrarCheckin, que já existia mas não tinha nenhum
  // botão na UI chamando-o — sem essa chamada explícita, um aluno fixo que
  // apenas comparece nunca ganha uma linha em `presencas`, então as métricas
  // de "Presentes Hoje"/distribuição semanal (Presenca.jsx) o ignoravam.
  const handleMarcarPresente = async (aluno) => {
    if (processandoAcaoId === aluno.id_relacao) return; // guard duplo-clique
    if (!dataListaDebounced) return;
    setProcessandoAcaoId(aluno.id_relacao);
    try {
      await presencaService.registrarCheckin(
        montarPayloadPresenca(aluno, aulaParaLista.id, dataListaDebounced),
        idEfetivo,
        sessao?.user?.id
      );
      showToast.success("Presença confirmada.");
      invalidarTudo();
    } catch (err) {
      console.error('[useListaPresenca] erro ao marcar presença', err);
      showToast.error("Erro ao confirmar presença.");
    } finally {
      setProcessandoAcaoId(null);
    }
  };

  const handleDesfazerFalta = async (aluno) => {
    if (processandoAcaoId === aluno.id_relacao) return; // guard duplo-clique
    setProcessandoAcaoId(aluno.id_relacao);
    try {
      await presencaService.removerFalta(aluno.id_relacao, idEfetivo);
      showToast.success("Falta removida.");
      invalidarTudo();
    } catch (err) {
      console.error('[useListaPresenca] erro ao remover falta', err);
      showToast.error("Erro ao remover falta.");
    } finally {
      setProcessandoAcaoId(null);
    }
  };

  return {
    listaPresenca, loadingLista, erroLista, removendoId,
    processandoAcaoId,
    handleRegistrarFalta, handleDesfazerFalta, handleMarcarPresente,
    alunoParaRemover, solicitarRemocao, confirmarRemocao, cancelarRemocao,
    triggerRefresh, // BUG #8: era refreshKey (estado bruto) — agora só a função
  };
}