import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, RefreshCw, Sparkles, Phone, Calendar, MessageSquare, CheckCircle, XCircle } from 'lucide-react';
import Badge from '../ui/Badge';
import { ESTAGIOS_FUNIL } from '../../lib/funilLeads';

const ICONE_POR_ESTAGIO = {
  novo: <Sparkles size={13} />,
  contatado: <Phone size={13} />,
  aula_agendada: <Calendar size={13} />,
  negociacao: <MessageSquare size={13} />,
  convertido: <CheckCircle size={13} />,
  perdido: <XCircle size={13} />,
};

export default function EstagioDropdown({ lead, onAlterarEstagio, isProcessando }) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClickFora(e) {
      if (ref.current && !ref.current.contains(e.target)) setAberto(false);
    }
    if (aberto) document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, [aberto]);

  const atual = ESTAGIOS_FUNIL.find(e => e.valor === lead.status_conversao) ?? ESTAGIOS_FUNIL[0];

  if (isProcessando) {
    return (
      <Badge tone={atual.tone} variant="soft">
        <RefreshCw size={12} className="animate-spin" /> {atual.label}
      </Badge>
    );
  }

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setAberto(v => !v)}
        title="Alterar estágio"
        className="flex items-center gap-1 focus:outline-none group"
      >
        <Badge tone={atual.tone} variant="soft" className="cursor-pointer group-hover:opacity-80 transition-opacity">
          {ICONE_POR_ESTAGIO[atual.valor]} {atual.label}
          <ChevronDown size={11} className={`ml-0.5 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </Badge>
      </button>

      {aberto && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-card border border-border rounded-xl shadow-card overflow-hidden min-w-[170px] animate-in fade-in zoom-in-95">
          {ESTAGIOS_FUNIL.map(({ valor, label, tone }) => (
            <button
              key={valor}
              disabled={valor === lead.status_conversao}
              onClick={() => {
                setAberto(false);
                onAlterarEstagio(lead.id, valor);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-bold text-left transition-colors
                ${valor === lead.status_conversao
                  ? 'opacity-40 cursor-default bg-muted'
                  : 'hover:bg-muted cursor-pointer'
                }`}
            >
              <Badge tone={tone} variant="soft" className="pointer-events-none">
                {ICONE_POR_ESTAGIO[valor]} {label}
              </Badge>
              {valor === lead.status_conversao && (
                <span className="ml-auto text-[10px] font-black text-muted-foreground uppercase tracking-wide">atual</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
