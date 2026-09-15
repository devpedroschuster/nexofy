import React, { useState } from 'react';
import { Calendar, AlertTriangle, Clock3, X } from 'lucide-react';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { classificarFollowup } from '../../lib/funilLeads';
import { formatarDataHora } from '../../lib/utils';

function paraInputLocal(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const BADGE_POR_CLASSIFICACAO = {
  atrasado: { tone: 'destructive', label: 'Atrasado', icon: <AlertTriangle size={13} /> },
  hoje: { tone: 'warning', label: 'Hoje', icon: <Clock3 size={13} /> },
  agendado: { tone: 'info', label: 'Agendado', icon: <Calendar size={13} /> },
};

export default function FollowupLead({ lead, onSalvar, isSalvando }) {
  const [editando, setEditando] = useState(false);
  const [data, setData] = useState(() => paraInputLocal(lead.proximo_followup_em));
  const [nota, setNota] = useState(lead.nota_followup || '');

  // Resincroniza `data`/`nota` quando o follow-up do lead muda por fora
  // (ex.: outro admin edita e o cache deste componente é atualizado por um
  // refetch em segundo plano). Ajuste feito durante o render, não em
  // useEffect, para não deixar o badge mostrar um valor desatualizado por
  // um frame — mesmo racional de `ObservacaoLead` em `Leads.jsx`. Só
  // resincroniza fora do modo de edição: com `editando` true, um refetch em
  // segundo plano não deve apagar silenciosamente uma edição em andamento.
  const [ultimoFollowup, setUltimoFollowup] = useState({
    proximoFollowupEm: lead.proximo_followup_em,
    notaFollowup: lead.nota_followup,
  });
  if (
    !editando &&
    (lead.proximo_followup_em !== ultimoFollowup.proximoFollowupEm ||
      lead.nota_followup !== ultimoFollowup.notaFollowup)
  ) {
    setUltimoFollowup({
      proximoFollowupEm: lead.proximo_followup_em,
      notaFollowup: lead.nota_followup,
    });
    setData(paraInputLocal(lead.proximo_followup_em));
    setNota(lead.nota_followup || '');
  }

  const classificacao = classificarFollowup(lead.proximo_followup_em);

  function salvar() {
    const proximoFollowupEm = data ? new Date(data).toISOString() : null;
    setEditando(false);
    onSalvar(lead.id, { proximoFollowupEm, notaFollowup: nota.trim() || null });
  }

  function limpar() {
    setData('');
    setNota('');
    setEditando(false);
    onSalvar(lead.id, { proximoFollowupEm: null, notaFollowup: null });
  }

  if (editando) {
    return (
      <div className="mt-2 space-y-2 rounded-xl border border-border bg-muted p-3">
        <input
          type="datetime-local"
          value={data}
          onChange={(e) => setData(e.target.value)}
          className="w-full text-xs font-bold text-foreground bg-card border border-border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <textarea
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ex: ligar depois das 18h, esperando resposta..."
          rows={2}
          className="w-full text-xs font-medium text-foreground bg-card border border-border rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground placeholder:italic"
        />
        <div className="flex gap-2">
          <Button variant="info" size="sm" fullWidth onClick={salvar} disabled={!data}>Salvar</Button>
          <Button variant="ghost" size="sm" onClick={() => setEditando(false)}>Cancelar</Button>
        </div>
      </div>
    );
  }

  if (!lead.proximo_followup_em) {
    return (
      <button
        onClick={() => setEditando(true)}
        className="mt-2 w-full flex items-center justify-center gap-2 text-xs font-bold text-muted-foreground hover:text-primary transition-colors py-1.5 rounded-lg hover:bg-primary/5 border border-dashed border-border"
      >
        <Calendar size={13} /> Agendar follow-up
      </button>
    );
  }

  const badge = BADGE_POR_CLASSIFICACAO[classificacao];

  return (
    <div className="mt-2 flex items-center justify-between gap-2">
      <button onClick={() => setEditando(true)} title={lead.nota_followup || ''} className="flex-1 text-left">
        <Badge tone={badge.tone} variant="soft" className="cursor-pointer">
          {badge.icon} {badge.label === 'Agendado' ? `Agendado: ${formatarDataHora(lead.proximo_followup_em)}` : badge.label}
        </Badge>
      </button>
      <button
        onClick={limpar}
        disabled={isSalvando}
        title="Remover follow-up"
        className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
      >
        <X size={14} />
      </button>
    </div>
  );
}
