// webapp/src/App.jsx
import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { RefreshCw, Menu } from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

// FIX (crítico): AuthProvider era usado no JSX mas nunca era importado
// (ReferenceError: AuthProvider is not defined — a aplicação não chegava
// a renderizar nada). Agora importado junto com useAuth.
import { useAuth, AuthProvider } from './hooks/useAuth';
import { useSuperAdmin } from './hooks/useSuperAdmin';
import { useEstudio } from './hooks/useEstudio';
import { useTerminologia } from './hooks/useTerminologia';
import { useSWUpdateNotifier } from './hooks/useSWUpdateNotifier';
import { rotaPorPerfil } from './lib/navigation';
import { destinoRotaModulo } from './lib/rotaModulo';
import { ThemeProvider } from './providers/ThemeProvider';
import { ToastProvider } from './components/shared/Toast';
import ErrorBoundary from './components/shared/ErrorBoundary';
import Sidebar from './components/Sidebar';
import { PWABanners } from './components/PWABanners';
import PaginaNaoEncontrada from './components/PaginaNaoEncontrada';
import TrialBanner from './components/shared/TrialBanner';

// Impersonation
import { ImpersonationProvider } from './context/ImpersonationContext';
import BannerImpersonation from './pages/SuperAdmin/components/BannerImpersonation';

// Pages
import Login from './pages/Login';
import Cadastro from './pages/Cadastro';
import CadastroEstudio from './pages/CadastroEstudio';
import RedefinirSenha from './pages/RedefinirSenha';
import Dashboard from './pages/Dashboard';
import Alunos from './pages/Alunos';
import NovoAluno from './pages/NovoAluno';
import PerfilAluno from './pages/PerfilAluno';
import Leads from './pages/Leads';
import Professores from './pages/Professores';
import Agenda from './pages/Agenda/Agenda';
import Financeiro from './pages/Financeiro';
import Despesas from './pages/Despesas';
import Planos from './pages/Planos';
import Modalidades from './pages/Modalidades';
import Presenca from './pages/Presenca';
import Comissoes from './pages/Comissoes';
import Aniversariantes from './pages/Aniversariantes';
import Landing from './pages/Landing';
import TermosDeUso from './pages/TermosDeUso';
import PoliticaPrivacidade from './pages/PoliticaPrivacidade';
import AreaAluno from './pages/AreaAluno';
import ConfiguracoesFeriados from './pages/ConfiguracoesFeriados';
import Notificacoes from './pages/Notificacoes';
import ConfiguracoesRepasse from './pages/ConfiguracoesRepasse';
import ProfessorAlunos    from './pages/Professor/ProfessorAlunos';
import ProfessorComissoes from './pages/Professor/ProfessorComissoes';
import ResultadoFinanceiro from './pages/ResultadoFinanceiro';
import ConfiguracoesEstudio from './pages/ConfiguracoesEstudio';
import ConfiguracoesEspacos from './pages/ConfiguracoesEspacos';
import ConfiguracoesPagamentos from './pages/ConfiguracoesPagamentos';

// Bloqueio de acesso por status do estúdio (inativo/suspenso/cancelado)
import EstudioBloqueado from './pages/EstudioBloqueado';

// Super Admin
import SuperAdminLayout      from './pages/SuperAdmin';
import SuperAdminDashboard   from './pages/SuperAdmin/pages/SuperAdminDashboard';
import SuperAdminEstudios    from './pages/SuperAdmin/pages/SuperAdminEstudios';
import SuperAdminNovoEstudio from './pages/SuperAdmin/pages/SuperAdminNovoEstudio';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

function Spinner() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background">
      <RefreshCw className="animate-spin text-primary" size={48} />
    </div>
  );
}

