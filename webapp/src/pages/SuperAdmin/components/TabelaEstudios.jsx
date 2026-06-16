// webapp/src/pages/SuperAdmin/components/TabelaEstudios.jsx

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Users, GraduationCap, MoreHorizontal,
  Pause, Play, Eye, Calendar, Loader2,
} from 'lucide-react';
import Badge from '../../../components/ui/Badge';
import EmptyState from '../../../components/ui/EmptyState';
import Skeleton from '../../../components/ui/Skeleton';
import { ModalConfirmacao } from '../../../components/ui/Modal';
import { showToast } from '../../../components/shared/Toast';
import { superAdminService } from '../../../services/superAdminService';
import { useImpersonation } from '../../../contexts/ImpersonationContext';

function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

const TH = ({ children, className = '' }) => (
  <th className={`py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground ${className}`}>
    {children}
  </th>
);

// Menu de acoes por linha
function MenuAcoes({ estudio, onSuspender, onReativar, onAcessar, acessando }) {
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
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-bold text-info hover:bg-info-soft transition-colors"
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

function LinhaEstudio({ estudio, onSuspender, onReativar, onAcessar, acessando }) {
  const ativo = estudio.status !== 'suspenso';

  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted/40 transition-colors">
      <td className="py-4 pl-6 pr-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary-soft flex items-center justify-center shrink-0">
            <span className="text-primary font-black text-sm">
              {estudio.nome.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-foreground truncate">{estudio.nome}</p>
            <p className="text-xs text-muted-foreground font-mono">{estudio.slug}</p>
          </div>
        </div>
      </td>

      <td className="py-4 px-4 text-center">
        <div className="flex items-center justify-center gap-1.5 text-sm font-bold text-foreground">
          <Users size={14} className="text-muted-foreground" />
          {estudio.total_alunos.toLocaleString('pt-BR')}
        </div>
      </td>

      <td className="py-4 px-4 text-center">
        <div className="flex items-center justify-center gap-1.5 text-sm font-bold text-foreground">
          <GraduationCap size={14} className="text-muted-foreground" />
          {estudio.total_professores.toLocaleString('pt-BR')}
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

  const { data: estudios = [], isLoading } = useQuery({
    queryKey: ['super-admin', 'estudios'],
    queryFn:  superAdminService.listarEstudios,
    staleTime: 1000 * 60,
  });

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
    setAcessandoId(estudio.id);
    try {
      await acessarEstudio(estudio);
      navigate('/dashboard');
    } catch (err) {
      const msg = err?.message ?? '';
      showToast.error(
        msg.includes('Acesso negado') || msg.includes('super_admin')
          ? 'Apenas super_admins podem usar esta funcao.'
          : `Erro ao acessar estudio: ${msg || 'tente novamente.'}`
      );
    } finally {
      setAcessandoId(null);
    }
  }

  const filtrados = busca
    ? estudios.filter((e) => {
        const q = busca.toLowerCase();
        return e.nome.toLowerCase().includes(q) || e.slug.includes(q);
      })
    : estudios;

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
                : filtrados.length === 0
                ? (
                  <tr>
                    <td colSpan={6} className="py-12">
                      <EmptyState
                        icon={<Building2 size={28} />}
                        title={busca ? 'Nenhum estudio encontrado' : 'Nenhum estudio cadastrado'}
                        description={
                          busca
                            ? `Nenhum resultado para "${busca}".`
                            : 'Crie o primeiro estudio usando o botao acima.'
                        }
                        className="border-0 bg-transparent"
                      />
                    </td>
                  </tr>
                )
                : filtrados.map((e) => (
                  <LinhaEstudio
                    key={e.id}
                    estudio={e}
                    onSuspender={(est) => setConfirmacao({ estudio: est, acao: 'suspender' })}
                    onReativar={(est)  => setConfirmacao({ estudio: est, acao: 'reativar'  })}
                    onAcessar={handleAcessar}
                    acessando={acessandoId === e.id && impersonando}
                  />
                ))
              }
            </tbody>
          </table>
        </div>

        {!isLoading && filtrados.length > 0 && (
          <div className="px-6 py-3 border-t border-border bg-muted/20">
            <p className="text-xs text-muted-foreground font-medium">
              {filtrados.length} estudio{filtrados.length !== 1 ? 's' : ''}
              {busca && ` encontrado${filtrados.length !== 1 ? 's' : ''} para "${busca}"`}
            </p>
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