import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { presencaService } from '../../../services/presencaService';
import { useAuth } from '../../../hooks/useAuth';
import { showToast } from '../../../components/shared/Toast';

export function useListaPresenca(aulaParaLista, dataLista, isOpen, onAtualizar) {
  const { estudioId, sessao } = useAuth();
  const [listaPresenca, setListaPresenca] = useState([]);
  const queryClient = useQueryClient();
  const [loadingLista, setLoadingLista] = useState(false);
  const [removendoId, setRemovendoId] = useState(null);
  const [alunoParaRemover, setAlunoParaRemover] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function buscarLista() {
      if (isOpen && aulaParaLista && dataLista && estudioId) {
        setLoadingLista(true);
        try {
          const presencas = await presencaService.listarChamadaCompleta(
            aulaParaLista.id,
            dataLista,
            estudioId
          );
          setListaPresenca(presencas || []);
        } finally {
          setLoadingLista(false);
        }
      }
    }
    buscarLista();
  }, [isOpen, aulaParaLista, dataLista, estudioId, refreshKey]);

  const invalidarTudo = () => {
    queryClient.invalidateQueries({ queryKey: ['agenda', 'dadosMes'] });
    setRefreshKey(old => old + 1);
    if (onAtualizar) onAtualizar();
  };

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
    listaPresenca, loadingLista, removendoId,
    handleRegistrarFalta, handleDesfazerFalta,
    alunoParaRemover, solicitarRemocao, confirmarRemocao, cancelarRemocao, refreshKey
  };
}