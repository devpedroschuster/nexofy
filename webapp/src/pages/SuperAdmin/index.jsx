// webapp/src/pages/SuperAdmin/index.jsx
//
// Layout shell exclusivo do painel super_admin.
// Renderiza o header fixo + navegação lateral e delega o conteúdo
// para as sub-páginas via <Outlet />.
//
// Árvore de rotas:
//   /super              → SuperAdminDashboard  (métricas + atalhos)
//   /super/estudios     → SuperAdminEstudios   (lista + suspender)
//   /super/estudios/novo → SuperAdminNovoEstudio (formulário)

import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Building2, LogOut, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import Button from '../../components/ui/Button';
import ThemeToggle from '../../components/ui/ThemeToggle';

const NAV = [
  { to: '/super',          label: 'Visão geral',  icon: LayoutDashboard, end: true },
  { to: '/super/estudios', label: 'Estúdios',      icon: Building2,       end: false },
];

export default function SuperAdminLayout() {
  const { nomeUsuario } = useAuth();
  const navigate        = useNavigate();

  async function handleLogout() {
    await supabase.auth.signOut();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 flex items-center h-16 gap-6">

          {/* Identidade */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
              <ShieldCheck size={18} className="text-primary-foreground" />
            </div>
            <div className="hidden sm:block leading-tight">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Iluminus
              </p>
              <p className="text-sm font-black text-foreground tracking-tight">
                Super Admin
              </p>
            </div>
          </div>

          {/* Navegação principal (tabs no header) */}
          <nav className="flex items-stretch gap-1 h-full">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => [
                  'flex items-center gap-2 px-4 text-sm font-bold border-b-2 transition-colors h-full',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Ações do header */}
          <div className="flex items-center gap-2 ml-auto">
            {nomeUsuario && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-muted">
                <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center shrink-0">
                  <span className="text-primary-foreground font-black text-xs">
                    {nomeUsuario.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm font-bold text-foreground truncate max-w-[120px]">
                  {nomeUsuario}
                </span>
              </div>
            )}

            <ThemeToggle />

            <Button
              variant="ghost"
              size="sm"
              leftIcon={<LogOut size={16} />}
              onClick={handleLogout}
              className="text-muted-foreground hover:text-destructive"
            >
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Conteúdo das sub-páginas ────────────────────────────────────────── */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}