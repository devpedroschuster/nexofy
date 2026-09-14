// webapp/src/pages/SuperAdmin/components/MetricasGlobais.jsx

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Users, DollarSign, TrendingUp } from 'lucide-react';
import { superAdminService } from '../../../services/superAdminService';
import { exportarRelatorioPDF, exportarRelatorioXLSX } from '../../../lib/relatorioExport';
import MetricCard from '../../../components/ui/MetricCard';
import ExportarRelatorioMenu from '../../../components/shared/ExportarRelatorioMenu';
import { formatarMoeda } from '../../../lib/utils';

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

  const kpisRelatorio = cards.map((c) => ({ label: c.label, valor: c.valor }));
  const nomeBaseRelatorio = `Metricas_Globais_${new Date().toISOString().slice(0, 10)}`;

  function handleExportarPDF() {
    exportarRelatorioPDF({
      nomeArquivo: `${nomeBaseRelatorio}.pdf`,
      titulo: 'Métricas Globais',
      subtitulo: 'Visão consolidada de todos os estúdios',
      kpis: kpisRelatorio,
      secoes: [],
    });
  }

  function handleExportarPlanilha() {
    exportarRelatorioXLSX({
      nomeArquivo: `${nomeBaseRelatorio}.xlsx`,
      kpis: kpisRelatorio,
      secoes: [],
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <ExportarRelatorioMenu
          disabled={isLoading}
          onExportarPDF={handleExportarPDF}
          onExportarPlanilha={handleExportarPlanilha}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((c) => (
          <MetricCard key={c.label} {...c} loading={isLoading} />
        ))}
      </div>
    </div>
  );
}