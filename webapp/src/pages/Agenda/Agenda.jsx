import React, { useState } from 'react';
import { Plus, Ban, UserCheck } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useQuery } from '@tanstack/react-query';

import { gradeService } from '../../services/gradeService';
import { alunosService } from '../../services/alunosService';
import { useAgenda } from '../../hooks/useAgenda';
import { useAuth } from '../../hooks/useAuth';
import Modal, { useModal, ModalConfirmacao } from '../../components/ui/Modal';
import { TableSkeleton } from '../../components/shared/Loading';
import { showToast } from '../../components/shared/Toast';

import { useAgendaPage } from './hooks/useAgendaPage';
import { useAgendaDadosMes } from './hooks/useAgendaDadosMes';
import { useGradeMutations } from './hooks/useGradeMutations';
import { useEventosCalendario } from './hooks/useEventosCalendario';
import { useAgendamento } from './hooks/useAgendamento';
import { useListaPresenca } from './hooks/useListaPresenca';
import { useFeriados } from './hooks/useFeriados';

import FiltrosAgenda from './components/FiltrosAgenda';
import CalendarioGrade from './components/CalendarioGrade';
import ModalAgendamento from './components/ModalAgendamento';
import ModalNovaAula from './components/ModalNovaAula';
import ModalListaPresenca from './components/ModalListaPresenca';
import ModalFeriados from './components/ModalFeriados';
import ModalAcoesEvento from './components/ModalAcoesEvento';
import EmptyState from '../../components/ui/EmptyState';
import { CalendarX } from 'lucide-react';
import { useEspacos } from './hooks/useEspacos';
import { IconeEspaco } from '../../lib/iconesEspaco';
import { useMemo } from 'react';

const INITIAL_FORM_STATE = {
  id: null,
  atividade: '',
  modalidadeId: '',
  professorId: '',
  diaSemana: 'segunda-feira',
  horario: '',
  capacidade: 15,
  ehRecorrente: true,
  dataEspecifica: '',
  espaco: 'funcional',
  valorPorAluno: '',
  cor: 'laranja',
  duracaoMinutos: 60, // padrão 1h
};

