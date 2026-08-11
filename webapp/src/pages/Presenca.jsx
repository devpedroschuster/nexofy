import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useImpersonation } from '../context/ImpersonationContext';
import { presencaService } from '../services/presencaService';
import { supabase } from '../lib/supabase';
import {
  Search, Calendar, TrendingUp, Clock, Award, Users, CheckCircle2,
  Download, BarChart2, ArrowRight
} from 'lucide-react';
import { showToast } from '../components/shared/Toast';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Surface from '../components/ui/Surface';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';

// ─────────────────────────────────────────────────────────────────────────
// NOTA DE ARQUITETURA (auditoria):
// A antiga aba "Chamada Rápida" desta página foi REMOVIDA. Ela duplicava,
// sobre uma tabela (`presencas`, plural) e schema já substituídos, uma
// funcionalidade que já existe — corretamente implementada, com isolamento
// de tenant e usando o schema atual (`presenca`, singular; origem/status) —
// em Agenda/components/ModalListaPresenca.jsx + useListaPresenca.js.
// Manter as duas implementações em paralelo é o que causava o bug crítico
// de dados de presença gravados aqui não aparecerem em nenhum outro lugar
// do sistema. Esta página agora é só o relatório/dashboard, lendo do
// mesmo `presencaService` usado pelo resto do app.
//
// FIX (auditoria — timezone): todo cálculo de "hoje"/período usa o fuso
// America/Sao_Paulo explicitamente. Antes, `new Date().toISOString()`
// convertia para UTC, fazendo "hoje" virar o dia seguinte entre ~21h e
// meia-noite no horário de Brasília — o card "Presentes Hoje" e o filtro
// "Hoje" mostravam o dia errado nesse intervalo.
// ─────────────────────────────────────────────────────────────────────────

const TZ_ESTUDIO = 'America/Sao_Paulo';
const isoFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TZ_ESTUDIO }); // en-CA => YYYY-MM-DD

function hojeISO() {
  return isoFormatter.format(new Date());
}

function paraISO(data) {
  return isoFormatter.format(data);
}

function obterPeriodo(periodo) {
  const hoje = new Date(`${hojeISO()}T12:00:00`); // meio-dia: evita virada de dia por causa de DST/fuso ao usar setDate/setMonth
  const inicio = new Date(hoje);
  const fim = new Date(hoje);

  if (periodo === 'hoje') {
    const h = hojeISO();
    return { inicio: h, fim: h };
  } else if (periodo === 'semana') {
    inicio.setDate(hoje.getDate() - hoje.getDay());
    fim.setDate(inicio.getDate() + 6);
  } else if (periodo === 'mes') {
    inicio.setDate(1);
    fim.setMonth(fim.getMonth() + 1, 0);
  }
  return { inicio: paraISO(inicio), fim: paraISO(fim) };
}

const ICON_TONE = {
  brand:   'bg-primary-soft text-primary',
  info:    'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  purple:  'bg-purple-soft text-purple',
  neutral: 'bg-muted text-muted-foreground',
};

function CardMetrica({ titulo, valor, subtitulo, icone, tone = 'neutral' }) {
  return (
    <Surface variant="card" padding="lg" className="rounded-[32px] hover:shadow-md transition-all">
      <div className={`${ICON_TONE[tone]} w-12 h-12 rounded-2xl flex items-center justify-center mb-4`}>
        {icone}
      </div>
      <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider mb-2">{titulo}</p>
      <h2 className="text-3xl font-black text-foreground mb-1">{valor}</h2>
      {subtitulo && <p className="text-xs text-muted-foreground font-medium">{subtitulo}</p>}
    </Surface>
  );
}

