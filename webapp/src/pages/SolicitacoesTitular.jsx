// webapp/src/pages/SolicitacoesTitular.jsx
// PED-172 — fila de solicitações de exclusão de dados enviadas por alunos
// (Área do Aluno → "Solicitar exclusão da minha conta"). Exportação não
// aparece aqui: já é self-service e resolvida na hora pela Edge Function.
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, Check, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useImpersonation } from '../context/ImpersonationContext';
import { solicitacoesTitularService } from '../services/solicitacoesTitularService';
import { showToast } from '../components/shared/Toast';
import Surface from '../components/ui/Surface';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import Badge from '../components/ui/Badge';

export default function SolicitacoesTitular() {
  const { estudioId } = useAuth();
  const { estudioAtivo } = useImpersonation();
  const idEfetivo = estudioAtivo?.id ?? estudioId;
  const queryClient = useQueryClient();
  const [processandoId, setProcessandoId] = useState(null);

  const { data: solicitacoes = [], isLoading, isError } = useQuery({
    queryKey: ['solicitacoes-titular', idEfetivo],
    queryFn: () => solicitacoesTitularService.listarPendentes(idEfetivo),
    enabled: !!idEfetivo,
  });

  async function tratar(acao, solicitacao) {
    setProcessandoId(solicitacao.id);
    try {
      if (acao === 'atender') {
        await solicitacoesTitularService.atender(solicitacao.id, idEfetivo);
        showToast.success('Solicitação marcada como atendida.');
      } else {
        await solicitacoesTitularService.recusar(solicitacao.id, idEfetivo);
        showToast.success('Solicitação marcada como recusada.');
      }
      await queryClient.invalidateQueries({ queryKey: ['solicitacoes-titular', idEfetivo] });
    } catch (error) {
      console.error('[SolicitacoesTitular]', error);
      showToast.error('Não foi possível atualizar a solicitação.');
    } finally {
      setProcessandoId(null);
    }
  }

  return (
    <div className="p-8 space-y-8 animate-in fade-in">
      <div>
        <h1 className="text-3xl font-black text-foreground">Solicitações de Titular (LGPD)</h1>
        <p className="text-muted-foreground">
          Pedidos de exclusão de dados enviados diretamente pelo aluno. Trate dentro do SLA
          informado na Política de Privacidade (15 dias corridos).
        </p>
      </div>

      {isLoading && <p className="text-muted-foreground font-medium">Carregando...</p>}
      {isError && (
        <p className="text-destructive font-medium">Erro ao carregar solicitações. Tente recarregar a página.</p>
      )}

      {!isLoading && !isError && solicitacoes.length === 0 && (
        <EmptyState
          icon={<ShieldAlert size={32} />}
          title="Nenhuma solicitação pendente"
          description="Pedidos de exclusão de dados enviados por alunos aparecerão aqui."
        />
      )}

      <div className="space-y-3">
        {solicitacoes.map((s) => (
          <Surface key={s.id} variant="card" padding="lg" className="flex items-center justify-between gap-4">
            <div>
              <p className="font-black text-foreground">{s.alunos?.nome_completo ?? 'Aluno removido'}</p>
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-2 mt-1">
                <Badge variant="soft" tone="destructive">Exclusão de dados</Badge>
                <span>Solicitado em {new Date(s.solicitado_em).toLocaleDateString('pt-BR')}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                loading={processandoId === s.id}
                onClick={() => tratar('recusar', s)}
              >
                <X size={14} /> Recusar
              </Button>
              <Button
                variant="brand"
                size="sm"
                loading={processandoId === s.id}
                onClick={() => tratar('atender', s)}
              >
                <Check size={14} /> Marcar como atendida
              </Button>
            </div>
          </Surface>
        ))}
      </div>
    </div>
  );
}
