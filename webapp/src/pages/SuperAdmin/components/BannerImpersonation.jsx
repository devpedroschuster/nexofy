// webapp/src/pages/SuperAdmin/components/BannerImpersonation.jsx
//
// Banner fixo no topo da tela, visível somente durante modo impersonation.
// Exibe o nome do estúdio sendo visualizado e o botão "Sair" que chama
// sairImpersonation() e redireciona de volta ao painel /super/estudios.
//
// Design: faixa amarela de alerta, discreta mas impossível de ignorar.
// Não interfere com o layout existente — usa position: fixed + z-index alto.
//
// AUDITORIA: catch genérico sem parâmetro de erro perdia a causa raiz de
// falhas em sairImpersonation() (nenhum log, só toast). Agora logamos o erro
// original antes de exibir o toast — importante enquanto Sentry não estiver
// integrado (ver plano de Go-Live, seção 4) e mesmo depois, como contexto
// extra no breadcrumb.

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, X, Loader2 } from 'lucide-react';
import { useImpersonation } from '../../../context/ImpersonationContext';
import { showToast } from '../../../components/shared/Toast';

export default function BannerImpersonation() {
  const { emImpersonation, estudioAtivo, sairImpersonation } = useImpersonation();
  const navigate = useNavigate();
  const [saindo, setSaindo] = useState(false);

  if (!emImpersonation) return null;

  async function handleSair() {
    setSaindo(true);
    try {
      await sairImpersonation();
      navigate('/super/estudios');
    } catch (err) {
      // FIX: loga a causa raiz em vez de descartá-la silenciosamente.
      console.error('[BannerImpersonation] Erro ao sair da impersonation:', err);
      showToast.error('Erro ao encerrar visualização. Tente novamente.');
      setSaindo(false);
    }
  }

  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed top-0 inset-x-0 z-[200] flex items-center justify-between gap-3 px-4 py-2 bg-warning text-warning-foreground shadow-lg"
    >
      {/* Ícone + texto */}
      <div className="flex items-center gap-2 min-w-0">
        <Eye size={16} className="shrink-0 opacity-80" />
        <p className="text-sm font-bold truncate">
          Visualizando como admin de{' '}
          <span className="font-black">{estudioAtivo?.nome ?? 'estúdio'}</span>
        </p>
      </div>

      {/* Botão sair */}
      <button
        onClick={handleSair}
        disabled={saindo}
        className="shrink-0 flex items-center gap-1.5 rounded-xl border border-warning-foreground/30 bg-warning-foreground/10 px-3 py-1.5 text-xs font-black uppercase tracking-wide hover:bg-warning-foreground/20 transition-colors disabled:opacity-60"
      >
        {saindo
          ? <><Loader2 size={13} className="animate-spin" /> Saindo…</>
          : <><X size={13} /> Sair da visualização</>
        }
      </button>
    </div>
  );
}