import { useState } from 'react';
import { gradeService } from '../../../services/gradeService';
import { showToast } from '../../../components/shared/Toast';
import { useAuth } from '../../../hooks/useAuth';
import { useImpersonation } from '../../../context/ImpersonationContext';

export function useFeriados(refetch) {
  const { estudioId } = useAuth();
  // FIX (PED-101): mesmo padrão de idEfetivo do restante do app.
  const { estudioAtivo } = useImpersonation();
  const idEfetivo = estudioAtivo?.id ?? estudioId;
  const [novoFeriado, setNovoFeriado] = useState({ data: '', descricao: '', bloqueia_agenda: true });
  const [savingFeriado, setSavingFeriado] = useState(false);
  const [feriadoParaExcluir, setFeriadoParaExcluir] = useState(null);

  async function salvarFeriado(e) {
    e.preventDefault();
    if (savingFeriado) return;

    // Guard defensivo: sem estudioId (ex: sessão ainda resolvendo no primeiro
    // render), não tenta gravar — evita insert com estudio_id undefined.
    if (!idEfetivo) {
      showToast.error("Sessão ainda carregando, tente novamente em instantes.");
      return;
    }

    // Validação no próprio hook: os <Input required min={hoje}> do form já
    // cobrem o fluxo normal, mas quem fala com o banco (e dispara a limpeza
    // de presenca/leads abaixo) é este hook — não deve confiar só na UI.
    const dataLimpa = novoFeriado.data?.trim();
    const descricaoLimpa = novoFeriado.descricao?.trim();
    if (!dataLimpa || !descricaoLimpa) {
      showToast.error("Informe data e motivo do bloqueio.");
      return;
    }

    setSavingFeriado(true);
    try {
      await gradeService.cadastrarFeriado(
        { ...novoFeriado, data: dataLimpa, descricao: descricaoLimpa, bloqueia_agenda: true },
        idEfetivo
      );
      // Aviso honesto: cadastrarFeriado(bloqueia_agenda=true) também apaga
      // presenca/leads existentes nessa data — o usuário precisa saber disso,
      // não só que "um bloqueio foi adicionado".
      showToast.success("Bloqueio adicionado! Agendamentos existentes nessa data foram removidos.");
      setNovoFeriado({ data: '', descricao: '', bloqueia_agenda: true });
      refetch();
    } catch (err) {
      console.error('[useFeriados] erro ao salvar feriado', err);
      showToast.error("Erro ao salvar bloqueio.");
    } finally {
      setSavingFeriado(false);
    }
  }

  const solicitarExclusao = (id) => setFeriadoParaExcluir(id);
  const cancelarExclusao = () => setFeriadoParaExcluir(null);

  async function confirmarExclusao() {
    if (feriadoParaExcluir === null) return;
    if (!idEfetivo) {
      showToast.error("Sessão ainda carregando, tente novamente em instantes.");
      return;
    }
    try {
      await gradeService.excluirFeriado(feriadoParaExcluir, idEfetivo);
      showToast.success("Bloqueio removido.");
      refetch();
    } catch (err) {
      console.error('[useFeriados] erro ao excluir feriado', err);
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