// Destino pós-autenticação, considerando o caso "logado mas ainda sem
// estudio_membros" (usuário confirmou e-mail mas não terminou o onboarding)
// e o caso "logado, com perfil, mas o estúdio está inativo/suspenso/cancelado".
// Sem o primeiro caso à parte, perfil === null cai no fallback de
// rotaPorPerfil ('/login'), e como a rota /login redireciona sessão ativa de
// volta pra rotaPorPerfil(perfil), o resultado é um loop de redirect em
// /login. O segundo caso evita que um usuário de estúdio bloqueado chegue
// nas rotas internas e veja telas vazias sem entender por quê — super_admin
// nunca é bloqueado aqui, pois acessa qualquer estúdio via impersonation.
function destinoPosAuth(sessao, perfil, estudioBloqueado) {
  if (!sessao) return '/login';
  if (perfil === null) return '/cadastro/estudio';
  if (estudioBloqueado && perfil !== 'super_admin') return '/estudio-bloqueado';
  return rotaPorPerfil(perfil);
}

// Layout com sidebar (admin + professor)
// Quando em modo impersonation, o super_admin acessa estas rotas com o
// override ativo — o BannerImpersonation no topo avisa sobre isso.
const LayoutComSidebar = ({ perfil, nomeUsuario, estudioId }) => {
  const { data: estudio } = useEstudio(estudioId);
  const nomeEstudio = estudio?.nome ?? 'Estudio';
  const [menuAberto, setMenuAberto] = useState(false);

  return (
    <div className="flex h-screen bg-background transition-colors duration-300 overflow-hidden w-full">
      {/* Banner de impersonation fica no topo de tudo (fixed, z-[200]) */}
      <BannerImpersonation />

      <Sidebar
        perfil={perfil}
        nomeUsuario={nomeUsuario}
        nomeEstudio={nomeEstudio}
        estudioId={estudioId}
        menuAberto={menuAberto}
        setMenuAberto={setMenuAberto}
      />

      <div className="flex-1 flex flex-col h-screen overflow-hidden w-full max-w-full">
        <TrialBanner />

        <div className="md:hidden flex items-center justify-between bg-card border-b border-border p-4 shrink-0 z-10 shadow-sm transition-colors duration-300">
          <div>
            <h2 className="text-xl font-black text-primary tracking-tight leading-none">{nomeEstudio}</h2>
            {perfil === 'professor' && (
              <p className="text-[11px] font-bold text-muted-foreground mt-0.5">Area do Professor</p>
            )}
          </div>
          <button
            onClick={() => setMenuAberto(true)}
            className="p-2 text-muted-foreground bg-muted rounded-xl hover:bg-subtle transition-colors"
          >
            <Menu size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto w-full custom-scrollbar">
          <Outlet context={{ perfil }} />
        </div>
      </div>

      <PWABanners />
    </div>
  );
};

// Guard generico (admin / professor / aluno)
// Sessão ativa sem perfil (ainda sem estudio_membros) manda pro onboarding,
// não pra tela de login — o usuário já está autenticado, só falta o
// segundo passo do cadastro. Sessão ativa com perfil, mas cujo estúdio está
// bloqueado (inativo/suspenso/cancelado), manda pra /estudio-bloqueado —
// super_admin nunca é bloqueado (acessa via impersonation).
const RotaPrivada = ({ sessao, perfil, loading, allowedRoles, estudioBloqueado }) => {
  if (loading) return <Spinner />;
  if (!sessao) return <Navigate to="/login" replace />;
  if (perfil === null) return <Navigate to="/cadastro/estudio" replace />;
  if (estudioBloqueado && perfil !== 'super_admin') return <Navigate to="/estudio-bloqueado" replace />;
  if (allowedRoles && !allowedRoles.includes(perfil)) {
    return <Navigate to={rotaPorPerfil(perfil)} replace />;
  }
  return <Outlet />;
};

// Guard exclusivo de super_admin
// Autocontido: chama useSuperAdmin() internamente, sem receber perfil via props.
function RotaSuperAdmin() {
  const { isSuperAdmin, loading, autenticado } = useSuperAdmin();
  if (loading)       return <Spinner />;
  if (!autenticado)  return <Navigate to="/login" replace />;
  if (!isSuperAdmin) return <Navigate to={rotaPorPerfil('admin')} replace />;
  return <Outlet />;
}

