// webapp/src/pages/SuperAdmin/components/SaudeSistema.jsx
//
// PED-34 — dashboard de saúde básico: mensalidades geradas vs esperado no
// mês, p95 de latência do webhook de pagamento (contra a meta do PED-35),
// e links diretos pros erros no Sentry (decisão de escopo do
// brainstorming: sem proxy de API novo nesta ficha).
//
// PED-150: o link original apontava só pro projeto nexofy-edge-functions —
// os erros de front (o que o usuário final realmente vê no navegador, ex:
// https://www.nexofy.com.br/alunos/novo) ficavam inalcançáveis a partir
// deste painel, exatamente o inverso do que se quer numa semana de launch.
// Agora são dois links, cada um já filtrado pro projeto certo
// (?project=<slug>, confirmado batendo com o link real que o Sentry gera
// pra uma busca de issues do projeto).

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Timer, Bug, Code } from 'lucide-react';
import { superAdminService } from '../../../services/superAdminService';
import MetricCard from '../../../components/ui/MetricCard';
import Badge from '../../../components/ui/Badge';
import { WEBHOOK_SLO_MS, webhookDentroDoSlo, formatarSegundos } from './saudeSistemaHelpers';

const SENTRY_ORG_URL = 'https://dev-pedro-schuster.sentry.io/issues/';
const SENTRY_WEB_ISSUES_URL = `${SENTRY_ORG_URL}?project=nexofy-web`;
const SENTRY_EDGE_FUNCTIONS_ISSUES_URL = `${SENTRY_ORG_URL}?project=nexofy-edge-functions`;

export default function SaudeSistema() {
  const { data, isLoading } = useQuery({
    queryKey: ['super-admin', 'saude-sistema'],
    queryFn: superAdminService.saudeSistema,
    staleTime: 1000 * 60 * 2,
  });

  const p95 = data?.webhookP95Ms ?? null;
  const temAmostras = (data?.webhookAmostras ?? 0) > 0;

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3">
        Saúde do sistema
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          icon={Activity}
          label="Mensalidades do mês"
          valor={`${data?.mensalidadesGeradas ?? 0} / ${data?.mensalidadesEsperadas ?? 0}`}
          corIcone="text-info"
          corFundo="bg-info-soft"
          loading={isLoading}
        />

        <MetricCard
          icon={Timer}
          label="Latência webhook (p95)"
          valor={temAmostras ? formatarSegundos(p95) : 'sem dados'}
          corIcone="text-warning"
          corFundo="bg-warning-soft"
          loading={isLoading}
          footer={
            temAmostras ? (
              <Badge tone={webhookDentroDoSlo(p95) ? 'success' : 'destructive'} className="mt-2">
                Meta: p95 {'<'} {formatarSegundos(WEBHOOK_SLO_MS)}
              </Badge>
            ) : null
          }
        />

        <a
          href={SENTRY_WEB_ISSUES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-3xl border border-border bg-card shadow-card p-6 flex items-start gap-4 hover:border-primary/50 hover:shadow-brand transition-all"
        >
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-destructive-soft">
            <Bug size={22} className="text-destructive" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
              Erros do frontend
            </p>
            <p className="text-sm font-bold text-foreground">
              Ver no Sentry (projeto nexofy-web) →
            </p>
          </div>
        </a>

        <a
          href={SENTRY_EDGE_FUNCTIONS_ISSUES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-3xl border border-border bg-card shadow-card p-6 flex items-start gap-4 hover:border-primary/50 hover:shadow-brand transition-all"
        >
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 bg-destructive-soft">
            <Code size={22} className="text-destructive" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-1">
              Erros de Edge Functions
            </p>
            <p className="text-sm font-bold text-foreground">
              Ver no Sentry (projeto nexofy-edge-functions) →
            </p>
          </div>
        </a>
      </div>
    </div>
  );
}
