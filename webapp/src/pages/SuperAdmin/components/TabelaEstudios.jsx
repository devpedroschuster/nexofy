// webapp/src/pages/SuperAdmin/components/TabelaEstudios.jsx
//
// AUDITORIA (correções aplicadas):
//   CR-1 (race condition) — antes só a linha clicada ficava desabilitada
//   (`acessando={acessandoId === e.id && impersonando}`), permitindo disparar
//   `acessarEstudio` para outro estúdio enquanto uma chamada já estava em
//   voo. A correção principal já foi feita na ORIGEM (ImpersonationContext
//   agora recusa chamadas concorrentes), mas aqui reforçamos a UX: TODAS as
//   linhas ficam com a ação "Acessar" desabilitada enquanto `impersonando`
//   for true, não só a que foi clicada — o usuário não fica intrigado
//   vendo outras linhas "clicáveis" que na prática seriam ignoradas.
//
//   CR-2 (null-safety) — `estudio.nome.charAt(0)`, `estudio.total_alunos`
//   e `estudio.total_professores` eram acessados sem fallback; um valor
//   nulo/vazio vindo da RPC de agregação derrubava a tabela inteira com
//   TypeError. Agora há fallback seguro para cada campo.
//
//   Erro de autorização — a checagem por substring de mensagem
//   (`msg.includes('Acesso negado')`) foi extraída para
//   `isErroAcessoNegado()`, centralizada em ImpersonationContext, preferindo
//   `error.code` estruturado quando disponível.

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, GraduationCap, MoreHorizontal,
  Pause, Play, Eye, Calendar, Loader2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import Badge from '../../../components/ui/Badge';
import EmptyState from '../../../components/ui/EmptyState';
import Skeleton from '../../../components/ui/Skeleton';
import { ModalConfirmacao } from '../../../components/ui/Modal';
import { showToast } from '../../../components/shared/Toast';
import { superAdminService } from '../../../services/superAdminService';
import { useImpersonation, isErroAcessoNegado } from '../../../context/ImpersonationContext';
import { useDebounce } from '../../../hooks/useDebounce';
import { formatarData } from '../../../lib/utils';

const PAGE_SIZE = 50;

const TH = ({ children, className = '' }) => (
  <th className={`py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground ${className}`}>
    {children}
  </th>
);

// Nome de exibição defensivo: nunca deixa a UI quebrar por dado ausente.
function nomeExibicao(estudio) {
  return estudio?.nome?.trim() || 'Estúdio sem nome';
}

function inicial(estudio) {
  const nome = nomeExibicao(estudio);
  return nome.charAt(0).toUpperCase();
}

// Contagens defensivas: RPCs de agregação podem retornar NULL em vez de 0
// em cenários de LEFT JOIN sem correspondência.
function contagem(valor) {
  return Number(valor ?? 0).toLocaleString('pt-BR');
}

