import { useState } from 'react';
import { gradeService } from '../../../services/gradeService';
import { showToast } from '../../../components/shared/Toast';
import { useAuth } from '../../../hooks/useAuth';

export function useFeriados(refetch) {
  const { estudioId } = useAuth();
  const [novoFeriado, setNovoFeriado] = useState({ data: '', descricao: '', bloqueia_agenda: true });
  const [savingFeriado, setSavingFeriado] = useState(false);
  const [feriadoParaExcluir, setFeriadoParaExcluir] = useState(null);

  async function salvarFeriado(e) {
  e.preventDefault();
  if (savingFeriado) return;
  setSavingFeriado(true);
  try {
    await gradeService.cadastrarFeriado({ ...novoFeriado, bloqueia_agenda: true }, estudioId);
    showToast.success("Bloqueio adicionado na agenda!");
    setNovoFeriado({ data: '', descricao: '', bloqueia_agenda: true });
    refetch();
  } catch (err) {
    showToast.error("Erro ao salvar bloqueio.");
  } finally {
    setSavingFeriado(false);
  }
}

  const solicitarExclusao = (id) => setFeriadoParaExcluir(id);
  const cancelarExclusao = () => setFeriadoParaExcluir(null);

  async function confirmarExclusao() {
    if (!feriadoParaExcluir) return;
    try {
      await gradeService.excluirFeriado(feriadoParaExcluir, estudioId);
      showToast.success("Bloqueio removido.");
      refetch();
    } catch (err) {
      showToast.error("Erro ao remover bloqueio.");
    } finally {
      setFeriadoParaExcluir(null);
    }
  }

  return { 
    novoFeriado, setNovoFeriado, savingFeriado, salvarFeriado, 
    feriadoParaExcluir, solicitarExclusao, confirmarExclusao, cancelarExclusao 
  };
}