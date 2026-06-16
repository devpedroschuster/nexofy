// webapp/src/pages/SuperAdmin/pages/SuperAdminDashboard.jsx
//
// Página index do painel super_admin (/super).
// Exibe métricas globais + atalhos de navegação rápida.

import React from 'react';
import { Link } from 'react-router-dom';
import { Building2, Plus, ArrowRight } from 'lucide-react';
import MetricasGlobais from '../components/MetricasGlobais';
import Button from '../../../components/ui/Button';

export default function SuperAdminDashboard() {
  return (
    <div className="space-y-8">
      {/* Cabeçalho da seção */}
      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight">Visão geral</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Métricas consolidadas de todos os estúdios na plataforma.
        </p>
      </div>

      {/* Cards de métricas cross-tenant */}
      <MetricasGlobais />

      {/* Atalhos de ação rápida */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/super/estudios"
          className="group rounded-3xl border border-border bg-card shadow-card p-6 flex items-center justify-between hover:border-primary/50 hover:shadow-brand transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-primary-soft flex items-center justify-center shrink-0">
              <Building2 size={20} className="text-primary" />
            </div>
            <div>
              <p className="font-black text-foreground">Gerenciar estúdios</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ver lista, suspender ou reativar
              </p>
            </div>
          </div>
          <ArrowRight
            size={18}
            className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all"
          />
        </Link>

        <Link
          to="/super/estudios/novo"
          className="group rounded-3xl border border-border bg-card shadow-card p-6 flex items-center justify-between hover:border-primary/50 hover:shadow-brand transition-all"
        >
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-success-soft flex items-center justify-center shrink-0">
              <Plus size={20} className="text-success" />
            </div>
            <div>
              <p className="font-black text-foreground">Criar novo estúdio</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Provisionar e convidar admin responsável
              </p>
            </div>
          </div>
          <ArrowRight
            size={18}
            className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all"
          />
        </Link>
      </div>
    </div>
  );
}