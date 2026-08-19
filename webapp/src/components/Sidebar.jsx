// src/components/Sidebar.jsx
// ─── Midnight Indigo · Sidebar ────────────────────────────────────────────────
//
// Design: usa tokens sidebar-* (isolados do resto da UI).
// Borda esquerda no item ativo (indicador de posição visual).
// Avatar com inicial do nome para todos os perfis no rodapé.
// Overlay mobile com backdrop-blur.
//
// Item 2 do plano multi-segmento (seção 6 do PLANO_ITEM_2.md): primeiro
// consumo real de useTerminologia(). Dois efeitos:
//   1. Rótulos de menu que correspondem a uma CHAVE_TERMINOLOGIA (aluno,
//      professor, modalidade) usam t.rotuloPlural(...) em vez de string
//      fixa — reagem à terminologia customizada do tenant/segmento.
//   2. Itens marcados com `modulo` só aparecem se aquele módulo estiver
//      em modulosAtivos do tenant — com uma salvaguarda: lista vazia
//      (ex.: super_admin fora de impersonation, ou estado de loading)
//      NUNCA esconde item, só filtra quando a lista está de fato
//      populada. Preferimos mostrar um item "a mais" a um sidebar em
//      branco por corrida de carregamento — ver nota junto ao filtro.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Calendar, Download, LogOut,
  Package, TrendingDown, UserCheck, Calculator, X,
  Clock, Bell, Percent, DollarSign, Gift, CalendarCog,
  CreditCard, Settings, ChevronRight, MapPin,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import ThemeToggle from './ui/ThemeToggle';
import { usePWA } from '../hooks/usePWA';
import { useTerminologia } from '../hooks/useTerminologia';
import { cn } from '../lib/cn';

/* ── Helpers ────────────────────────────────────────────────────────────────── */
function resolverPerfil(perfil) {
  if (!perfil) return null;
  if (typeof perfil === 'string') return perfil.toLowerCase().trim();
  return String(perfil.role ?? perfil.tipo ?? 'admin').toLowerCase().trim();
}

function inicialNome(nome) {
  if (!nome) return '?';
  return nome.trim().charAt(0).toUpperCase();
}

/* ── Menus ──────────────────────────────────────────────────────────────────── */
// Viram funções de `t` (retorno de useTerminologia()) em vez de arrays
// estáticos, para o `name` reagir à terminologia do tenant. `modulo`
// (quando presente) referencia uma chave de modulos_ativos — ver filtro
// dentro do componente.
const construirMenuAdmin = (t) => [
  { label: 'Visão Geral' },
  { name: 'Painel',                 path: '/dashboard',                  icon: LayoutDashboard },
  { name: 'Notificações',           path: '/notificacoes',               icon: Bell            },
  { name: 'Leads',                  path: '/leads',                      icon: Clock           },
  { name: 'Aniversariantes',        path: '/aniversariantes',            icon: Gift            },

  { label: 'Gestão e Operação' },
  { name: t.rotuloPlural('aluno'),      path: '/alunos',                     icon: Users,     modulo: 'alunos'     },
  { name: 'Planos',                     path: '/planos',                     icon: CreditCard                     },
  { name: t.rotuloPlural('professor'),  path: '/professores',                icon: UserCheck                      },
  { name: t.rotuloPlural('modalidade'), path: '/modalidades',                icon: Package                         },
  { name: 'Agenda',                     path: '/agenda',                     icon: Calendar,  modulo: 'agenda'     },
  { name: 'Presença',                   path: '/presenca',                   icon: Clock,     modulo: 'presenca'   },
  { name: 'Feriados',                   path: '/configuracoes/feriados',     icon: CalendarCog                     },

  { label: 'Financeiro' },
  { name: 'Mensalidades',      path: '/financeiro',                 icon: DollarSign,   modulo: 'financeiro' },
  { name: 'Despesas',          path: '/despesas',                   icon: TrendingDown, modulo: 'financeiro' },
  { name: 'Resultado',         path: '/resultado-financeiro',       icon: Calculator,   modulo: 'financeiro' },
  { name: 'Comissões',         path: '/comissoes',                  icon: Percent,      modulo: 'financeiro' },
  { name: 'Regras de Repasse', path: '/configuracoes/repasse',      icon: Calculator,   modulo: 'financeiro' },
  { name: 'Pagamentos',        path: '/configuracoes/pagamentos',   icon: CreditCard,   modulo: 'financeiro' },
  { name: 'Configurações',     path: '/configuracoes/estudio',      icon: Settings },
  { name: 'Espaços',           path: '/configuracoes/espacos',      icon: MapPin },
];

const construirMenuProfessor = (t) => [
  { label: 'Minha Área' },
  { name: 'Minha Agenda',                     path: '/agenda',           icon: Calendar, modulo: 'agenda' },
  { name: `Meus ${t.rotuloPlural('aluno')}`,  path: '/professor/alunos', icon: Users,    modulo: 'alunos' },
];

const PERFIS_COM_MENU_ADMIN = ['admin', 'super_admin'];

