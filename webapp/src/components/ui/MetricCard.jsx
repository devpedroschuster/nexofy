// webapp/src/components/ui/MetricCard.jsx
//
// Card de métrica genérico (ícone + label + valor), extraído de
// MetricasGlobais.jsx (PED-34) pra ser reaproveitado por SaudeSistema.jsx
// sem duplicar a marcação. `footer` é opcional — usado pelo card de
// latência do webhook pra mostrar o badge de SLO abaixo do valor.

import React from 'react';
import Skeleton from './Skeleton';

export default function MetricCard({ icon: Icon, label, valor, corIcone, corFundo, loading, footer }) {
  return (
    <div className="rounded-3xl border border-border bg-card shadow-card p-6 flex items-start gap-4">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${corFundo}`}>
        <Icon size={22} className={corIcone} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
          {label}
        </p>
        {loading ? (
          <Skeleton className="h-8 w-28 mt-1" />
        ) : (
          <>
            <p className="text-3xl font-black text-foreground tracking-tight leading-none">
              {valor}
            </p>
            {footer}
          </>
        )}
      </div>
    </div>
  );
}
