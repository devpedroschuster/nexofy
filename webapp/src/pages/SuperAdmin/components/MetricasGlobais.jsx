// webapp/src/pages/SuperAdmin/components/MetricasGlobais.jsx

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Users, DollarSign, TrendingUp } from 'lucide-react';
import { superAdminService } from '../../../services/superAdminService';
import Skeleton from '../../../components/ui/Skeleton';

function formatarMoeda(valor) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function CardMetrica({ icon: Icon, label, valor, corIcone, corFundo, loading }) {
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
          <p className="text-3xl font-black text-foreground tracking-tight leading-none">
            {valor}
          </p>
        )}
      </div>
    </div>
  );
}

export default function MetricasGlobais() {
  const { data, isLoading } = useQuery({
    queryKey: ['super-admin', 'metricas'],
    queryFn: superAdminService.metricasGlobais,
    staleTime: 1000 * 60 * 2,
  });

  const cards = [
    {
      icon: Building2,
      label: 'Estúdios ativos',
      valor: (data?.totalEstudios ?? 0).toString(),
      corIcone: 'text-primary',
      corFundo: 'bg-primary-soft',
    },
    {
      icon: Users,
      label: 'Alunos (total)',
      valor: (data?.totalAlunos ?? 0).toLocaleString('pt-BR'),
      corIcone: 'text-info',
      corFundo: 'bg-info-soft',
    },
    {
      icon: DollarSign,
      label: 'Receita total (pago)',
      valor: formatarMoeda(data?.receitaTotal ?? 0),
      corIcone: 'text-success',
      corFundo: 'bg-success-soft',
    },
    {
      icon: TrendingUp,
      label: 'Média por estúdio',
      valor: data?.totalEstudios
        ? formatarMoeda((data.receitaTotal ?? 0) / data.totalEstudios)
        : 'R$ 0,00',
      corIcone: 'text-warning',
      corFundo: 'bg-warning-soft',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((c) => (
        <CardMetrica key={c.label} {...c} loading={isLoading} />
      ))}
    </div>
  );
}