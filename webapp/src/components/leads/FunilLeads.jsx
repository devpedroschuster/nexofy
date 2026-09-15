import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useLeadsFunil, useAtualizarStatusLead, useAtualizarFollowupLead } from '../../hooks/useLeads';
import { showToast } from '../shared/Toast';
import { ESTAGIOS_FUNIL } from '../../lib/funilLeads';
import Surface from '../ui/Surface';
import EmptyState from '../ui/EmptyState';
import EstagioDropdown from './EstagioDropdown';
import FollowupLead from './FollowupLead';

export default function FunilLeads() {
  const { data: leads = [], isLoading } = useLeadsFunil();
  const mutationEstagio = useAtualizarStatusLead();
  const mutationFollowup = useAtualizarFollowupLead();

  function alterarEstagio(leadId, novoEstagio) {
    mutationEstagio.mutate({ id: leadId, status: novoEstagio }, {
      onSuccess: () => showToast.success('Estágio atualizado.'),
    });
  }

  function salvarFollowup(leadId, { proximoFollowupEm, notaFollowup }) {
    mutationFollowup.mutate({ id: leadId, proximoFollowupEm, notaFollowup });
  }

  const isProcessandoEstagio = (id) => mutationEstagio.isPending && mutationEstagio.variables?.id === id;
  const isSalvandoFollowup = (id) => mutationFollowup.isPending && mutationFollowup.variables?.id === id;

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <RefreshCw className="animate-spin text-primary" size={40} />
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <EmptyState
        icon={<RefreshCw size={28} />}
        title="Nenhum lead ainda"
        description="Quando novos leads chegarem, eles aparecem aqui organizados por estágio do funil."
      />
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {ESTAGIOS_FUNIL.map(({ valor, label }) => {
        const leadsDoEstagio = leads.filter(l => l.status_conversao === valor);
        return (
          <div key={valor} className="flex-shrink-0 w-72">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-xs font-black uppercase tracking-wide text-muted-foreground">{label}</h3>
              <span className="text-xs font-black text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                {leadsDoEstagio.length}
              </span>
            </div>
            <div className="space-y-3">
              {leadsDoEstagio.map(lead => (
                <Surface key={lead.id} variant="card" padding="md" className="flex flex-col">
                  <p className="font-black text-foreground text-sm leading-tight">{lead.nome_visitante}</p>
                  <p className="text-xs font-medium text-muted-foreground mt-0.5">
                    {lead.telefone_visitante || 'Sem telefone'}
                  </p>
                  {lead.agenda?.atividade && (
                    <p className="text-[11px] font-bold text-muted-foreground mt-1">{lead.agenda.atividade}</p>
                  )}
                  <div className="mt-2">
                    <EstagioDropdown
                      lead={lead}
                      onAlterarEstagio={alterarEstagio}
                      isProcessando={isProcessandoEstagio(lead.id)}
                    />
                  </div>
                  <FollowupLead
                    lead={lead}
                    onSalvar={salvarFollowup}
                    isSalvando={isSalvandoFollowup(lead.id)}
                  />
                </Surface>
              ))}
              {leadsDoEstagio.length === 0 && (
                <p className="text-xs font-medium text-muted-foreground italic px-1">Nenhum lead neste estágio.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