// Menu de acoes por linha
function MenuAcoes({ estudio, onSuspender, onReativar, onAcessar, acessando, acessarDesabilitado }) {
  const [aberto, setAberto] = useState(false);
  const ativo = estudio.status !== 'suspenso';

  return (
    <div className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        disabled={acessando}
        className="p-2 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40"
        aria-label="Acoes"
      >
        {acessando
          ? <Loader2 size={18} className="animate-spin" />
          : <MoreHorizontal size={18} />
        }
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setAberto(false)} />
          <div className="absolute right-0 top-10 z-20 w-52 rounded-2xl border border-border bg-card shadow-card py-1 animate-in fade-in zoom-in-95 duration-150">
            <button
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-info hover:bg-info-soft transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={acessarDesabilitado}
              onClick={() => { setAberto(false); onAcessar(estudio); }}
            >
              <Eye size={15} /> Acessar como admin
            </button>

            <div className="my-1 border-t border-border" />

            {ativo ? (
              <button
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-warning hover:bg-warning-soft transition-colors"
                onClick={() => { setAberto(false); onSuspender(estudio); }}
              >
                <Pause size={15} /> Suspender
              </button>
            ) : (
              <button
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-success hover:bg-success-soft transition-colors"
                onClick={() => { setAberto(false); onReativar(estudio); }}
              >
                <Play size={15} /> Reativar
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function LinhaEstudio({ estudio, onSuspender, onReativar, onAcessar, acessando, acessarDesabilitado }) {
  const ativo = estudio.status !== 'suspenso';

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
      <td className="py-4 pl-6 pr-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-soft flex items-center justify-center shrink-0">
            <span className="text-primary font-black text-sm">
              {inicial(estudio)}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-foreground truncate">{nomeExibicao(estudio)}</p>
            <p className="text-xs text-muted-foreground font-mono">{estudio.slug ?? '—'}</p>
          </div>
        </div>
      </td>

      <td className="py-4 px-4 text-center">
        <div className="flex items-center justify-center gap-1.5 text-sm font-bold text-foreground">
          <Users size={14} className="text-muted-foreground" />
          {contagem(estudio.total_alunos)}
        </div>
      </td>

      <td className="py-4 px-4 text-center">
        <div className="flex items-center justify-center gap-1.5 text-sm font-bold text-foreground">
          <GraduationCap size={14} className="text-muted-foreground" />
          {contagem(estudio.total_professores)}
        </div>
      </td>

      <td className="py-4 px-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar size={13} />
          {formatarData(estudio.criado_em)}
        </div>
      </td>

      <td className="py-4 px-4">
        <Badge tone={ativo ? 'success' : 'warning'} variant="soft">
          {ativo ? 'Ativo' : 'Suspenso'}
        </Badge>
      </td>

      <td className="py-4 pr-6 pl-4 text-right">
        <MenuAcoes
          estudio={estudio}
          onSuspender={onSuspender}
          onReativar={onReativar}
          onAcessar={onAcessar}
          acessando={acessando}
          acessarDesabilitado={acessarDesabilitado}
        />
      </td>
    </tr>
  );
}

function SkeletonLinha() {
  return (
    <tr className="border-b border-border">
      <td className="py-4 pl-6 pr-4">
        <div className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
          <div className="space-y-1.5 flex-1">
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </td>
      {[...Array(4)].map((_, i) => (
        <td key={i} className="py-4 px-4">
          <Skeleton className="h-3.5 w-12 mx-auto" />
        </td>
      ))}
      <td className="py-4 pr-6 pl-4" />
    </tr>
  );
}

export default function TabelaEstudios({ busca }) {
  const qc       = useQueryClient();
  const navigate = useNavigate();
  const { acessarEstudio, carregando: impersonando } = useImpersonation();

  const [confirmacao, setConfirmacao] = useState(null);
  const [acessandoId, setAcessandoId] = useState(null);
  const [pagina, setPagina] = useState(0); // 0-based, casa com p_offset da RPC

  const buscaDebounced = useDebounce(busca, 300);

  // Sempre que a busca mudar, volta pra primeira pagina —
  // senao o usuario pode ficar "preso" numa pagina que nao existe mais no resultado filtrado.
  useEffect(() => {
    setPagina(0);
  }, [buscaDebounced]);

  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['super-admin', 'estudios', buscaDebounced, pagina],
    queryFn: () => superAdminService.listarEstudios({
      page: pagina,
      pageSize: PAGE_SIZE,
      busca: buscaDebounced,
    }),
    staleTime: 1000 * 60,
    placeholderData: (prev) => prev, // evita flash de loading ao trocar de pagina
  });

  const estudios     = data?.estudios ?? [];
  const totalCount   = data?.totalCount ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const { mutate: alterarStatus, isPending: isAlterando } = useMutation({
    mutationFn: ({ id, status }) => superAdminService.alterarStatusEstudio(id, status),
    onSuccess: (_, { status }) => {
      showToast.success(status === 'suspenso' ? 'Estudio suspenso.' : 'Estudio reativado.');
      qc.invalidateQueries({ queryKey: ['super-admin'] });
    },
    onError:   (err) => showToast.error(err.message || 'Erro ao alterar status.'),
    onSettled: ()    => setConfirmacao(null),
  });

  async function handleAcessar(estudio) {
    // Defesa em profundidade: mesmo com o botão desabilitado durante
    // `impersonando`, evita corrida se o clique já estava em processamento
    // (ex.: duplo clique muito rápido antes do React re-renderizar o disabled).
    if (impersonando) return;

    setAcessandoId(estudio.id);
    try {
      await acessarEstudio(estudio);
      navigate('/dashboard');
    } catch (err) {
      showToast.error(
        isErroAcessoNegado(err)
          ? 'Apenas super_admins podem usar esta funcao.'
          : `Erro ao acessar estudio: ${err?.message || 'tente novamente.'}`
      );
    } finally {
      setAcessandoId(null);
    }
  }

  // A busca e a paginacao acontecem no servidor agora (RPC listar_estudios_admin),
  // entao `estudios` ja vem filtrado e paginado — sem `.filter()` client-side.

  return (
    <>
      <div className="rounded-3xl border border-border bg-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <TH className="pl-6 pr-4 text-left">Estudio</TH>
                <TH className="px-4 text-center">Alunos</TH>
                <TH className="px-4 text-center">Professores</TH>
                <TH className="px-4 text-left">Criado em</TH>
                <TH className="px-4 text-left">Status</TH>
                <TH className="pr-6 pl-4 text-right">Acoes</TH>
              </tr>
            </thead>

            <tbody>
              {isLoading
                ? [...Array(5)].map((_, i) => <SkeletonLinha key={i} />)
                : estudios.length === 0
                ? (
                  <tr>
                    <td colSpan={6} className="py-12">
                      <EmptyState
                        icon={<Building2 size={28} />}
                        title={buscaDebounced ? 'Nenhum estudio encontrado' : 'Nenhum estudio cadastrado'}
                        description={
                          buscaDebounced
                            ? `Nenhum resultado para "${buscaDebounced}".`
                            : 'Crie o primeiro estudio usando o botao acima.'
                        }
                        className="border-0 bg-transparent"
                      />
                    </td>
                  </tr>
                )
                : estudios.map((e) => (
                  <LinhaEstudio
                    key={e.id}
                    estudio={e}
                    onSuspender={(est) => setConfirmacao({ estudio: est, acao: 'suspender' })}
                    onReativar={(est)  => setConfirmacao({ estudio: est, acao: 'reativar'  })}
                    onAcessar={handleAcessar}
                    acessando={acessandoId === e.id && impersonando}
                    // FIX (CR-1): desabilita "Acessar" em TODAS as linhas
                    // enquanto qualquer troca de estúdio estiver em andamento,
                    // não só na linha que originou a chamada.
                    acessarDesabilitado={impersonando}
                  />
                ))
              }
            </tbody>
          </table>
        </div>

        {!isLoading && estudios.length > 0 && (
          <div className="px-6 py-3 border-t border-border bg-muted/20 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-xs text-muted-foreground font-medium">
              {totalCount} estudio{totalCount !== 1 ? 's' : ''}
              {buscaDebounced && ` encontrado${totalCount !== 1 ? 's' : ''} para "${buscaDebounced}"`}
            </p>

            {totalPaginas > 1 && (
              <div className="flex items-center gap-3">
                <button
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                  disabled={pagina === 0 || isPlaceholderData}
                  onClick={() => setPagina((p) => Math.max(0, p - 1))}
                  aria-label="Pagina anterior"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs font-bold text-foreground tabular-nums">
                  {pagina + 1} / {totalPaginas}
                </span>
                <button
                  className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                  disabled={pagina + 1 >= totalPaginas || isPlaceholderData}
                  onClick={() => setPagina((p) => p + 1)}
                  aria-label="Proxima pagina"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <ModalConfirmacao
        aberto={!!confirmacao}
        fechar={() => setConfirmacao(null)}
        onConfirm={() => alterarStatus({
          id:     confirmacao.estudio.id,
          status: confirmacao.acao === 'suspender' ? 'suspenso' : 'ativo',
        })}
        loading={isAlterando}
        tipo={confirmacao?.acao === 'suspender' ? 'warning' : 'success'}
        titulo={confirmacao?.acao === 'suspender' ? 'Suspender estudio?' : 'Reativar estudio?'}
        mensagem={
          confirmacao?.acao === 'suspender'
            ? `O estudio "${confirmacao?.estudio?.nome}" perdera acesso ao sistema.`
            : `O estudio "${confirmacao?.estudio?.nome}" voltara a ter acesso normalmente.`
        }
        textoConfirmar={confirmacao?.acao === 'suspender' ? 'Suspender' : 'Reativar'}
      />
    </>
  );
}