export default function Agenda() {
  // Bug #13: perfil e professorId agora vêm de useAgendaPage — remove a chamada
  // duplicada a useOutletContext que existia aqui.
  const { perfil, professorId: professorIdLogado, ...pageState } = useAgendaPage();
  const { estudioId } = useAuth();
  const isAdmin = perfil === 'admin';

  const [novaAula, setNovaAula] = useState(INITIAL_FORM_STATE);
  const [eventoSelecionado, setEventoSelecionado] = useState(null);
  const [aulaParaLista, setAulaParaLista] = useState(null);
  const [dataLista, setDataLista] = useState(new Date().toISOString().split('T')[0]);

  const { aulas, feriados, loading, isError, refetch } = useAgenda();
  const { data: espacos = [] } = useEspacos(estudioId);

  const { data: listaAlunos = [] } = useQuery({
    queryKey: ['alunos', estudioId, 'ativos-agendamento'],
    queryFn: () => alunosService.listarAtivos(estudioId),
    enabled: !!estudioId,
    staleTime: 1000 * 60 * 5,
  });

  // Bug #1: passa estudioId e inclui na queryKey para cache isolado por estúdio
  const { data: professores = [] } = useQuery({
    queryKey: ['professores', estudioId],
    queryFn: () => gradeService.listarProfessores(estudioId),
    staleTime: 1000 * 60 * 5,
    enabled: isAdmin && !!estudioId,
  });

  // Bug #1: passa estudioId e inclui na queryKey para cache isolado por estúdio
  const { data: modalidades = [] } = useQuery({
    queryKey: ['modalidades', estudioId],
    queryFn: () => gradeService.listarModalidades(estudioId),
    staleTime: 1000 * 60 * 5,
    enabled: isAdmin && !!estudioId,
  });

  // Bug #8 fix: memoizar idsAulas evita novo array a cada render e permite
  // incluí-lo na queryKey, garantindo re-execução automática quando as aulas
  // mudarem (sem depender de invalidateQueries manual).
  const idsAulas = useMemo(
    () => (aulas || []).map(a => a.id),
    [aulas]
  );

  const { data: matriculasFixas = [] } = useQuery({
    // Bug #11: estudioId incluído na key — isola o cache por tenant.
    // Bug #1: admin e professor usam o mesmo caminho (filtra via aulasIds),
    //         eliminando o vazamento cross-studio do caminho admin anterior.
    // Bug #8 fix: idsAulas incluído na key para invalidação automática.
    queryKey: ['matriculas-fixas', estudioId, idsAulas],
    queryFn: () => {
      if (idsAulas.length === 0) return [];
      return gradeService.listarMatriculasFixas(idsAulas);
    },
    staleTime: 1000 * 60 * 5,
    enabled: idsAulas.length > 0, // aguarda aulas (filtradas por estudioId) carregarem
  });

  const dadosIniciais = { professores, modalidades, matriculasFixas };

  const espacosDisponiveis = useMemo(() => {
    if (isAdmin || !aulas?.length) return undefined;
    const set = new Set(aulas.map(a => a.espaco || espacos[0]?.slug));
    return set;
  }, [isAdmin, aulas, espacos]);

  const emptyStateEspaco = useMemo(() => {
    if (pageState.filtroEspaco === 'todos') return null;
    const espaco = espacos.find(e => e.slug === pageState.filtroEspaco);
    const label = espaco?.nome ?? pageState.filtroEspaco;

    return {
      icon: espaco ? <IconeEspaco nome={espaco.icone} size={28} /> : <CalendarX size={28} />,
      title: `Sem aulas de ${label}`,
      description: isAdmin
        ? `Nenhuma aula de ${label} cadastrada para este período.`
        : `Você não tem aulas de ${label} cadastradas neste período.`,
    };
  }, [pageState.filtroEspaco, isAdmin, espacos]);

  const dadosMes = useAgendaDadosMes(pageState.currentDate);

  const modais = {
    novaAula: useModal(), agendamento: useModal(), lista: useModal(),
    acoesEvento: useModal(), feriados: useModal(), excluir: useModal(), encerrar: useModal(),
  };

  const hookAgendamento = useAgendamento(() => modais.agendamento.fechar(), feriados, estudioId);
  const hookLista = useListaPresenca(aulaParaLista, dataLista, modais.lista.isOpen);
  const hookFeriados = useFeriados(refetch);
  const eventosCalendario = useEventosCalendario({ aulas, feriados, ...dadosMes, matriculasFixas: dadosIniciais.matriculasFixas, ...pageState });

  const mutations = useGradeMutations({
    onSuccess: () => {
      Object.values(modais).forEach((m) => m.isOpen && m.fechar());
      refetch();
    },
  });

  const handleSelectSlot = ({ start }) => {
    if (!isAdmin) return;
    const dataStr = format(start, 'yyyy-MM-dd');
    const ehFeriado = feriados.find((f) => f.data === dataStr && f.bloqueia_agenda);
    if (ehFeriado) return showToast.error(`Data bloqueada: ${ehFeriado.descricao}`);

    const dia = format(start, 'eeee', { locale: ptBR }).toLowerCase();
    setNovaAula({
      ...INITIAL_FORM_STATE,
      horario: format(start, 'HH:mm'),
      diaSemana: dia,
      dataEspecifica: dataStr,
    });
    modais.novaAula.abrir();
  };

  const btnBase = 'px-6 py-3 rounded-2xl font-bold flex items-center gap-2 transition-colors disabled:opacity-50';
  const btnSecondary = `${btnBase} bg-muted text-muted-foreground hover:bg-subtle`;
  const btnInfo = `${btnBase} bg-info text-info-foreground hover:bg-info/90`;
  const btnPrimary = `${btnBase} bg-primary text-primary-foreground hover:bg-primary/90`;

  return (
    <div className="p-8 space-y-6 animate-in fade-in duration-500 min-h-screen flex flex-col bg-background">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-black text-foreground tracking-tight">Grade de Aulas</h1>
          <p className="text-muted-foreground font-medium">Visualize e organize a agenda do estúdio.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          {isAdmin && (
            <button onClick={modais.feriados.abrir} className={btnSecondary}>
              <Ban size={20} /> Bloqueios ({feriados.length})
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => {
                hookAgendamento.setAgendamentoForm({ ...hookAgendamento.agendamentoForm, aula_id: '', data_aula: '' });
                modais.agendamento.abrir();
              }}
              className={btnInfo}
            >
              <UserCheck size={20} /> Agendar na Turma
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => {
                setNovaAula(INITIAL_FORM_STATE);
                modais.novaAula.abrir();
              }}
              className={btnPrimary}
            >
              <Plus size={20} /> Nova Aula
            </button>
          )}
        </div>
      </div>

      <FiltrosAgenda 
  {...pageState} 
  professores={dadosIniciais.professores} 
  isAdmin={isAdmin}
  espacos={espacos}
  espacosDisponiveis={espacosDisponiveis}