/* ── Componente ─────────────────────────────────────────────────────────────── */
function Sidebar({ perfil, nomeUsuario, nomeEstudio, menuAberto, setMenuAberto }) {
  const location = useLocation();
  const navigate = useNavigate();
  const t = useTerminologia();

  const perfilResolvido = resolverPerfil(perfil);
  const isProfessor = perfilResolvido === 'professor';
  const isAdmin = PERFIS_COM_MENU_ADMIN.includes(perfilResolvido);

  const { canInstall, install } = usePWA();

  // Recalcula só quando terminologia/segmento ou o tipo de menu (admin vs
  // professor) mudam — evita reconstruir o array (e recriar closures dos
  // `name`) a cada render por causa de outro estado do componente pai.
  const itensMenuBase = useMemo(
    () => (isProfessor ? construirMenuProfessor(t) : isAdmin ? construirMenuAdmin(t) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isProfessor, isAdmin, t.segmento, t.terminologia]
  );

  // Filtra por módulo ativo. Salvaguarda deliberada: `modulosAtivos`
  // vazio (super_admin fora de impersonation, ou frame de loading antes
  // do useAuth resolver) NÃO esconde nenhum item — só filtra quando a
  // lista está de fato populada. Prefere um item a mais temporariamente
  // a um sidebar vazio por corrida de carregamento.
  const itensMenu = useMemo(() => {
    if (t.modulosAtivos.length === 0) return itensMenuBase;
    return itensMenuBase.filter(
      (item) => item.label || !item.modulo || t.moduloAtivo(item.modulo)
    );
  }, [itensMenuBase, t]);

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Erro ao sair (signOut remoto falhou):', err);
    } finally {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('supabase.'))
        .forEach((k) => localStorage.removeItem(k));
      navigate('/login', { replace: true });
    }
  }

  return (
    <>
      {/* ── Overlay Mobile ──────────────────────────────────────────────── */}
      {menuAberto && (
        <div
          className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm md:hidden"
          onClick={() => setMenuAberto(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 md:static',
          'flex h-full w-64 flex-col',
          'bg-sidebar border-r border-sidebar-border',
          'transform transition-transform duration-300 ease-out',
          menuAberto ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        )}
      >
        {/* ── Header / Logo ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 py-6 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Avatar do estúdio */}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary shadow-brand">
              <span className="text-primary-foreground font-bold text-base leading-none">
                {nomeEstudio?.charAt(0)?.toUpperCase() ?? 'E'}
              </span>
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-sidebar-foreground leading-tight">
                {nomeEstudio ?? 'Estúdio'}
              </p>
              {isProfessor && (
                <p className="text-[10px] font-medium text-sidebar-muted-foreground uppercase tracking-wider mt-0.5">
                  Área do {t.rotulo('professor')}
                </p>
              )}
            </div>
          </div>

          {/* Fechar no mobile */}
          <button
            onClick={() => setMenuAberto(false)}
            className={cn(
              'md:hidden flex h-8 w-8 items-center justify-center rounded-lg',
              'text-sidebar-muted-foreground',
              'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              'transition-colors focus-visible:ring-2 focus-visible:ring-ring',
            )}
            aria-label="Fechar menu"
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Navegação ──────────────────────────────────────────────────── */}
        <nav
          className="flex-1 overflow-y-auto px-3 pb-4 space-y-0.5 custom-scrollbar"
          aria-label="Navegação principal"
        >
          {itensMenu.map((item, index) => {
            /* Label de seção */
            if (item.label) {
              return (
                <p
                  key={`label-${index}`}
                  className="px-3 pt-5 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-sidebar-muted-foreground/70 select-none"
                >
                  {item.label}
                </p>
              );
            }

            const Icon  = item.icon;
            const ativo = location.pathname === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMenuAberto(false)}
                aria-current={ativo ? 'page' : undefined}
                className={cn(
                  'group flex items-center gap-3 rounded-lg px-3 py-2.5',
                  'text-sm font-medium transition-all duration-150',
                  'focus-visible:ring-2 focus-visible:ring-ring outline-none',
                  ativo
                    ? [
                        'bg-sidebar-accent text-sidebar-accent-foreground',
                        'border-l-2 border-sidebar-primary pl-[10px]', // indicador ativo
                      ]
                    : [
                        'text-sidebar-muted-foreground',
                        'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                        'border-l-2 border-transparent pl-[10px]',
                      ]
                )}
              >
                <Icon
                  size={17}
                  strokeWidth={ativo ? 2 : 1.5}
                  className="shrink-0"
                />
                <span className="flex-1 truncate">{item.name}</span>
                {ativo && (
                  <ChevronRight size={13} className="shrink-0 opacity-40" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* ── Rodapé ─────────────────────────────────────────────────────── */}
        <div className="shrink-0 border-t border-sidebar-border px-3 py-4 space-y-2">

          {/* Identidade do usuário */}
          {nomeUsuario && (
            <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent px-3 py-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-brand">
                <span className="text-xs font-bold leading-none">
                  {inicialNome(nomeUsuario)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-[10px] text-sidebar-muted-foreground font-medium leading-none mb-0.5">
                  {isProfessor ? t.rotulo('professor') : 'Administrador'}
                </p>
                <p className="text-sm font-semibold text-sidebar-foreground truncate leading-tight">
                  {nomeUsuario}
                </p>
              </div>
            </div>
          )}

          {/* ThemeToggle */}
          <div className="flex justify-center py-1">
            <ThemeToggle />
          </div>

          {/* Instalar PWA */}
          {canInstall && (
            <button
              onClick={install}
              className={cn(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5',
                'text-sm font-medium text-sidebar-primary',
                'hover:bg-sidebar-accent transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring outline-none',
              )}
            >
              <Download size={16} className="shrink-0" />
              <span>Instalar aplicativo</span>
            </button>
          )}

          {/* Logout */}
          <button
            onClick={handleLogout}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5',
              'text-sm font-medium text-sidebar-muted-foreground',
              'hover:bg-destructive-soft hover:text-destructive transition-colors',
              'focus-visible:ring-2 focus-visible:ring-ring outline-none',
            )}
          >
            <LogOut size={16} className="shrink-0" />
            <span>Sair do sistema</span>
          </button>

          {/* Versão */}
          <p className="text-center text-[10px] text-sidebar-muted-foreground/40 font-medium pb-1">
            v3.0 · Midnight Indigo
          </p>
        </div>
      </aside>
    </>
  );
}

export default Sidebar;