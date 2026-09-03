// webapp/src/components/shared/TrialBanner.jsx
//
// Banner discreto com os dias restantes do trial de 14 dias (PED-105),
// visível do dia 1 ao dia 14. Só aparece pro admin do estúdio — é quem
// decide sobre upgrade, professores/alunos não precisam ver. Fica em
// fluxo normal (não fixed): nunca coexiste com BannerImpersonation, já
// que impersonation é sempre perfil 'super_admin', nunca 'admin'.

import React from 'react';
import { Link } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { diasRestantesTrial } from '../../lib/trial';

const LIMITE_DIAS_URGENTE = 3;

export default function TrialBanner() {
  const { perfil, estudioStatusInfo } = useAuth();

  if (perfil !== 'admin') return null;

  const dias = diasRestantesTrial(estudioStatusInfo?.trial_ends_at);
  if (dias === null || dias < 0) return null;

  const urgente = dias <= LIMITE_DIAS_URGENTE;

  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold shrink-0 text-center ${
        urgente ? 'bg-warning text-warning-foreground' : 'bg-info-soft text-info'
      }`}
    >
      <Clock size={15} className="shrink-0" />
      <span>
        Período de teste — {dias === 0 ? 'último dia' : `faltam ${dias} dia${dias === 1 ? '' : 's'}`}
      </span>
      {urgente && (
        <Link to="/upgrade" className="underline underline-offset-2 hover:no-underline">
          Assinar agora
        </Link>
      )}
    </div>
  );
}