/>

      <div className="bg-card p-6 rounded-[32px] border border-border shadow-sm" style={{ height: '750px' }}>
        {isError ? (
          <div className="h-full flex items-center justify-center">
            <EmptyState
              icon={<CalendarX size={28} />}
              title="Erro ao carregar agenda"
              description="Não foi possível buscar as aulas. Verifique sua conexão e tente novamente."
              action={
                <button
                  onClick={refetch}
                  className="text-sm font-bold text-primary hover:underline"
                >
                  Tentar novamente
                </button>
              }
            />
          </div>
        ) : loading ? (
          <TableSkeleton />
        ) : eventosCalendario.filter(e => !e.isFeriado).length === 0 && emptyStateEspaco ? (
          // Filtro de espaço ativo mas sem eventos — EmptyState contextual
          <div className="h-full flex items-center justify-center">
            <EmptyState
              icon={emptyStateEspaco.icon}
              title={emptyStateEspaco.title}
              description={emptyStateEspaco.description}
              action={
                <button
                  onClick={() => pageState.setFiltroEspaco('todos')}
                  className="text-sm font-bold text-primary hover:underline"
                >
                  Ver todos os espaços
                </button>
              }
            />
          </div>
        ) : (
          <CalendarioGrade
            eventos={eventosCalendario}
            currentDate={pageState.currentDate}
            setCurrentDate={pageState.setCurrentDate}
            currentView={pageState.currentView}
            setCurrentView={pageState.setCurrentView}
            handleSelectSlot={handleSelectSlot}
            isAdmin={isAdmin}
            handleSelectEvent={(ev) => {
              ev.isFeriado
                ? showToast.error(`Dia bloqueado: ${ev.dadosOriginais.descricao}`)
                : (setEventoSelecionado(ev), modais.acoesEvento.abrir());
            }}
          />
        )}
      </div>

      <Modal isOpen={modais.agendamento.isOpen} onClose={modais.agendamento.fechar} titulo="Agendamento">
        <ModalAgendamento {...hookAgendamento} aulas={aulas} listaAlunos={listaAlunos} />
      </Modal>
      <Modal isOpen={modais.novaAula.isOpen} onClose={modais.novaAula.fechar} titulo={novaAula.id ? 'Editar Atividade' : 'Nova Aula'}>
        <ModalNovaAula
  novaAula={novaAula}
  setNovaAula={setNovaAula}
  modalidades={dadosIniciais.modalidades}
  professores={dadosIniciais.professores}
  espacos={espacos}
  savingAula={mutations.savingAula}
  salvarAula={(e) => {
    e.preventDefault();
    mutations.salvarAula(novaAula);
  }}