// Guard de módulo — controla acesso a uma rota inteira por
// estudios.modulos_ativos, pra canary release de features grandes por
// tenant (PED-39). Complementa RotaPrivada (auth/role): usado aninhado
// dentro dela, nunca sozinho, pra também herdar a checagem de
// sessão/perfil/estúdio bloqueado.
function RotaComModulo({ modulo }) {
  const { perfil } = useAuth();
  const { modulosAtivos } = useTerminologia();
  const destino = destinoRotaModulo(modulosAtivos, modulo, perfil);
  if (destino) return <Navigate to={destino} replace />;
  return <Outlet />;
}

// Guard do passo 2 do cadastro self-service (/cadastro/estudio).
// Exige sessão ativa; se o usuário já tiver estudio_membros, não deixa
// re-entrar no wizard — manda direto pra rota do perfil dele.
const RotaCadastroEstudio = ({ sessao, perfil, loading }) => {
  if (loading) return <Spinner />;
  if (!sessao) return <Navigate to="/login" replace />;
  if (perfil !== null) return <Navigate to={rotaPorPerfil(perfil)} replace />;
  return <Outlet />;
};

// FIX (crítico): toda a lógica que dependia de useAuth() foi extraída para
// este componente interno, que é renderizado DENTRO de <AuthProvider> (via
// AppShell abaixo). Antes, `App()` chamava useAuth() na própria raiz, antes
// do AuthProvider existir na árvore — o que faz useAuth() lançar
// "useAuth deve ser usado dentro de <AuthProvider>" e derrubar a aplicação
// inteira no primeiro render.
function AppRoutes() {
  const { sessao, perfil, loading, nomeUsuario, estudioId, estudioBloqueado } = useAuth();
  useSWUpdateNotifier();

  if (loading) return <Spinner />;

  return (
    <BrowserRouter>
      <ToastProvider />
      <Routes>

        {/* Publicas */}
        <Route path="/" element={
          !sessao ? <Landing /> : <Navigate to={destinoPosAuth(sessao, perfil, estudioBloqueado)} replace />
        } />
        <Route path="/login" element={
          !sessao ? <Login /> : <Navigate to={destinoPosAuth(sessao, perfil, estudioBloqueado)} replace />
        } />
        <Route path="/cadastro" element={
          !sessao ? <Cadastro /> : <Navigate to={destinoPosAuth(sessao, perfil, estudioBloqueado)} replace />
        } />
        <Route path="/redefinir-senha" element={<RedefinirSenha />} />
        {/* Páginas legais — públicas, sem guard de sessão, usadas pelo checkbox de consentimento do cadastro */}
        <Route path="/termos-de-uso" element={<TermosDeUso />} />
        <Route path="/politica-privacidade" element={<PoliticaPrivacidade />} />

        {/*
          Tela de bloqueio por status do estúdio (inativo/suspenso/cancelado).
          Exige sessão ativa (senão manda pro login), mas não exige perfil
          resolvido nem estúdio ativo — é justamente pra quem está bloqueado.
        */}
        <Route path="/estudio-bloqueado" element={
          !sessao ? <Navigate to="/login" replace /> : <EstudioBloqueado />
        } />

        {/* Cadastro self-service — passo 2 (dados do estúdio) */}
        <Route element={<RotaCadastroEstudio sessao={sessao} perfil={perfil} loading={loading} />}>
          <Route path="/cadastro/estudio" element={<CadastroEstudio />} />
        </Route>

        {/* Super Admin — guard proprio, layout proprio, sem Sidebar de estudio */}
        <Route element={<RotaSuperAdmin />}>
          <Route path="/super" element={<SuperAdminLayout />}>
            <Route index                element={<SuperAdminDashboard />} />
            <Route path="estudios"      element={<SuperAdminEstudios />} />
            <Route path="estudios/novo" element={<SuperAdminNovoEstudio />} />
          </Route>
        </Route>

        {/* Aluno */}
        <Route element={<RotaPrivada sessao={sessao} perfil={perfil} loading={loading} allowedRoles={['aluno']} estudioBloqueado={estudioBloqueado} />}>
          <Route path="/area-aluno" element={<AreaAluno />} />
        </Route>

        {/*
          Admin + Professor
          Nota: quando super_admin usa impersonation, perfil ainda e 'super_admin'.
          O acesso ao dashboard e feito via navigate('/dashboard') no handleAcessar,
          mas o RLS do servidor ja enxerga o estudio_id correto pelo override.
          O guard allowedRoles nao bloqueia porque RotaPrivada recebe perfil='super_admin'
          que nao esta na lista — para resolver isso, o super_admin em modo impersonation
          acessa estas rotas como 'admin' efetivo. Duas opcoes:
            A) Adicionar 'super_admin' nos allowedRoles de admin (abaixo, mais simples)
            B) Criar um layout de impersonation separado (mais isolado)
          Usamos a opcao A, que e a padrao para ferramentas de suporte.
        */}
        <Route element={<RotaPrivada sessao={sessao} perfil={perfil} loading={loading} allowedRoles={['admin', 'professor', 'super_admin']} estudioBloqueado={estudioBloqueado} />}>
          <Route element={<LayoutComSidebar perfil={perfil} nomeUsuario={nomeUsuario} estudioId={estudioId} />}>
            <Route path="/agenda"              element={<Agenda />} />
            <Route path="/professor/alunos"    element={<ProfessorAlunos />} />
            <Route path="/professor/comissoes" element={<ProfessorComissoes />} />
          </Route>
        </Route>

        <Route element={<RotaPrivada sessao={sessao} perfil={perfil} loading={loading} allowedRoles={['admin', 'super_admin']} estudioBloqueado={estudioBloqueado} />}>
          <Route element={<LayoutComSidebar perfil={perfil} nomeUsuario={nomeUsuario} estudioId={estudioId} />}>
            <Route path="/dashboard"             element={<Dashboard />} />
            <Route path="/leads"                 element={<Leads />} />
            <Route path="/alunos"                element={<Alunos />} />
            <Route path="/alunos/novo"           element={<NovoAluno />} />
            <Route path="/alunos/:id"            element={<PerfilAluno />} />
            <Route path="/professores"           element={<Professores />} />
            <Route path="/financeiro"            element={<Financeiro />} />
            <Route path="/despesas"              element={<Despesas />} />
            <Route path="/resultado-financeiro"  element={<ResultadoFinanceiro />} />
            <Route path="/planos"                element={<Planos />} />
            <Route path="/modalidades"           element={<Modalidades />} />
            <Route path="/presenca"              element={<Presenca />} />
            <Route path="/comissoes"             element={<Comissoes />} />
            <Route path="/aniversariantes"       element={<Aniversariantes />} />
            <Route path="/configuracoes/feriados"element={<ConfiguracoesFeriados />} />
            <Route path="/notificacoes"          element={<Notificacoes />} />
            <Route path="/configuracoes/repasse" element={<ConfiguracoesRepasse />} />
            <Route path="/configuracoes/estudio" element={<ConfiguracoesEstudio />} />
            <Route path="/configuracoes/espacos" element={<ConfiguracoesEspacos />} />
            <Route path="/configuracoes/pagamentos" element={<ConfiguracoesPagamentos />} />
          </Route>
        </Route>

        {/* 404 */}
        <Route path="*" element={
          <PaginaNaoEncontrada destino={destinoPosAuth(sessao, perfil, estudioBloqueado)} />
        } />

      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <ThemeProvider>
          {/*
            ImpersonationProvider envolve o BrowserRouter (dentro de AppRoutes)
            para que useImpersonation() funcione em qualquer componente da
            arvore, incluindo o BannerImpersonation montado dentro do
            LayoutComSidebar.

            AuthProvider agora envolve AppRoutes, que é onde useAuth() é
            efetivamente chamado — corrigindo o crash anterior.
          */}
          <AuthProvider>
            <ImpersonationProvider>
              <AppRoutes />
            </ImpersonationProvider>
          </AuthProvider>
        </ThemeProvider>
      </ErrorBoundary>
      {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}