// Escapa um campo para CSV (aspas, vírgulas e quebras de linha).
function escaparCampoCsv(valor) {
  const v = valor == null ? '' : String(valor);
  if (/[",\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

// presenca.status: 'agendado' | 'presente' | 'falta_justificada' | 'falta_nao_avisada'
// presenca.data_aula: date (YYYY-MM-DD) — não é timestamp de check-in.
function calcularMetricas(presencasData, alunosData) {
  const hojeStr = hojeISO(); // FIX: fuso do estúdio, não UTC
  const alunosAtivos = alunosData.length;
  const seteDiasAtras = new Date(`${hojeStr}T00:00:00`);
  seteDiasAtras.setDate(seteDiasAtras.getDate() - 7);

  let presentesHoje = 0;
  const presencasPorAluno = new Map();
  const presencasPorDia = new Array(7).fill(0);

  for (const p of presencasData) {
    if (p.status !== 'presente' || !p.data_aula) continue;
    if (p.data_aula === hojeStr) presentesHoje++;

    const dataAula = new Date(`${p.data_aula}T00:00:00`);
    if (dataAula >= seteDiasAtras) {
      if (p.aluno_id != null) {
        presencasPorAluno.set(p.aluno_id, (presencasPorAluno.get(p.aluno_id) || 0) + 1);
      }
      presencasPorDia[dataAula.getDay()]++;
    }
  }

  const taxasIndividuais = alunosData.map(aluno => {
    const esperado = Number(aluno.planos?.frequencia_semanal) || 1;
    const real = presencasPorAluno.get(aluno.id) || 0;
    return Math.min(real / esperado, 1);
  });

  const frequenciaMedia = alunosAtivos > 0
    ? ((taxasIndividuais.reduce((acc, taxa) => acc + taxa, 0) / alunosAtivos) * 100).toFixed(1)
    : 0;

  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const presencaPorDia = diasSemana.map((dia, idx) => ({ dia, total: presencasPorDia[idx] }));

  const totalSemana = presencaPorDia.reduce((acc, v) => acc + v.total, 0);
  const mediaDiaria = Math.round(totalSemana / 7);

  return { presentesHoje, frequenciaMedia, alunosAtivos, presencaSemana: presencaPorDia, mediaDiaria };
}

export default function Presenca() {
  // CR1 FIX: mesmo padrão de useAuth + useImpersonation usado no resto do app —
  // sem isso, super_admin em impersonation não tem estúdio efetivo, e sem
  // idEfetivo TODA query aqui era feita sem isolamento de tenant.
  const { estudioId } = useAuth();
  const { estudioAtivo } = useImpersonation();
  const idEfetivo = estudioAtivo?.id ?? estudioId;

  const [alunos, setAlunos] = useState([]);
  const [aulas, setAulas] = useState([]);
  const [presencas, setPresencas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ periodo: 'hoje', aluno: 'todos', aula: 'todas' });

  // Guarda contra race conditions: só aplica a resposta da requisição mais recente.
  const fetchIdRef = useRef(0);

  const fetchDados = useCallback(async () => {
    if (!idEfetivo) {
      setAlunos([]);
      setAulas([]);
      setPresencas([]);
      setLoading(false);
      return;
    }

    const fetchId = ++fetchIdRef.current;
    setLoading(true);
    try {
      const { inicio, fim } = obterPeriodo(filtros.periodo);

      const [{ data: alunosData, error: errAlunos }, { data: aulasData, error: errAulas }, presencasData] =
        await Promise.all([
          supabase
            .from('alunos')
            .select('id, nome_completo, email, plano_id, planos(frequencia_semanal)')
            .eq('estudio_id', idEfetivo)
            .eq('ativo', true)
            .eq('role', 'aluno')
            .order('nome_completo'),
          supabase
            .from('agenda')
            .select('id, atividade, horario, dia_semana')
            .eq('estudio_id', idEfetivo)
            .eq('ativa', true)
            .order('dia_semana')
            .order('horario'),
          presencaService.listarPeriodo(inicio, fim, idEfetivo),
        ]);

      if (errAlunos) throw errAlunos;
      if (errAulas) throw errAulas;

      // Resposta obsoleta (usuário já mudou o filtro/estúdio) — descarta.
      if (fetchId !== fetchIdRef.current) return;

      setAlunos(alunosData || []);
      setAulas(aulasData || []);
      setPresencas(presencasData || []);
    } catch (err) {
      console.error('[Presenca] erro ao carregar dados:', err?.code, err?.message, err);
      if (fetchId === fetchIdRef.current) {
        showToast.error('Erro ao carregar dados de presença.');
      }
    } finally {
      if (fetchId === fetchIdRef.current) setLoading(false);
    }
  }, [idEfetivo, filtros.periodo]);

  useEffect(() => { fetchDados(); }, [fetchDados]);

  // FIX (performance): cálculo derivado memoizado — evita reprocessar todo o
  // array de presenças a cada render que não mude `presencas`/`alunos`.
  const metricas = useMemo(
    () => calcularMetricas(presencas, alunos),
    [presencas, alunos]
  );

  // FIX (performance): filtragem derivada memoizada.
  const presencasFiltradas = useMemo(() => presencas.filter(p => {
    const matchAluno = filtros.aluno === 'todos' || String(p.aluno_id) === String(filtros.aluno);
    const matchAula = filtros.aula === 'todas' || String(p.aula_id) === String(filtros.aula);
    return matchAluno && matchAula;
  }), [presencas, filtros.aluno, filtros.aula]);

  const maxAltura = useMemo(
    () => Math.max(1, ...metricas.presencaSemana.map(d => d.total)),
    [metricas.presencaSemana]
  );

  function exportarRelatorio() {
    const dadosExport = presencasFiltradas.map(p => ({
      Aluno: p.alunos?.nome_completo || p.leads?.nome_visitante || '',
      Data: p.data_aula || '',
      Origem: p.origem || '',
      Status: p.status || '',
    }));
    if (!dadosExport.length) {
      showToast.error('Nenhum dado para exportar.');
      return;
    }
    const headers = Object.keys(dadosExport[0]);
    const csvRows = [
      headers.join(','),
      ...dadosExport.map(row => headers.map(h => escaparCampoCsv(row[h])).join(',')),
    ];
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `presencas_${filtros.periodo}.csv`);
    link.click();
    URL.revokeObjectURL(url);
    showToast.success('Relatório exportado!');
  }

  return (
    <div className="p-4 md:p-8 space-y-6 animate-in fade-in duration-500">
      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-foreground tracking-tight">
            Presença & Check-in
          </h1>
          <p className="text-muted-foreground">Relatório de frequência dos alunos do estúdio.</p>
        </div>
        <Button variant="outline" size="md" leftIcon={<Download size={18} />} onClick={exportarRelatorio}>
          Exportar
        </Button>
      </div>

      {/* Aviso: chamada rápida agora vive na Agenda */}
      <Surface variant="card" padding="md" className="rounded-2xl border border-dashed border-info/30 bg-info-soft/30 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="bg-info text-info-foreground w-9 h-9 rounded-xl flex items-center justify-center shrink-0">
            <Calendar size={18} />
          </div>
          <p className="text-sm text-foreground font-medium">
            Para fazer a chamada de uma aula, use o calendário da Agenda — lá você confirma presença,
            registra falta e vê agendados avulsos/leads em tempo real.
          </p>
        </div>
        <Button as="a" href="/agenda" variant="info" size="sm" rightIcon={<ArrowRight size={16} />}>
          Ir para Agenda
        </Button>
      </Surface>

      {/* KPI Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => <Skeleton.Card key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <CardMetrica titulo="Presentes Hoje" valor={metricas.presentesHoje} icone={<CheckCircle2 />} tone="success" />
          <CardMetrica titulo="Taxa de Frequência" valor={`${metricas.frequenciaMedia}%`} subtitulo="última semana" icone={<TrendingUp />} tone="info" />
          <CardMetrica titulo="Alunos Ativos" valor={metricas.alunosAtivos} icone={<Users />} tone="brand" />
          <CardMetrica titulo="Média Diária" valor={metricas.mediaDiaria} subtitulo="últimos 7 dias" icone={<Award />} tone="purple" />
        </div>
      )}

      {/* Gráfico semanal */}
      {!loading && metricas.presencaSemana.length > 0 && (
        <Surface variant="card" padding="xl" className="rounded-[40px]">
          <h3 className="font-bold text-foreground mb-6 flex items-center gap-2">
            <BarChart2 size={18} className="text-primary" /> Distribuição Semanal
          </h3>
          <div className="flex gap-2 items-end h-48">
            {metricas.presencaSemana.map((dia, idx) => {
              const altura = (dia.total / maxAltura) * 100;
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-2">
                  <div className="flex-1 flex items-end w-full">
                    <div
                      className="bg-primary rounded-t-xl w-full transition-all hover:brightness-95"
                      style={{ height: `${altura}%`, minHeight: dia.total > 0 ? '20px' : '0' }}
                    />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-foreground">{dia.total}</p>
                    <p className="text-[10px] text-muted-foreground font-bold">{dia.dia}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Surface>
      )}

      {/* Filtros */}
      <Surface variant="card" padding="lg" className="rounded-[28px]">
        <div className="flex flex-wrap gap-4">
          <div className="flex gap-2 bg-muted p-1 rounded-2xl border border-border">
            {['hoje', 'semana', 'mes'].map(periodo => (
              <button
                key={periodo}
                onClick={() => setFiltros({ ...filtros, periodo })}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase transition-all ${
                  filtros.periodo === periodo
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {periodo}
              </button>
            ))}
          </div>
          <Input as="select" className="w-auto" aria-label="Filtrar por aluno" value={filtros.aluno}
            onChange={e => setFiltros({ ...filtros, aluno: e.target.value })}>
            <option value="todos">Todos os Alunos</option>
            {alunos.map(a => <option key={a.id} value={a.id}>{a.nome_completo}</option>)}
          </Input>
          <Input as="select" className="w-auto" aria-label="Filtrar por aula" value={filtros.aula}
            onChange={e => setFiltros({ ...filtros, aula: e.target.value })}>
            <option value="todas">Todas as Aulas</option>
            {aulas.map(a => <option key={a.id} value={a.id}>{a.atividade} - {a.horario}</option>)}
          </Input>
        </div>
      </Surface>

      {/* Tabela */}
      <Surface variant="card" padding="none" className="rounded-[40px] overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(5)].map((_, i) => <Skeleton.Row key={i} />)}
          </div>
        ) : presencasFiltradas.length === 0 ? (
          <EmptyState
            icon={<Users size={28} />}
            title="Nenhuma presença registrada"
            description="Faça a chamada na Agenda para ver os dados aqui."
          />
        ) : (
          <table className="w-full text-left">
            <thead className="bg-muted/50 text-[10px] font-black uppercase text-muted-foreground border-b border-border">
              <tr>
                <th className="px-8 py-5">Aluno / Visitante</th>
                <th className="px-8 py-5">Data</th>
                <th className="px-8 py-5">Origem</th>
                <th className="px-8 py-5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {presencasFiltradas.map(p => (
                <tr key={p.id} className="hover:bg-primary-soft/30 transition-colors">
                  <td className="px-8 py-5">
                    <p className="font-bold text-foreground">
                      {p.alunos?.nome_completo || p.leads?.nome_visitante || '—'}
                    </p>
                  </td>
                  <td className="px-8 py-5 text-sm text-muted-foreground">
                    {p.data_aula ? new Date(`${p.data_aula}T00:00:00`).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="px-8 py-5 text-sm text-muted-foreground capitalize">{p.origem}</td>
                  <td className="px-8 py-5">
                    <span className="inline-flex items-center gap-1 text-xs font-bold">
                      {p.status === 'presente' && <CheckCircle2 size={14} className="text-success" />}
                      {p.status === 'agendado' && <Clock size={14} className="text-warning" />}
                      {p.status?.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Surface>
    </div>
  );
}