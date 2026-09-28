// webapp/src/pages/SolicitacoesTitular.jsx
// PED-172 — fila de solicitações de exclusão de dados enviadas por alunos
// (Área do Aluno → "Solicitar exclusão da minha conta"). Exportação não
// aparece aqui: já é self-service e resolvida na hora pela Edge Function.
//
// PED-261 — "Atender" agora anonimiza o aluno de fato (irreversível, por
// isso passa por um modal de confirmação), "Recusar" exige motivo, e o
// histórico mostra quem tratou cada pedido, quando e por quê.
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
import Modal from '../components/ui/Modal';
import Input, { FormField } from '../components/ui/Input';

function formatarData(iso) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
}

export default function SolicitacoesTitular() {
  const { estudioId } = useAuth();
  const { estudioAtivo } = useImpersonation();
  const idEfetivo = estudioAtivo?.id ?? estudioId;
  const queryClient = useQueryClient();

  // { acao: 'atender' | 'recusar', solicitacao }
  const [tratamento, setTratamento] = useState(null);
  const [observacao, setObservacao] = useState('');
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');

  const { data: solicitacoes = [], isLoading, isError } = useQuery({
    queryKey: ['solicitacoes-titular', idEfetivo],
    queryFn: () => solicitacoesTitularService.listarPendentes(idEfetivo),
    enabled: !!idEfetivo,
  });

  const { data: historico = [], isLoading: carregandoHistorico } = useQuery({
    queryKey: ['solicitacoes-titular-historico', idEfetivo],
    queryFn: () => solicitacoesTitularService.listarHistorico(idEfetivo),
    enabled: !!idEfetivo,
  });

  function abrir(acao, solicitacao) {
    setTratamento({ acao, solicitacao });
    setObservacao('');
    setErro('');
  }

  function fechar() {
    if (processando) return;
    setTratamento(null);
  }

  async function confirmar() {
    const { acao, solicitacao } = tratamento;
    if (acao === 'recusar' && !observacao.trim()) {
      setErro('Informe o motivo da recusa.');
      return;
    }

    setProcessando(true);
    setErro('');
    try {
      if (acao === 'atender') {
        await solicitacoesTitularService.atenderExclusao(solicitacao.id, { observacao });
        showToast.success('Dados do aluno anonimizados e solicitação atendida.');
      } else {
        await solicitacoesTitularService.recusar(solicitacao.id, idEfetivo, { observacao });
        showToast.success('Solicitação recusada.');
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['solicitacoes-titular', idEfetivo] }),
        queryClient.invalidateQueries({ queryKey: ['solicitacoes-titular-historico', idEfetivo] }),
      ]);
      setTratamento(null);
    } catch (error) {
      console.error('[SolicitacoesTitular]', error);
      setErro(error?.message || 'Não foi possível atualizar a solicitação.');
    } finally {
      setProcessando(false);
    }
  }

  const atendendo = tratamento?.acao === 'atender';
  const nomeAluno = tratamento?.solicitacao?.alunos?.nome_completo ?? 'este aluno';

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
                <span>Solicitado em {formatarData(s.solicitado_em)}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => abrir('recusar', s)}>
                <X size={14} /> Recusar
              </Button>
              <Button variant="brand" size="sm" onClick={() => abrir('atender', s)}>
                <Check size={14} /> Atender e anonimizar
              </Button>
            </div>
          </Surface>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-black text-foreground">Histórico</h2>
        {carregandoHistorico && <p className="text-muted-foreground font-medium">Carregando...</p>}
        {!carregandoHistorico && historico.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma solicitação tratada ainda.</p>
        )}
        {historico.length > 0 && (
          <Surface variant="card" padding="none" className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Aluno</th>
                  <th className="px-4 py-3 font-semibold">Resultado</th>
                  <th className="px-4 py-3 font-semibold">Solicitado</th>
                  <th className="px-4 py-3 font-semibold">Tratado</th>
                  <th className="px-4 py-3 font-semibold">Por</th>
                  <th className="px-4 py-3 font-semibold">Observação</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.id} className="border-t border-border">
                    <td className="px-4 py-3 font-semibold text-foreground">{h.alunos?.nome_completo ?? 'Aluno removido'}</td>
                    <td className="px-4 py-3">
                      {h.status === 'atendida'
                        ? <Badge variant="soft" tone="success">Anonimizado</Badge>
                        : <Badge variant="soft" tone="neutral">Recusado</Badge>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatarData(h.solicitado_em)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatarData(h.atendido_em)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{h.atendido_por_email ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{h.observacao ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Surface>
        )}
      </section>

      <Modal
        aberto={!!tratamento}
        fechar={fechar}
        title={atendendo ? 'Atender e anonimizar' : 'Recusar solicitação'}
        size="md"
        footer={(
          <>
            <Button variant="outline" onClick={fechar} disabled={processando}>Cancelar</Button>
            <Button
              variant={atendendo ? 'destructive' : 'brand'}
              loading={processando}
              onClick={confirmar}
            >
              {atendendo ? 'Anonimizar dados' : 'Recusar solicitação'}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          {atendendo ? (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Os dados pessoais de <strong className="text-foreground">{nomeAluno}</strong> serão
                removidos de forma <strong className="text-foreground">irreversível</strong>: nome, contato,
                CPF, endereço, dados de saúde, foto, campos personalizados e o acesso ao app.
              </p>
              <p>
                Mensalidades e presenças já registradas continuam no sistema, sem identificação, por
                obrigação fiscal do estúdio. Reservas futuras são canceladas.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              A recusa fica registrada com o motivo informado. Use quando houver base legal para manter
              os dados (ex.: cobrança em aberto ou obrigação legal).
            </p>
          )}

          <FormField
            label={atendendo ? 'Observação (opcional)' : 'Motivo da recusa'}
            htmlFor="observacao-solicitacao"
            required={!atendendo}
          >
            <Input
              as="textarea"
              rows={3}
              id="observacao-solicitacao"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              disabled={processando}
            />
          </FormField>

          {erro && (
            <p role="alert" className="text-sm font-medium text-destructive">{erro}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