/>
      </Modal>
      <Modal isOpen={modais.lista.isOpen} onClose={modais.lista.fechar} titulo="Chamada">
        <ModalListaPresenca {...hookLista} aulaParaLista={aulaParaLista} dataLista={dataLista} setDataLista={setDataLista} isAdmin={isAdmin} />
      </Modal>
      {isAdmin && (
        <Modal isOpen={modais.feriados.isOpen} onClose={modais.feriados.fechar} titulo="Gerenciar Bloqueios (Feriados)">
          <ModalFeriados feriados={feriados} {...hookFeriados} />
        </Modal>
      )}

      <Modal isOpen={modais.acoesEvento.isOpen} onClose={modais.acoesEvento.fechar} titulo="Detalhes da Aula">
        <ModalAcoesEvento
  evento={eventoSelecionado}
  isAdmin={isAdmin}
  espacos={espacos}
  onAgendar={(ev) => {
            modais.acoesEvento.fechar();
            hookAgendamento.setAgendamentoForm({
              tipo: 'cadastrado',
              aluno_id: '',
              nome_visitante: '',
              aula_id: ev.dadosOriginais.id,
              data_aula: format(ev.start, 'yyyy-MM-dd'),
              _nomeAluno: '',
              _nomeAtividade: ev.dadosOriginais.atividade || '',
            });
            modais.agendamento.abrir();
          }}
          onChamada={(ev) => {
            modais.acoesEvento.fechar();
            setAulaParaLista(ev.dadosOriginais);
            setDataLista(format(ev.start, 'yyyy-MM-dd'));
            modais.lista.abrir();
          }}
          onEditar={(ev) => {
            modais.acoesEvento.fechar();
            const d = ev.dadosOriginais;
            setNovaAula({
              id: d.id,
              atividade: d.atividade,
              modalidadeId: d.modalidade_id || '',
              professorId: d.professor_id || '',
              diaSemana: String(d.dia_semana || 'segunda-feira').toLowerCase(),
              horario: d.horario,
              capacidade: d.capacidade,
              ehRecorrente: d.eh_recorrente,
              dataEspecifica: d.data_especifica || '',
              espaco: d.espaco,
              valorPorAluno: d.valor_por_aluno || '',
              cor: d.cor,
              duracaoMinutos: d.duracao_minutos ?? 60, // carrega duração salva ao editar
            });
            modais.novaAula.abrir();
          }}
          onEncerrar={() => modais.encerrar.abrir()}
          onExcluir={() => modais.excluir.abrir()}
        />
      </Modal>

      {/* Bug #8: guards contra eventoSelecionado null nos onConfirm */}
      <ModalConfirmacao
        isOpen={modais.excluir.isOpen}
        onClose={modais.excluir.fechar}
        onConfirm={() => {
          if (!eventoSelecionado) return;
          mutations.excluirAula(eventoSelecionado.dadosOriginais.id);
        }}
        titulo="Excluir Grade Permanentemente"
        mensagem="Atenção: Ao confirmar, todas as aulas e presenças desta grade serão apagadas. Esta ação NÃO pode ser desfeita."
        tipo="danger"
      />
      <ModalConfirmacao
        isOpen={modais.encerrar.isOpen}
        onClose={modais.encerrar.fechar}
        onConfirm={() => {
          if (!eventoSelecionado) return;
          mutations.encerrarAula(eventoSelecionado.dadosOriginais.id, eventoSelecionado.start);
        }}
        titulo="Encerrar Turma"
        mensagem={`O histórico será mantido, mas esta turma não aparecerá mais a partir de ${
          eventoSelecionado ? format(eventoSelecionado.start, 'dd/MM/yyyy') : ''
        }. Confirma?`}
        tipo="warning"
      />
    </div>
  );
}