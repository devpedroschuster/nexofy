import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm, useWatch } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import {
  ArrowLeft, ArrowRight, User, Mail, ShieldCheck, Package,
  RefreshCw, Copy, Check, CreditCard, Calendar, Phone, MapPin,
  Home, CheckCircle2, CalendarDays, AlertTriangle, Trash2, Plus,
  Info, Lock, AlertCircle, KeyRound,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import * as Sentry from '@sentry/react';

import { alunosService } from '../services/alunosService';
import { alunoSchema } from '../lib/validation';
import { formatarCPF, validarCPF, formatarTelefone, ehMenorDeIdade } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { useEstudio } from '../hooks/useEstudio';
import { useAuth } from '../hooks/useAuth';
import { useImpersonation } from "../context/ImpersonationContext";
import { useBuscaCep } from '../hooks/useBuscaCep';
import { useCamposDinamicos } from '../hooks/useCamposDinamicos';
import { construirSchemaMetadata } from '../lib/camposDinamicosValidation';
import { alunosKeys } from '../lib/alunosQueryKeys';
import { showToast } from '../components/shared/Toast';
import Modal from '../components/ui/Modal';
import { CamposDinamicosGrid } from '../components/shared/CampoDinamicoInput';

const STEPS = [
  { id: 1, label: 'Pessoal',   icon: User     },
  { id: 2, label: 'Contato',   icon: Phone    },
  { id: 3, label: 'Endereço',  icon: MapPin   },
  { id: 4, label: 'Plano',     icon: Package  },
];

function StepIndicator({ stepAtual }) {
  return (
    <div className="flex items-center mb-8">
      {STEPS.map((s, i) => {
        const completo = s.id < stepAtual;
        const ativo    = s.id === stepAtual;
        return (
          <React.Fragment key={s.id}>
            <div className="flex flex-col items-center gap-1.5 flex-shrink-0">
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center font-black text-sm
                transition-all duration-300
                ${completo ? 'bg-success text-success-foreground shadow-sm'
                  : ativo   ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30 scale-110'
                  :           'bg-muted text-muted-foreground'}
              `}>
                {completo ? <Check size={16} /> : <s.icon size={16} />}
              </div>
              <span className={`
                text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-colors
                ${ativo ? 'text-primary' : completo ? 'text-success' : 'text-muted-foreground'}
              `}>
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`
                flex-1 h-0.5 mx-2 mb-4 rounded-full transition-all duration-500
                ${s.id < stepAtual ? 'bg-success' : 'bg-muted'}
              `} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function CpfField({ cpfDisplay, cpfErro, onChange }) {
  return (
    <div>
      <div className="relative">
        <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input
          value={cpfDisplay}
          onChange={onChange}
          placeholder="CPF (Opcional)"
          maxLength={14}
          className={`w-full pl-12 pr-4 py-4 bg-muted rounded-2xl border outline-none font-medium
            text-foreground transition-colors focus:border-primary
            ${cpfErro ? 'border-destructive/40 bg-destructive-soft' : 'border-transparent'}`}
        />
      </div>
      {cpfErro && (
        <p className="text-xs text-destructive mt-1.5 ml-1 font-medium flex items-center gap-1">
          <AlertCircle size={12} /> {cpfErro}
        </p>
      )}
    </div>
  );
}

function CepField({ register, buscandoCep, cepErro, onBlur, className = '' }) {
  return (
    <div className={className}>
      <div className="relative">
        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
        <input
          {...register('cep')}
          onBlur={onBlur}
          placeholder="CEP"
          maxLength={9}
          className={`w-full pl-12 pr-10 py-4 bg-muted rounded-2xl border outline-none font-medium
            text-foreground transition-colors focus:border-primary
            ${cepErro ? 'border-primary/40' : 'border-transparent'}`}
        />
        {buscandoCep && (
          <RefreshCw
            className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground"
            size={16}
          />
        )}
      </div>
      {cepErro && (
        <p className="text-xs text-primary mt-1.5 ml-1 font-medium flex items-center gap-1">
          <AlertCircle size={12} /> {cepErro}
        </p>
      )}
    </div>
  );
}

// PED-170 (LGPD art. 14): aluno menor de 18 anos exige identificação e
// consentimento do responsável legal antes de liberar o cadastro completo.
// `jaConsentido` vem de um registro existente em consentimentos_responsavel_legal
// (edição de aluno já consentido antes) — nesse caso o checkbox já chega
// marcado (setValue no efeito de carregarFichaCompleta) e este fieldset só
// avisa que já há consentimento, sem forçar o operador a re-digitar os dados
// do responsável pra poder salvar qualquer outra alteração no cadastro.
function ResponsavelLegalFieldset({ register, errors, jaConsentido }) {
  return (
    <div className="md:col-span-2 bg-warning-soft border border-warning/30 rounded-2xl p-5 space-y-4
      animate-in slide-in-from-top-2">
      <div className="flex items-center gap-2">
        <ShieldCheck className="text-warning shrink-0" size={18} />
        <h4 className="font-black text-warning text-xs uppercase tracking-widest">
          Responsável Legal — obrigatório para menores de 18 anos
        </h4>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <input
            {...register('responsavel_legal_nome')}
            placeholder="Nome completo do responsável legal *"
            className="w-full px-4 py-4 bg-card rounded-2xl border border-transparent
              focus:border-primary outline-none font-medium text-foreground"
          />
          {errors.responsavel_legal_nome && (
            <p className="text-xs text-destructive mt-1.5 ml-1 font-medium">
              {errors.responsavel_legal_nome.message}
            </p>
          )}
        </div>
        <div>
          <input
            {...register('responsavel_legal_cpf')}
            placeholder="CPF do responsável *"
            maxLength={14}
            className="w-full px-4 py-4 bg-card rounded-2xl border border-transparent
              focus:border-primary outline-none font-medium text-foreground"
          />
          {errors.responsavel_legal_cpf && (
            <p className="text-xs text-destructive mt-1.5 ml-1 font-medium">
              {errors.responsavel_legal_cpf.message}
            </p>
          )}
        </div>
        <div>
          <select
            {...register('responsavel_legal_parentesco')}
            defaultValue=""
            className="w-full px-4 py-4 bg-card rounded-2xl border border-transparent
              focus:border-primary outline-none font-bold text-muted-foreground cursor-pointer"
          >
            <option value="">Parentesco...</option>
            <option value="mae">Mãe</option>
            <option value="pai">Pai</option>
            <option value="tutor_legal">Tutor(a) legal</option>
            <option value="outro">Outro responsável</option>
          </select>
          {errors.responsavel_legal_parentesco && (
            <p className="text-xs text-destructive mt-1.5 ml-1 font-medium">
              {errors.responsavel_legal_parentesco.message}
            </p>
          )}
        </div>
      </div>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          {...register('consentimento_responsavel')}
          className="mt-1 w-4 h-4 accent-warning shrink-0"
        />
        <span className="text-xs text-warning leading-relaxed font-medium">
          Declaro ser responsável legal por este aluno e autorizo o cadastro e o
          tratamento dos seus dados pessoais nesta plataforma, em conformidade com a
          LGPD (Lei 13.709/2018, art. 14).
        </span>
      </label>
      {errors.consentimento_responsavel && (
        <p className="text-xs text-destructive ml-1 font-medium">
          {errors.consentimento_responsavel.message}
        </p>
      )}
      {jaConsentido && (
        <p className="text-xs text-success font-bold flex items-center gap-1.5">
          <Check size={12} /> Consentimento já registrado para este aluno.
        </p>
      )}
    </div>
  );
}

// Main component
export default function NovoAluno() {
  const navigate     = useNavigate();
  const location     = useLocation();
  const queryClient  = useQueryClient();

  const alunoParaEditar   = location.state?.alunoParaEditar   || null;
  const leadParaConversao = location.state?.leadParaConversao || null;

  const { estudioId } = useAuth();
  const { estudioAtivo } = useImpersonation();
  // FIX: super_admin em impersonation tem estudioId === null vindo de useAuth();
  // sem compor com o estúdio ativo da impersonation, todo o formulário ficava
  // travado silenciosamente para esse perfil.
  const idEfetivo = estudioAtivo?.id ?? estudioId;
  // FIX: useEstudio precisa do id para a query ficar habilitada — antes era
  // chamado sem argumento e "estudio" nunca carregava (nomeEstudio sempre undefined).
  const { data: estudio } = useEstudio(idEfetivo);
  const nomeEstudio = estudio?.nome;

  const [abaAtiva,                setAbaAtiva]                = useState('dados');
  const [planos,                  setPlanos]                  = useState([]);
  const [modalidades,             setModalidades]             = useState([]);
  const [modalidadesSelecionadas, setModalidadesSelecionadas] = useState([]);
  const [aulasGrade,              setAulasGrade]              = useState([]);
  const [matriculasAluno,         setMatriculasAluno]         = useState([]);
  const [loadingAgenda,           setLoadingAgenda]           = useState(false);
  const [modalOpen,               setModalOpen]               = useState(false);

  const [confirmModal, setConfirmModal] = useState(null);

  const [copiado,                 setCopiado]                 = useState(false);
  const [dadosCriados,            setDadosCriados]            = useState(null);
  const [dataVencimento,          setDataVencimento]          = useState(
    new Date().toISOString().split('T')[0]
  );

  const [stepAtual, setStepAtual] = useState(1);

  const [cpfDisplay, setCpfDisplay] = useState('');
  const [cpfErro,    setCpfErro]    = useState('');

  // Item 1 do plano multi-segmento: valores dos campos dinâmicos do estúdio.
  // Fica em state separado (não dentro do react-hook-form) porque o schema
  // fixo (alunoSchema) não conhece o catálogo dinâmico por tenant — mesma
  // razão pela qual o service faz merge no backend em vez de o form tentar
  // validar um schema variável.
  const { campos: camposDinamicos } = useCamposDinamicos('aluno');
  const [metadataForm, setMetadataForm] = useState({});
  const [errosMetadata, setErrosMetadata] = useState({});

  const [cadastroSalvo,  setCadastroSalvo]  = useState(false);
  const [alunoSalvoId,   setAlunoSalvoId]   = useState(null);
  const [alunoSalvoEmail,setAlunoSalvoEmail]= useState('');
  const [alunoSalvoNome, setAlunoSalvoNome] = useState('');
  const [criandoAcesso,  setCriandoAcesso]  = useState(false);
  const [erroAcesso,     setErroAcesso]     = useState('');
  const [acessoCriado,   setAcessoCriado]   = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    trigger,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: yupResolver(alunoSchema),
    defaultValues: { role: 'aluno' },
  });

  const roleAtual          = watch('role');
  const planoSelecionado   = watch('plano_id');
  const dataInicioPlano    = useWatch({ control, name: 'data_inicio_plano' });
  // PED-170: reavaliado a cada digitação de data_nascimento — controla tanto
  // a exibição do bloco "Responsável Legal" quanto quais campos entram na
  // validação por step (avancarStep) e no payload de consentimento no submit.
  const dataNascimentoAtual = useWatch({ control, name: 'data_nascimento' });
  const menorDeIdade        = ehMenorDeIdade(dataNascimentoAtual);
  const [consentimentoResponsavel, setConsentimentoResponsavel] = useState(null);
  const planoSelecionadoObj = planos.find(p => String(p.id) === String(planoSelecionado));
  const regrasPlano         = planoSelecionadoObj?.regras_acesso || [];

  // FIX (PED-97): useBuscaCep precisa vir antes deste useEffect — ele usa
  // limparCepErro, que só existe depois da chamada do hook. Com a ordem
  // antiga (useBuscaCep declarado ~150 linhas abaixo), o array de
  // dependências deste efeito referenciava limparCepErro antes da
  // inicialização do const, um TDZ real (não específico de build de
  // produção): "ReferenceError: Cannot access 'limparCepErro' before
  // initialization", ofuscado para "Cannot access 'Xe' before
  // initialization" no bundle minificado. Reproduzido de forma
  // determinística renderizando <NovoAluno /> sozinho (sem auth/dados),
  // então a causa é puramente de ordem de execução, não de dados.
  const { buscarCep, buscandoCep, cepErro, limparCepErro } = useBuscaCep((data) => {
    setValue('rua',    data.logradouro, { shouldValidate: true });
    setValue('bairro', data.bairro,     { shouldValidate: true });
    setValue('cidade', data.localidade, { shouldValidate: true });
    document.getElementById('input-numero')?.focus();
  });

  useEffect(() => {
    if (!alunoParaEditar && !leadParaConversao) {
      reset({ nome_completo: '', email: '', role: 'aluno' });
      setModalidadesSelecionadas([]);
      setCpfDisplay('');
      setCpfErro('');
      limparCepErro();
      setStepAtual(1);
      setCadastroSalvo(false);
      setMetadataForm({});
      setConsentimentoResponsavel(null);
    }
  }, [location.pathname, reset, alunoParaEditar, leadParaConversao, limparCepErro]);

  useEffect(() => {
    if (!planoSelecionadoObj || !dataInicioPlano) return;
    // O browser envia YYYY-MM-DD mesmo com ano incompleto (ex: 0002, 0020, 0202).
    // Só calcula quando o ano for razoável (>= 1900) para evitar re-render
    // durante a digitação do ano, o que desfocava o campo.
    const ano = parseInt(dataInicioPlano.split('-')[0], 10);
    if (!ano || ano < 1900) return;
    const dataInicio = new Date(dataInicioPlano + 'T12:00:00');
    if (isNaN(dataInicio.getTime())) return;
    const meses   = planoSelecionadoObj.duracao_meses || 1;
    const dataFim = new Date(dataInicio);
    dataFim.setMonth(dataFim.getMonth() + meses);
    dataFim.setDate(dataFim.getDate() - 1);
    setValue('data_fim_plano', dataFim.toISOString().split('T')[0]);
  }, [planoSelecionadoObj, dataInicioPlano, setValue]);

  useEffect(() => {
    let cancelled = false; // FIX: evita setState em componente desmontado (navegação rápida)

    async function carregarDados() {
      if (!idEfetivo) return;
      try {
        // FIX (performance): as duas queries são independentes entre si,
        // rodavam em série (await sequencial) sem necessidade — agora em paralelo.
        const [
          { data: planosData, error: errPlanos },
          { data: modData, error: errMod },
        ] = await Promise.all([
          supabase.from('planos').select('*').eq('estudio_id', idEfetivo).order('nome'),
          supabase.from('modalidades').select('id, nome, area').eq('estudio_id', idEfetivo)
            .order('area').order('nome'),
        ]);
        if (errPlanos) throw errPlanos;
        if (errMod) throw errMod;
        if (!cancelled) {
          setPlanos(planosData || []);
          setModalidades(modData || []);
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Erro ao carregar planos/modalidades:', error);
          showToast.error('Erro ao carregar planos e modalidades.');
        }
      }
    }
    carregarDados();

    async function carregarFichaCompleta() {
      // FIX: sem essa guarda, a busca disparava com estudio_id vazio antes do
      // useAuth/impersonation resolverem, gerando um toast de erro falso-positivo.
      if (!idEfetivo) return;

      if (alunoParaEditar?.id) {
        const { data: aluno, error } = await supabase
          .from('alunos').select('*').eq('id', alunoParaEditar.id).eq('estudio_id', idEfetivo).single();
        if (error) {
          if (!cancelled) {
            console.error('Erro ao carregar ficha do aluno:', error);
            showToast.error('Não foi possível carregar os dados deste aluno.');
          }
          return;
        }
        if (aluno && !cancelled) {
          reset({
            nome_completo:    aluno.nome_completo    || '',
            email:            aluno.email            || '',
            role:             aluno.role             || 'aluno',
            plano_id:         aluno.plano_id         || '',
            cpf:              aluno.cpf              || '',
            data_nascimento:  aluno.data_nascimento  || '',
            telefone:         aluno.telefone         || '',
            data_inicio_plano:aluno.data_inicio_plano|| '',
            data_fim_plano:   aluno.data_fim_plano   || '',
            cep:              aluno.cep              || '',
            rua:              aluno.rua              || '',
            numero:           aluno.numero           || '',
            complemento:      aluno.complemento      || '',
            bairro:           aluno.bairro           || '',
            cidade:           aluno.cidade           || '',
            contato_emergencia: aluno.contato_emergencia || '',
          });
          if (aluno.cpf) setCpfDisplay(formatarCPF(aluno.cpf));
          setModalidadesSelecionadas(aluno.modalidades_selecionadas || []);
          setMetadataForm(aluno.metadata || {});

          // PED-170: se já existe consentimento do responsável legal registrado,
          // pré-marca o checkbox e preenche os dados dele — sem isso, reabrir
          // o cadastro de um menor já consentido bloquearia o salvamento de
          // qualquer outro campo até "re-consentir" de novo.
          if (ehMenorDeIdade(aluno.data_nascimento)) {
            const consentimento = await alunosService.buscarConsentimentoResponsavel(
              alunoParaEditar.id, idEfetivo
            );
            if (!cancelled) {
              setConsentimentoResponsavel(consentimento);
              if (consentimento) {
                setValue('responsavel_legal_nome',       consentimento.nome_responsavel);
                setValue('responsavel_legal_cpf',        consentimento.cpf_responsavel || '');
                setValue('responsavel_legal_parentesco', consentimento.parentesco);
                setValue('consentimento_responsavel',    true);
              }
            }
          }
        }
      } else if (leadParaConversao && !cancelled) {
        reset({
          nome_completo: leadParaConversao.nome_visitante     || '',
          telefone:      leadParaConversao.telefone_visitante || '',
          role:          'aluno',
        });
      }
    }
    carregarFichaCompleta();

    return () => { cancelled = true; };
  }, [alunoParaEditar, reset, idEfetivo, leadParaConversao]);

  useEffect(() => {
    if (abaAtiva === 'agenda' && alunoParaEditar) carregarAgendaFixa();
  }, [abaAtiva, alunoParaEditar]);

  // agenda fixa
  async function carregarAgendaFixa() {
    setLoadingAgenda(true);
    try {
      const { data: aulas, error: errAulas } = await supabase
        .from('agenda').select('*, modalidades(id, nome)')
        .eq('estudio_id', idEfetivo).eq('eh_recorrente', true);
      if (errAulas) throw errAulas;

      const diasOrdem = {
        'Domingo': 0, 'Segunda-feira': 1, 'Terça-feira': 2,
        'Quarta-feira': 3, 'Quinta-feira': 4, 'Sexta-feira': 5, 'Sábado': 6,
      };
      setAulasGrade(
        (aulas || []).sort((a, b) => {
          if (diasOrdem[a.dia_semana] !== diasOrdem[b.dia_semana])
            return diasOrdem[a.dia_semana] - diasOrdem[b.dia_semana];
          return a.horario.localeCompare(b.horario);
        })
      );

      // FIX: filtro de estudio_id adicionado por defesa em profundidade,
      // consistente com o padrão já usado no INSERT/DELETE desta mesma tabela
      // logo abaixo (executarMatricula/executarRemocao).
      const { data: matriculas, error: errMat } = await supabase
        .from('agenda_fixa').select('aula_id')
        .eq('aluno_id', alunoParaEditar.id).eq('estudio_id', idEfetivo);
      if (errMat) throw errMat;
      setMatriculasAluno(matriculas?.map(m => m.aula_id) || []);
    } catch (error) {
      console.error('Erro ao carregar grade fixa:', error);
      showToast.error('Erro ao carregar grade fixa.');
    } finally {
      setLoadingAgenda(false);
    }
  }

  // ─────────────────────────────────────────────────────────
  const handleCpfChange = (e) => {
    const formatted = formatarCPF(e.target.value);
    setCpfDisplay(formatted);
    const nums = formatted.replace(/\D/g, '');
    setValue('cpf', nums);                          // store clean digits
    if (nums.length === 11) {
      setCpfErro(validarCPF(formatted) ? '' : 'CPF inválido. Verifique os dígitos.');
    } else {
      setCpfErro('');
    }
  };

  // ─────────────────────────────────────────────────────────
  // Fix #2 – per-step validation before advancing
  // ─────────────────────────────────────────────────────────
  const camposStep1Menor = [
    'responsavel_legal_nome', 'responsavel_legal_cpf', 'responsavel_legal_parentesco', 'consentimento_responsavel',
  ];
  const camposPorStep = {
    1: ['nome_completo', ...(menorDeIdade ? camposStep1Menor : [])],
    2: ['email'], 3: [], 4: [],
  };

  const avancarStep = async () => {
    if (stepAtual === 1 && cpfErro) return;         // block on invalid CPF
    const campos = camposPorStep[stepAtual] || [];
    const valido = campos.length === 0 || await trigger(campos);
    if (valido) setStepAtual(s => Math.min(s + 1, 4));
  };

  // Memoizado: precisa ter referência estável para poder ser usado como
  // dependência dos efeitos de auto-seleção/slots abaixo, sem causar loop.
  const modalidadesAgrupadas = useMemo(() => modalidades.reduce((acc, mod) => {
    const area = mod.area || 'Outros';
    if (!acc[area]) acc[area] = [];
    acc[area].push(mod);
    return acc;
  }, {}), [modalidades]);

  const countUsoModNaGrade = (modId) =>
    matriculasAluno.filter(aulaId =>
      aulasGrade.find(a => a.id === aulaId)?.modalidades?.id === modId
    ).length;

  // ── Melhoria de fluxo: modalidades por área ────────────────
  // Áreas com 1 única modalidade (ex: Funcional) não exigem escolha manual
  // — o sistema já sabe qual é a modalidade, então preenche sozinho.
  const modalidadesAuto = useMemo(() => {
    const ids = [];
    regrasPlano.forEach(regra => {
      const modsArea = modalidadesAgrupadas[regra.modalidade] || [];
      if (modsArea.length === 1) {
        const alvo = regra.limite === 999 ? 1 : regra.limite;
        for (let i = 0; i < alvo; i++) ids.push(modsArea[0].id);
      }
    });
    return ids;
  }, [regrasPlano, modalidadesAgrupadas]);

  // Áreas com múltiplas modalidades e limite finito (ex: Dança 2x/semana,
  // podendo ser 2 estilos diferentes) usam "slots" nomeados — 1 dropdown
  // por vaga semanal, em vez de uma lista solta de estilos com contador.
  const [slotsPorArea, setSlotsPorArea] = useState({}); // { areaNome: (modId|null)[] }

  useEffect(() => {
    setSlotsPorArea(prev => {
      const novo = {};
      regrasPlano.forEach(regra => {
        const modsArea = modalidadesAgrupadas[regra.modalidade] || [];
        if (modsArea.length > 1 && regra.limite !== 999) {
          if (prev[regra.modalidade]) {
            // Já inicializado — só redimensiona se o limite do plano mudou.
            const atual = prev[regra.modalidade];
            novo[regra.modalidade] = Array.from({ length: regra.limite }, (_, i) => atual[i] ?? null);
          } else {
            // Primeira vez que essa área aparece: tenta hidratar a partir de
            // modalidadesSelecionadas (caso de edição de aluno já existente).
            const idsDaArea = modalidadesSelecionadas.filter(id =>
              modsArea.some(m => m.id === id)
            );
            novo[regra.modalidade] = Array.from({ length: regra.limite }, (_, i) => idsDaArea[i] ?? null);
          }
        }
      });
      return novo;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regrasPlano, modalidadesAgrupadas]);

  const atualizarSlot = (areaNome, index, modId) => {
    setSlotsPorArea(prev => {
      const atual = [...(prev[areaNome] || [])];
      atual[index] = modId || null;
      return { ...prev, [areaNome]: atual };
    });
  };

  // Áreas cobertas por auto-seleção ou por slots nomeados não devem também
  // aparecer na lista "livre" (addModalidade/removeModalidade) — essa lista
  // livre fica reservada só para áreas Ilimitadas com múltiplos estilos.
  const areasComSlotOuAuto = useMemo(() => new Set(
    regrasPlano
      .filter(r => {
        const mods = modalidadesAgrupadas[r.modalidade] || [];
        return mods.length === 1 || (mods.length > 1 && r.limite !== 999);
      })
      .map(r => r.modalidade)
  ), [regrasPlano, modalidadesAgrupadas]);

  // Fonte única de verdade para gravação e para os contadores de uso —
  // combina: auto-selecionadas + slots nomeados + seleção livre (áreas ilimitadas).
  const modalidadesFinais = useMemo(() => {
    const slots  = Object.values(slotsPorArea).flat().filter(Boolean);
    const livres = modalidadesSelecionadas.filter(id => {
      const area = modalidades.find(m => m.id === id)?.area;
      return area && !areasComSlotOuAuto.has(area);
    });
    return [...modalidadesAuto, ...slots, ...livres];
  }, [modalidadesAuto, slotsPorArea, modalidadesSelecionadas, areasComSlotOuAuto, modalidades]);

  // ── modalidades helpers (unchanged) ───────────────────────
  const getCountModEspecifca = (modId) =>
    modalidadesFinais.filter(id => id === modId).length;
  const getUsoPorArea = (areaNome) =>
    modalidadesFinais.filter(id =>
      modalidades.find(m => m.id === id)?.area === areaNome
    ).length;
  const getRegraDaArea    = (areaNome) => regrasPlano.find(r => r.modalidade === areaNome);
  const podeAdicionarMod  = (modArea) => {
    const regra = getRegraDaArea(modArea);
    if (!regra) return false;
    if (regra.limite === 999) return true;
    return getUsoPorArea(modArea) < regra.limite;
  };
  const addModalidade    = (modId) => setModalidadesSelecionadas([...modalidadesSelecionadas, modId]);
  const removeModalidade = (modId) => {
    const index = modalidadesSelecionadas.lastIndexOf(modId);
    if (index > -1) {
      const nova = [...modalidadesSelecionadas];
      nova.splice(index, 1);
      setModalidadesSelecionadas(nova);
    }
  };

  async function executarMatricula(aula) {
    try {
      // FIX: estudio_id incluído por defesa em profundidade — agora que
      // carregarAgendaFixa só traz aulas do tenant certo, aula.id já vem
      // seguro, mas gravar o estudio_id aqui também evita que uma futura
      // regressão volte a permitir matrícula cruzada de tenant.
      const { error } = await supabase.from('agenda_fixa')
        .insert({ aluno_id: alunoParaEditar.id, aula_id: aula.id, estudio_id: idEfetivo });
      if (error) throw error;
      showToast.success('Aluno matriculado na turma!');
      carregarAgendaFixa();
    } catch (error) {
      console.error('Erro ao matricular na turma:', error);
      showToast.error('Erro ao matricular na turma.');
    }
  }

  async function executarRemocao(aula) {
    try {
      const { error } = await supabase.from('agenda_fixa')
        .delete().match({ aluno_id: alunoParaEditar.id, aula_id: aula.id, estudio_id: idEfetivo });
      if (error) throw error;
      showToast.success('Aluno removido da turma.');
      carregarAgendaFixa();
    } catch (error) {
      console.error('Erro ao remover da turma:', error);
      showToast.error('Erro ao remover da turma.');
    }
  }

  function toggleMatriculaFixa(aula) {
    const isMatriculado = matriculasAluno.includes(aula.id);
    if (!isMatriculado) {
      const limiteSelecionado = getCountModEspecifca(aula.modalidades?.id);
      const usado             = countUsoModNaGrade(aula.modalidades?.id);
      if (usado >= limiteSelecionado) {
        setConfirmModal({
          mensagem: `ATENÇÃO: Apenas ${limiteSelecionado}x de "${aula.modalidades?.nome}" definido no perfil.\n\nDeseja abrir uma exceção e matricular na ${usado + 1}ª turma?`,
          onConfirmar: () => executarMatricula(aula),
        });
        return;
      }
      executarMatricula(aula);
    } else {
      setConfirmModal({
        mensagem: `Deseja remover o aluno da turma de ${aula.dia_semana} às ${aula.horario}?`,
        onConfirmar: () => executarRemocao(aula),
      });
    }
  }

  const calcularDataFim = (dataVencimentoStr, mesesAdicionais) => {
    if (!dataVencimentoStr || !mesesAdicionais) return '';
    // FIX: antes somava "meses * 30 dias" fixos, divergindo do cálculo usado
    // no preview (useEffect acima, que usa setMonth com meses de calendário
    // reais). Em meses != 30 dias (fevereiro, 31 dias) a data salva podia
    // ficar diferente da que era exibida ao usuário no formulário.
    const d = new Date(dataVencimentoStr + 'T12:00:00');
    d.setMonth(d.getMonth() + Number(mesesAdicionais));
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };

  // ─────────────────────────────────────────────────────────
  // Fix #4 – Phase 1: save aluno WITHOUT creating auth.
  //          Auth creation is a separate, explicit action.
  // ─────────────────────────────────────────────────────────
  async function onSubmit(data) {
    try {
      // Fase 7: valida metadata (campos dinâmicos) antes de prosseguir.
      // Fica fora do yupResolver porque metadataForm não é um campo
      // registrado no react-hook-form (ver comentário na declaração do
      // state acima). Path de erro sai como field_name puro aqui —
      // CamposDinamicosGrid espera o mapa nesse formato (não
      // 'metadata.<field_name>'), então usamos err.path direto.
      const schemaMetadata = construirSchemaMetadata(camposDinamicos);
      try {
        await schemaMetadata.validate(metadataForm, { abortEarly: false });
        setErrosMetadata({});
      } catch (errValidacao) {
        const erros = {};
        (errValidacao.inner ?? []).forEach((e) => {
          if (e.path && !erros[e.path]) erros[e.path] = e.message;
        });
        setErrosMetadata(erros);
        showToast.error('Confira os campos adicionais destacados antes de continuar.');
        setStepAtual(1); // campos dinâmicos são renderizados no step 1
        return;
      }

      // SEC-01 — nunca aceitar role do formulário; fixar sempre como 'aluno'.
      // Promoção a admin deve ocorrer via console Supabase ou Edge Function dedicada.
      const roleSanitizado = 'aluno';
      const planoFinal = (roleSanitizado === 'aluno' && data.plano_id) ? data.plano_id : null;
      let planoInfos = null;

      const payloadBase = {
        plano_id:                  planoFinal,
        modalidades_selecionadas:  roleSanitizado === 'aluno' ? modalidadesFinais : [],
        data_inicio_plano:         data.data_inicio_plano || null,
        data_fim_plano:            data.data_fim_plano    || null,
        cpf:                       data.cpf               || null,
        data_nascimento:           data.data_nascimento   || null,
        telefone:                  data.telefone          || null,
        cep:                       data.cep               || null,
        rua:                       data.rua               || null,
        numero:                    data.numero            || null,
        complemento:               data.complemento       || null,
        bairro:                    data.bairro            || null,
        cidade:                    data.cidade            || null,
        contato_emergencia:        data.contato_emergencia|| null,
        metadata:                  metadataForm,
      };

      if (planoFinal) {
        planoInfos = planos.find(p => String(p.id) === String(planoFinal));
        if (planoInfos) {
          payloadBase.data_inicio_plano = new Date().toISOString().split('T')[0];
          payloadBase.data_fim_plano    = calcularDataFim(dataVencimento, planoInfos.duracao_meses || 1);
        }
      }

      // PED-170: registra o consentimento do responsável legal (linha nova,
      // append-only, em consentimentos_responsavel_legal) quando o aluno é
      // menor e ainda não havia um consentimento gravado para ele. Não
      // bloqueia o fluxo em caso de falha — o cadastro/atualização em si já
      // foi persistido; um erro aqui só avisa o operador pra tentar de novo
      // pela aba Saúde/Anamnese, sem perder o cadastro que acabou de salvar.
      const registrarConsentimentoSeNecessario = async (alunoId) => {
        if (!menorDeIdade || !data.consentimento_responsavel || consentimentoResponsavel) return;
        try {
          await alunosService.registrarConsentimentoResponsavel(alunoId, idEfetivo, {
            nome:       data.responsavel_legal_nome?.trim(),
            cpf:        data.responsavel_legal_cpf || null,
            parentesco: data.responsavel_legal_parentesco,
          });
        } catch (errConsentimento) {
          console.error('Erro ao registrar consentimento do responsável legal:', errConsentimento);
          Sentry.captureException(errConsentimento, { tags: { fluxo: 'consentimento_responsavel_legal' } });
          showToast.error(
            'Cadastro salvo, mas houve um erro ao registrar o consentimento do responsável legal. Tente novamente na aba Saúde/Anamnese.'
          );
        }
      };

      // EDIT MODE – unchanged behaviour
      if (alunoParaEditar) {
        await alunosService.atualizar(alunoParaEditar.id, {
          ...payloadBase, nome_completo: data.nome_completo,
        }, idEfetivo);
        await registrarConsentimentoSeNecessario(alunoParaEditar.id);
        showToast.success('Cadastro atualizado com sucesso!');
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: alunosKeys.listaTodas(idEfetivo) }),
          queryClient.invalidateQueries({ queryKey: alunosKeys.perfil(alunoParaEditar.id, idEfetivo) }),
        ]);
        navigate('/alunos');
        return;
      }

      // CREATE MODE
      // FIX: busca de professor por e-mail agora é escopada ao estúdio atual.
      // Sem o filtro de estudio_id, um professor de OUTRO estúdio com o mesmo
      // e-mail seria encontrado e o novo aluno herdaria o auth_id dele — dando
      // a esse professor de outro tenant acesso como aluno neste estúdio.
      const { data: profExistente } = await supabase
        .from('professores').select('auth_id').eq('email', data.email.trim())
        .eq('estudio_id', idEfetivo).maybeSingle();

      let novoAlunoId = null;

      if (profExistente) {
        // Existing professor → link immediately (no new auth needed)
        // FIX: usa alunosService.criar (allowlist de campos + estudio_id
        // automático) em vez de insert cru; o único campo extra necessário
        // aqui é auth_id, que não faz parte da allowlist e por isso é
        // adicionado depois via update escopado por tenant.
        const alunoInserido = await alunosService.criar(
          { ...payloadBase, nome_completo: data.nome_completo, email: data.email.trim() },
          idEfetivo
        );
        const { error: errVinculo } = await supabase
          .from('alunos').update({ auth_id: profExistente.auth_id })
          .eq('id', alunoInserido.id).eq('estudio_id', idEfetivo);
        if (errVinculo) throw new Error('Erro ao criar vínculo de aluno.');
        novoAlunoId = alunoInserido.id;
        showToast.success('Perfil vinculado ao professor com sucesso!');
      } else {
        // New student – persist the record WITHOUT auth (auth_id intentionally null).
        // The admin will create the app login in Phase 2 below.
        // FIX: estudio_id agora é sempre gravado, via alunosService.criar.
        const alunoInserido = await alunosService.criar(
          { ...payloadBase, nome_completo: data.nome_completo, email: data.email.trim() },
          idEfetivo
        );
        novoAlunoId = alunoInserido.id;
      }

      await registrarConsentimentoSeNecessario(novoAlunoId);

      // Financial records
      // FIX: os dois INSERTs manuais (historico_planos + mensalidades) foram
      // substituídos pela RPC atômica já existente em alunosService.matricular
      // (matricular_aluno). Antes, se um dos dois inserts falhasse, o outro
      // já tinha sido persistido e o erro era só logado — aluno ficava criado
      // com estado financeiro inconsistente e sem aviso ao operador. Agora,
      // ou os dois registros são gravados juntos, ou a transação inteira
      // faz rollback e o erro é reportado explicitamente.
      if (novoAlunoId && planoFinal) {
        try {
          await alunosService.matricular(
            novoAlunoId,
            planoFinal,
            { dataVencimento, modalidades: modalidadesFinais },
            idEfetivo
          );
        } catch (errMatricula) {
          console.error('Erro ao matricular no plano:', errMatricula);
          // PED-149: fluxo crítico (matrícula) tratado por catch — sem
          // isso, essa falha nunca chegava ao Sentry (só o toast pro
          // operador, que já criou o aluno mas não sabe da causa raiz).
          Sentry.captureException(errMatricula, { tags: { fluxo: 'matricular_aluno' } });
          showToast.error(
            'Aluno criado, mas houve um erro ao gerar o plano/mensalidade. Verifique manualmente.'
          );
        }
      }

      // Lead conversion
      // FIX: sem .eq('estudio_id', idEfetivo) qualquer id de "presenca" informado
      // via location.state poderia ser atualizado, mesmo de outro tenant (IDOR).
      // O erro também deixa de ser ignorado silenciosamente.
       if (leadParaConversao?.id) {
        const payload = { status_conversao: 'convertido' };
        if (novoAlunoId) payload.aluno_id = novoAlunoId;
        const { error: errConversao } = await supabase
          .from('presencas').update(payload)
          .eq('id', leadParaConversao.id).eq('estudio_id', idEfetivo);
        if (errConversao) console.error('Erro ao converter lead:', errConversao);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: alunosKeys.listaTodas(idEfetivo) }),
        queryClient.invalidateQueries({ queryKey: alunosKeys.professores() }),
        queryClient.invalidateQueries({ queryKey: alunosKeys.presencas() }),
      ]);

       if (profExistente) {
        navigate('/alunos');
      } else {
        setAlunoSalvoId(novoAlunoId);
        setAlunoSalvoEmail(data.email.trim());
        setAlunoSalvoNome(data.nome_completo);
        setCadastroSalvo(true);
      }
    } catch (error) {
      showToast.error(error.message || 'Erro ao processar a solicitação.');
    }
  }

   async function criarAcesso() {
    setCriandoAcesso(true);
    setErroAcesso('');
    try {
      const { data: funcData, error: funcError } = await supabase.functions.invoke(
        'criar-acesso-aluno',
        {
          body: {
            aluno_id: alunoSalvoId,
            email: alunoSalvoEmail,
            nome: alunoSalvoNome,
            estudio_id: idEfetivo,
          },
        }
      );
      if (funcError) throw new Error('Falha na comunicação com o servidor seguro.');
      if (funcData?.error) throw new Error(
        funcData.error === 'User already registered'
          ? 'Este e-mail já possui um acesso.'
          : funcData.error
      );
     // O vínculo alunos.auth_id + estudio_membros já é feito dentro da Edge
     // Function, com o filtro de estudio_id correto — não precisa (e não
     // deve) ser repetido aqui direto no client, sem esse isolamento.

      setAcessoCriado(true);
      setDadosCriados({ nome: alunoSalvoNome, email: alunoSalvoEmail });
      setModalOpen(true);
    } catch (err) {
      setErroAcesso(err.message || 'Falha ao criar acesso. Tente novamente.');
    } finally {
      setCriandoAcesso(false);
    }
  }

  const copiarInstrucoes = () => {
    const texto =
      `Olá ${dadosCriados.nome}!\nSeu cadastro no ${nomeEstudio} foi criado.\n\n` +
      `Acesse: ${window.location.origin}\nLogin: ${dadosCriados.email}\n` +
      `Um e-mail de acesso foi enviado para ${dadosCriados.email}.\nO professor deve clicar no link para definir sua senha.`;
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
    showToast.success('Instruções copiadas!');
  };

  const modalidadesUnicasIDs   = [...new Set(modalidadesFinais)];
  const listaModalidadesAgenda = modalidadesUnicasIDs
    .map(id => modalidades.find(m => m.id === id)).filter(Boolean);

  // Shared sub-renderers
  function PlanoSlots() {
    return (
      <>
        {planoSelecionado && (
          <div className="md:col-span-2 bg-info-soft p-4 rounded-xl border border-info/20">
            <label className="block text-sm font-bold text-info mb-2">
              Data do 1º Pagamento
            </label>
            <input
              type="date"
              value={dataVencimento}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => setDataVencimento(e.target.value)}
              className="w-full bg-card border-none rounded-xl px-4 py-3 font-bold text-foreground
                focus:ring-2 focus:ring-info/20 outline-none"
            />
            <p className="text-[11px] text-info mt-2 font-medium">
              O plano terá validade contando a partir desta data de pagamento.
            </p>
          </div>
        )}

        {planoSelecionado && roleAtual === 'aluno' && (
          <>
            <div className="relative animate-in fade-in">
              <label className="text-[10px] font-black text-muted-foreground uppercase absolute -top-2
                left-4 bg-card px-1">
                Início do Contrato
              </label>
              <input
                {...register('data_inicio_plano')}
                type="date"
                className="w-full px-4 py-4 bg-muted rounded-2xl outline-none font-bold text-muted-foreground"
              />
            </div>
            <div className="relative animate-in fade-in">
              <label className="text-[10px] font-black text-primary uppercase absolute -top-2
                left-4 bg-card px-1 flex items-center gap-1">
                Fim (Calculado) <RefreshCw size={10} />
              </label>
              <input
                {...register('data_fim_plano')}
                type="date"
                className="w-full px-4 py-4 bg-primary/soft rounded-2xl outline-none font-bold text-primary"
              />
            </div>

            {/* Slot selection */}
            <div className="md:col-span-2 mt-4 animate-in slide-in-from-top-4">
              <div className="bg-info-soft border border-info/20 p-6 rounded-3xl mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <Info className="text-info" size={20} />
                  <h4 className="font-black text-info text-lg">
                    Regras do Plano: {planoSelecionadoObj?.nome}
                  </h4>
                </div>
                {regrasPlano.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {regrasPlano.map((r, i) => {
                      const usoAtual   = getUsoPorArea(r.modalidade);
                      const limiteText = r.limite === 999 ? 'Ilimitado' : `${r.limite}x`;
                      const isFull     = r.limite !== 999 && usoAtual >= r.limite;
                      return (
                        <span key={i} className={`border px-4 py-2 rounded-xl font-bold text-sm
                          transition-colors
                          ${isFull
                            ? 'bg-info text-info-foreground border-info'
                            : 'bg-card text-info border-info/30'}`}>
                          {limiteText} na Área: {r.modalidade}
                          {isFull && <Check size={14} className="inline ml-1" />}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-info font-medium">
                    Este plano não possui regras cadastradas. O aluno não poderá agendar aulas.
                  </p>
                )}
              </div>

              <div className="space-y-6">
                {Object.entries(modalidadesAgrupadas).map(([areaNome, modsArea]) => {
                  const regra           = getRegraDaArea(areaNome);
                  const isAreaBloqueada = !regra;
                  const unicaModalidade = modsArea.length === 1;
                  const limiteFinito    = !isAreaBloqueada && regra.limite !== 999;

                  return (
                    <div key={areaNome} className={`p-5 rounded-3xl border-2
                      ${isAreaBloqueada
                        ? 'bg-muted border-dashed border-border opacity-60'
                        : 'bg-card border-border'}`}>
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="font-black text-foreground uppercase tracking-widest text-xs
                          flex items-center gap-2">
                          Área: {areaNome}
                          {isAreaBloqueada && <Lock size={14} className="text-muted-foreground" />}
                        </h4>
                        {!isAreaBloqueada && regra.limite !== 999 && !unicaModalidade && (
                          <span className="text-xs font-bold text-info bg-info-soft px-2 py-1 rounded-md">
                            Usado: {getUsoPorArea(areaNome)} / {regra.limite}
                          </span>
                        )}
                      </div>

                      {/* CASO 1: área com uma única modalidade — nada a escolher,
                          o sistema já inclui automaticamente (ver modalidadesAuto). */}
                      {!isAreaBloqueada && unicaModalidade && (
                        <div className="flex items-center justify-between p-3 rounded-xl
                          bg-success-soft border border-success/20">
                          <span className="text-sm font-bold text-success">
                            {modsArea[0].nome}
                          </span>
                          <span className="text-xs font-bold text-success bg-card
                            px-3 py-1 rounded-lg flex items-center gap-1">
                            <Check size={12} /> Incluído automaticamente
                          </span>
                        </div>
                      )}

                      {/* CASO 2: múltiplas modalidades + limite finito (ex: Dança 2x/semana)
                          — 1 dropdown nomeado por vaga semanal, sem contadores soltos. */}
                      {limiteFinito && !unicaModalidade && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {(slotsPorArea[areaNome] || []).map((valorSlot, index) => (
                            <div key={index} className="relative">
                              <label className="text-[10px] font-black text-muted-foreground
                                uppercase block mb-1 ml-1">
                                {index + 1}ª aula de {areaNome}
                              </label>
                              <select
                                value={valorSlot || ''}
                                onChange={e => atualizarSlot(areaNome, index, e.target.value)}
                                className="w-full px-4 py-3 bg-muted rounded-xl outline-none
                                  font-bold text-foreground cursor-pointer border border-transparent
                                  focus:border-primary"
                              >
                                <option value="">Selecionar estilo...</option>
                                {modsArea.map(mod => (
                                  <option key={mod.id} value={mod.id}>{mod.nome}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* CASO 3: múltiplas modalidades + ilimitado — mantém a lista livre
                          de +/-, já que não há um número fixo de vagas a distribuir. */}
                      {!isAreaBloqueada && regra.limite === 999 && !unicaModalidade && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {modsArea.map(mod => {
                            const count    = getCountModEspecifca(mod.id);
                            const isAtivo  = count > 0;
                            const allowAdd = podeAdicionarMod(areaNome);
                            return (
                              <div key={mod.id} className={`flex items-center justify-between p-3
                                rounded-xl transition-all
                                ${isAtivo ? 'bg-primary/10 border border-primary/20'
                                  :         'bg-muted border border-transparent'}`}>
                                <span className={`text-sm font-bold
                                  ${isAtivo ? 'text-primary' : 'text-muted-foreground'}`}>
                                  {mod.nome}
                                </span>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => removeModalidade(mod.id)}
                                    disabled={!isAtivo}
                                    className="w-7 h-7 flex flex-col items-center justify-center
                                      rounded-lg bg-card shadow-sm text-muted-foreground font-black
                                      hover:bg-destructive-soft hover:text-destructive
                                      disabled:opacity-30 disabled:shadow-none transition-colors"
                                  >
                                    -
                                  </button>
                                  <span className={`font-black w-4 text-center
                                    ${isAtivo ? 'text-primary' : 'text-muted-foreground'}`}>
                                    {count}x
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => addModalidade(mod.id)}
                                    disabled={!allowAdd}
                                    className={`w-7 h-7 flex flex-col items-center justify-center
                                      rounded-lg bg-card shadow-sm font-black transition-colors
                                      ${!allowAdd
                                        ? 'opacity-30 shadow-none text-muted-foreground cursor-not-allowed'
                                        : 'text-info hover:bg-info-soft hover:text-info'}`}
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  // Stepper step content
  function renderStep1() {
    return (
      <div className="space-y-4 animate-in fade-in">
        <h3 className="text-sm font-black text-muted-foreground uppercase tracking-widest mb-4
          flex items-center gap-2">
          <User size={16} /> Dados Pessoais
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative md:col-span-2">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
            <input
              {...register('nome_completo')}
              placeholder="Nome Completo *"
              className="w-full pl-12 pr-4 py-4 bg-muted rounded-2xl border border-transparent
                focus:border-primary outline-none font-medium text-foreground"
            />
            {errors.nome_completo && (
              <p className="text-xs text-destructive mt-1.5 ml-1 font-medium">
                {errors.nome_completo.message}
              </p>
            )}
          </div>
          <CpfField cpfDisplay={cpfDisplay} cpfErro={cpfErro} onChange={handleCpfChange} />
          <div className="relative">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
            <input
              {...register('data_nascimento')}
              type="date"
              className="w-full pl-12 pr-4 py-4 bg-muted rounded-2xl border border-transparent
                focus:border-primary outline-none font-medium text-muted-foreground"
            />
          </div>
        </div>

        {menorDeIdade && (
          <ResponsavelLegalFieldset
            register={register}
            errors={errors}
            jaConsentido={!!consentimentoResponsavel}
          />
        )}

        {camposDinamicos.length > 0 && (
          <div className="pt-2">
            <h3 className="text-sm font-black text-muted-foreground uppercase tracking-widest mb-4">
              Campos Adicionais
            </h3>
            <CamposDinamicosGrid
              campos={camposDinamicos}
              metadata={metadataForm}
              onChangeMetadata={setMetadataForm}
              erros={errosMetadata}
            />
          </div>
        )}
      </div>
    );
  }

  function renderStep2() {
    return (
      <div className="space-y-4 animate-in fade-in">
        <h3 className="text-sm font-black text-muted-foreground uppercase tracking-widest mb-4
          flex items-center gap-2">
          <Phone size={16} /> Contato
        </h3>
        <div className="grid grid-cols-1 gap-4">
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
            <input
              {...register('email')}
              type="email"
              placeholder="E-mail de acesso *"
              className="w-full pl-12 pr-4 py-4 bg-muted rounded-2xl border border-transparent
                focus:border-primary outline-none font-medium text-foreground"
            />
            {errors.email && (
              <p className="text-xs text-destructive mt-1.5 ml-1 font-medium">
                {errors.email.message}
              </p>
            )}
          </div>
          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
            <input
              {...register('telefone', { onChange: (e) => { e.target.value = formatarTelefone(e.target.value); } })}
              placeholder="Telefone / WhatsApp"
              className="w-full pl-12 pr-4 py-4 bg-muted rounded-2xl border border-transparent
                focus:border-primary outline-none font-medium text-foreground"
            />
          </div>
        </div>
      </div>
    );
  }

  function renderStep3() {
    return (
      <div className="space-y-4 animate-in fade-in">
        <h3 className="text-sm font-black text-muted-foreground uppercase tracking-widest mb-4
          flex items-center gap-2">
          <MapPin size={16} /> Endereço Residencial
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CepField register={register} buscandoCep={buscandoCep} cepErro={cepErro} onBlur={e => buscarCep(e.target.value)} />
          <div className="relative md:col-span-2">
            <Home className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
            <input
              {...register('rua')}
              placeholder="Rua / Logradouro"
              className="w-full pl-12 pr-4 py-4 bg-muted rounded-2xl border border-transparent
                focus:border-primary outline-none font-medium text-foreground"
            />
          </div>
          <div className="relative">
            <input
              id="input-numero"
              {...register('numero')}
              placeholder="Número"
              className="w-full px-4 py-4 bg-muted rounded-2xl border border-transparent
                focus:border-primary outline-none font-medium text-foreground"
            />
          </div>
          <div className="relative md:col-span-2">
            <input
              {...register('complemento')}
              placeholder="Complemento (Apto, Bloco...)"
              className="w-full px-4 py-4 bg-muted rounded-2xl border border-transparent
                focus:border-primary outline-none font-medium text-foreground"
            />
          </div>
          <div className="relative">
            <input
              {...register('bairro')}
              placeholder="Bairro"
              className="w-full px-4 py-4 bg-muted rounded-2xl border border-transparent
                focus:border-primary outline-none font-medium text-foreground"
            />
          </div>
          <div className="relative md:col-span-2">
            <input
              {...register('cidade')}
              placeholder="Cidade"
              className="w-full px-4 py-4 bg-muted rounded-2xl border border-transparent
                focus:border-primary outline-none font-medium text-foreground"
            />
          </div>
        </div>
        <div className="pt-2">
          <h3 className="text-sm font-black text-muted-foreground uppercase tracking-widest mb-4
            flex items-center gap-2">
            <Phone size={16} /> Contato de Emergência
          </h3>
          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
            <input
              {...register('contato_emergencia')}
              placeholder="Nome — (51) 9 0000-0000"
              className="w-full pl-12 pr-4 py-4 bg-muted rounded-2xl border border-transparent
                focus:border-primary outline-none font-medium text-foreground"
            />
          </div>
        </div>
      </div>
    );
  }

  function renderStep4() {
    return (
      <div className="space-y-4 animate-in fade-in">
        <h3 className="text-sm font-black text-muted-foreground uppercase tracking-widest mb-4
          flex items-center gap-2">
          <ShieldCheck size={16} /> Acesso e Plano
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
            <select
              {...register('role')}
              className="w-full pl-12 pr-4 py-4 bg-muted rounded-2xl outline-none font-bold
                text-muted-foreground appearance-none cursor-pointer"
            >
              <option value="aluno">Aluno</option>
            </select>
          </div>
          <div className="relative">
            <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
            <select
              {...register('plano_id')}
              disabled={roleAtual !== 'aluno'}
              className="w-full pl-12 pr-4 py-4 bg-muted rounded-2xl outline-none font-bold
                text-muted-foreground appearance-none cursor-pointer"
            >
              <option value="">Vincular Plano...</option>
              {planos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            {planos.length === 0 && (
              <p className="mt-1.5 ml-1 text-[11px] text-muted-foreground">
                Nenhum plano cadastrado ainda.{' '}
                <a href="/planos" target="_blank" rel="noreferrer" className="font-bold text-primary hover:underline">
                  Criar um plano →
                </a>
              </p>
            )}
          </div>
          {PlanoSlots()}
        </div>
      </div>
    );
  }

  function renderEditForm() {
    return (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8 animate-in fade-in">
        {/* Informações Pessoais */}
        <div className="space-y-4">
          <h3 className="text-sm font-black text-muted-foreground uppercase tracking-widest mb-4
            flex items-center gap-2">
            <User size={16} /> Informações Pessoais
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative md:col-span-2">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
              <input
                {...register('nome_completo')}
                placeholder="Nome Completo *"
                className="w-full pl-12 pr-4 py-4 bg-muted rounded-2xl border border-transparent
                  focus:border-primary outline-none font-medium text-foreground"
              />
            </div>
            <CpfField cpfDisplay={cpfDisplay} cpfErro={cpfErro} onChange={handleCpfChange} />
            <div className="relative">
              <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
              <input
                {...register('data_nascimento')}
                type="date"
                className="w-full pl-12 pr-4 py-4 bg-muted rounded-2xl border border-transparent
                  focus:border-primary outline-none font-medium text-muted-foreground"
              />
            </div>
            <div className="relative md:col-span-2">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
              <input
                {...register('telefone', { onChange: (e) => { e.target.value = formatarTelefone(e.target.value); } })}
                placeholder="Telefone / WhatsApp"
                className="w-full pl-12 pr-4 py-4 bg-muted rounded-2xl border border-transparent
                  focus:border-primary outline-none font-medium text-foreground"
              />
            </div>
          </div>

          {menorDeIdade && (
            <ResponsavelLegalFieldset
              register={register}
              errors={errors}
              jaConsentido={!!consentimentoResponsavel}
            />
          )}

          {camposDinamicos.length > 0 && (
            <div className="pt-2">
              <h4 className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-3">
                Campos Adicionais
              </h4>
              <CamposDinamicosGrid
                campos={camposDinamicos}
                metadata={metadataForm}
                onChangeMetadata={setMetadataForm}
                erros={errosMetadata}
              />
            </div>
          )}
        </div>

        {/* Endereço */}
        <div className="space-y-4 pt-4 border-t border-border">
          <h3 className="text-sm font-black text-muted-foreground uppercase tracking-widest mb-4
            flex items-center gap-2">
            <MapPin size={16} /> Endereço Residencial
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CepField register={register} buscandoCep={buscandoCep} cepErro={cepErro} onBlur={e => buscarCep(e.target.value)} />
            <div className="relative md:col-span-2">
              <Home className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
              <input
                {...register('rua')}
                placeholder="Rua / Logradouro"
                className="w-full pl-12 pr-4 py-4 bg-muted rounded-2xl border border-transparent
                  focus:border-primary outline-none font-medium text-foreground"
              />
            </div>
            <div className="relative">
              <input
                id="input-numero"
                {...register('numero')}
                placeholder="Número"
                className="w-full px-4 py-4 bg-muted rounded-2xl border border-transparent
                  focus:border-primary outline-none font-medium text-foreground"
              />
            </div>
            <div className="relative md:col-span-2">
              <input
                {...register('complemento')}
                placeholder="Complemento (Apto, Bloco...)"
                className="w-full px-4 py-4 bg-muted rounded-2xl border border-transparent
                  focus:border-primary outline-none font-medium text-foreground"
              />
            </div>
            <div className="relative">
              <input
                {...register('bairro')}
                placeholder="Bairro"
                className="w-full px-4 py-4 bg-muted rounded-2xl border border-transparent
                  focus:border-primary outline-none font-medium text-foreground"
              />
            </div>
            <div className="relative md:col-span-2">
              <input
                {...register('cidade')}
                placeholder="Cidade"
                className="w-full px-4 py-4 bg-muted rounded-2xl border border-transparent
                  focus:border-primary outline-none font-medium text-foreground"
              />
            </div>
          </div>
          <div className="relative mt-4">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
            <input
              {...register('contato_emergencia')}
              placeholder="Contato de Emergência — Nome (51) 9 0000-0000"
              className="w-full pl-12 pr-4 py-4 bg-muted rounded-2xl border border-transparent
                focus:border-primary outline-none font-medium text-foreground"
            />
          </div>
        </div>

        {/* Plano e Regras */}
        <div className="space-y-4 pt-4 border-t border-border">
          <h3 className="text-sm font-black text-muted-foreground uppercase tracking-widest mb-4
            flex items-center gap-2">
            <ShieldCheck size={16} /> Acesso e Plano
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative md:col-span-2">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
              <input
                {...register('email')}
                type="email"
                placeholder="E-mail de acesso *"
                disabled
                className="w-full pl-12 pr-4 py-4 bg-muted rounded-2xl border border-transparent
                  focus:border-primary outline-none font-medium text-foreground
                  disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div className="relative">
              <ShieldCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
              <select
                {...register('role')}
                className="w-full pl-12 pr-4 py-4 bg-muted rounded-2xl outline-none font-bold
                  text-muted-foreground appearance-none cursor-pointer"
              >
                <option value="aluno">Aluno</option>
              </select>
            </div>
            <div className="relative">
              <Package className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
              <select
                {...register('plano_id')}
                disabled={roleAtual !== 'aluno'}
                className="w-full pl-12 pr-4 py-4 bg-muted rounded-2xl outline-none font-bold
                  text-muted-foreground appearance-none cursor-pointer"
              >
                <option value="">Vincular Plano...</option>
                {planos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              {planos.length === 0 && (
                <p className="mt-1.5 ml-1 text-[11px] text-muted-foreground">
                  Nenhum plano cadastrado ainda.{' '}
                  <a href="/planos" target="_blank" rel="noreferrer" className="font-bold text-primary hover:underline">
                    Criar um plano →
                  </a>
                </p>
              )}
            </div>
            {PlanoSlots()}
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-primary text-primary-foreground py-5 rounded-[22px] font-black text-lg shadow-lg
            shadow-primary/20 hover:scale-[1.01] flex items-center justify-center gap-3 mt-8
            transition-all"
        >
          {isSubmitting
            ? <RefreshCw className="animate-spin" size={24} />
            : 'Salvar Alterações'}
        </button>
      </form>
    );
  }

  function renderAgenda() {
    return (
      <div className="space-y-6 animate-in fade-in">
        <div className="bg-primary/soft p-5 rounded-2xl border border-primary/20
          flex flex-col md:flex-row items-start gap-4">
          <AlertTriangle className="text-primary shrink-0 mt-1 hidden md:block" size={24} />
          <div>
            <h4 className="font-black text-primary">Gerenciamento de Turmas Regulares</h4>
            <p className="text-sm text-primary font-medium mt-1">
              Matricule o aluno nas turmas fixas que ele selecionou.
            </p>
          </div>
        </div>
        {loadingAgenda ? (
          <div className="flex justify-center p-12">
            <RefreshCw className="animate-spin text-muted-foreground" size={32} />
          </div>
        ) : (
          <div className="space-y-8">
            {listaModalidadesAgenda.length === 0 ? (
              <p className="text-muted-foreground text-center py-8 bg-muted rounded-2xl
                border border-dashed border-border">
                Nenhuma modalidade configurada no perfil deste aluno ainda.
              </p>
            ) : (
              listaModalidadesAgenda.map(modObj => {
                const limite = getCountModEspecifca(modObj.id);
                const usado  = countUsoModNaGrade(modObj.id);
                const isFull = usado >= limite;
                const turmas = aulasGrade.filter(a => a.modalidades?.id === modObj.id);
                if (turmas.length === 0) return null;
                return (
                  <div key={modObj.id}
                    className="bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
                    <div className="bg-muted border-b border-border p-4 flex flex-col
                      md:flex-row justify-between items-start md:items-center gap-2">
                      <h3 className="font-black text-foreground text-lg">{modObj.nome}</h3>
                      <div className={`px-3 py-1 rounded-lg font-black text-xs uppercase
                        tracking-wider
                        ${isFull ? 'bg-primary/soft text-primary' : 'bg-success-soft text-success'}`}>
                        Vagas: {usado} de {limite}
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        {turmas.map(aula => {
                          const isMatriculado = matriculasAluno.includes(aula.id);
                          return (
                            <div key={aula.id} className={`p-4 rounded-2xl border-2 flex
                              justify-between items-center transition-all
                              ${isMatriculado
                                ? 'border-success/30 bg-success-soft'
                                : 'border-border bg-card hover:border-border'}`}>
                              <div>
                                <p className="font-black text-foreground">{aula.dia_semana}</p>
                                <p className="text-sm font-medium text-muted-foreground">
                                  {aula.horario.slice(0, 5)} - {aula.atividade}
                                </p>
                              </div>
                              <button
                                onClick={() => toggleMatriculaFixa(aula)}
                                className={`w-10 h-10 shrink-0 rounded-xl flex flex-col items-center
                                  justify-center transition-colors
                                  ${isMatriculado
                                    ? 'bg-destructive-soft text-destructive hover:bg-destructive-soft'
                                    : 'bg-muted text-muted-foreground hover:bg-success hover:text-success-foreground'}`}
                              >
                                {isMatriculado ? <Trash2 size={18} /> : <Plus size={18} />}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button
        onClick={() => navigate('/alunos')}
        className="flex items-center gap-2 text-muted-foreground hover:text-primary font-bold mb-6
          transition-colors"
      >
        <ArrowLeft size={20} /> Voltar para lista
      </button>

      <div className="bg-card rounded-[24px] md:rounded-[40px] shadow-sm border border-border
        p-6 md:p-10 w-full">
        <h1 className="text-2xl md:text-3xl font-black text-foreground mb-6">
          {alunoParaEditar ? 'Perfil do Membro' : 'Novo Cadastro'}
        </h1>

        {/* EDIT MODE */}
        {alunoParaEditar && (
          <>
            <div className="flex gap-6 border-b border-border mb-8 overflow-x-auto
              custom-scrollbar">
              <button
                onClick={() => setAbaAtiva('dados')}
                className={`pb-4 font-black uppercase tracking-wider text-sm transition-all
                  border-b-2 whitespace-nowrap
                  ${abaAtiva === 'dados'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-muted-foreground'}`}
              >
                Dados Cadastrais
              </button>
              <button
                onClick={() => setAbaAtiva('agenda')}
                className={`pb-4 font-black uppercase tracking-wider text-sm transition-all
                  border-b-2 flex items-center gap-2 whitespace-nowrap
                  ${abaAtiva === 'agenda'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-muted-foreground'}`}
              >
                <CalendarDays size={18} /> Agenda Fixa (Turmas)
              </button>
            </div>
            {abaAtiva === 'dados'   && renderEditForm()}
            {abaAtiva === 'agenda' && renderAgenda()}
          </>
        )}

        {!alunoParaEditar && !cadastroSalvo && (
          <>
            <StepIndicator stepAtual={stepAtual} />
            <form onSubmit={handleSubmit(onSubmit)} className="animate-in fade-in">
              {stepAtual === 1 && renderStep1()}
              {stepAtual === 2 && renderStep2()}
              {stepAtual === 3 && renderStep3()}
              {stepAtual === 4 && renderStep4()}

              <div className="flex gap-4 mt-8">
                {stepAtual > 1 && (
                  <button
                    type="button"
                    onClick={() => setStepAtual(s => s - 1)}
                    className="flex-1 py-4 rounded-[22px] font-black text-muted-foreground bg-muted
                      hover:bg-muted flex items-center justify-center gap-2 transition-all"
                  >
                    <ArrowLeft size={20} /> Voltar
                  </button>
                )}
                {stepAtual < 4 && (
                  <button
                    type="button"
                    onClick={avancarStep}
                    className="flex-1 bg-primary text-primary-foreground py-4 rounded-[22px] font-black
                      flex items-center justify-center gap-2 hover:scale-[1.01] transition-all
                      shadow-lg shadow-primary/20"
                  >
                    Próximo <ArrowRight size={20} />
                  </button>
                )}
                {stepAtual === 4 && (
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 bg-primary text-primary-foreground py-5 rounded-[22px] font-black text-lg
                      shadow-lg shadow-primary/20 hover:scale-[1.01] flex items-center
                      justify-center gap-3 transition-all"
                  >
                    {isSubmitting
                      ? <RefreshCw className="animate-spin" size={24} />
                      : 'Salvar Cadastro'}
                  </button>
                )}
              </div>
            </form>
          </>
        )}

        {!alunoParaEditar && cadastroSalvo && (
          <div className="animate-in fade-in space-y-6">
            {/* Success banner */}
            <div className="bg-success-soft border border-success/30 rounded-3xl p-6
              flex items-start gap-4">
              <CheckCircle2 className="text-success shrink-0 mt-0.5" size={24} />
              <div>
                <h3 className="font-black text-success text-lg">
                  Cadastro salvo com sucesso!
                </h3>
                <p className="text-sm text-success mt-1">
                  Os dados de <strong>{alunoSalvoNome}</strong> foram salvos.
                  Agora você pode criar o acesso ao app, ou fazer isso depois.
                </p>
              </div>
            </div>

            {!acessoCriado ? (
              <div className="bg-card border-2 border-dashed border-border rounded-3xl
                p-8 space-y-4">
                <div className="flex items-center gap-3 mb-2">
                  <KeyRound className="text-muted-foreground" size={24} />
                  <h3 className="font-black text-foreground text-lg">Criar Acesso ao App</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Isso cria um login para <strong>{alunoSalvoEmail}</strong> com senha
                  provisória. O aluno será solicitado a trocar no primeiro acesso.
                </p>

                {erroAcesso && (
                  <div className="bg-destructive-soft border border-destructive/30 rounded-xl p-4
                    flex items-start gap-3">
                    <AlertCircle className="text-destructive shrink-0 mt-0.5" size={18} />
                    <div>
                      <p className="text-sm font-bold text-destructive">{erroAcesso}</p>
                      <p className="text-xs text-destructive mt-1">
                        Você pode tentar novamente ou pular e fazer isso depois.
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={criarAcesso}
                    disabled={criandoAcesso}
                    className="flex-1 bg-foreground text-background py-4 rounded-2xl font-black
                      flex items-center justify-center gap-2 hover:bg-foreground
                      transition-all disabled:opacity-60"
                  >
                    {criandoAcesso
                      ? <><RefreshCw className="animate-spin" size={20} /> Criando acesso...</>
                      : <><KeyRound size={20} /> {erroAcesso ? 'Tentar Novamente' : 'Criar Acesso'}</>}
                  </button>
                  <button
                    onClick={() => navigate('/alunos')}
                    className="flex-1 py-4 rounded-2xl font-black text-muted-foreground bg-muted
                      hover:bg-muted transition-all"
                  >
                    Fazer depois
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-info-soft border border-info/30 rounded-3xl p-6 text-center">
                <CheckCircle2 className="text-info mx-auto mb-3" size={32} />
                <h3 className="font-black text-info">Acesso criado!</h3>
                <p className="text-sm text-info mt-1">
                  As instruções de acesso foram geradas.
                </p>
                <button
                  onClick={() => navigate('/alunos')}
                  className="mt-4 bg-primary text-primary-foreground px-8 py-3 rounded-xl font-black
                    hover:scale-105 transition-all"
                >
                  Voltar para lista
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de confirmação */}
      <Modal
        isOpen={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        titulo="Confirmação"
      >
        <p className="text-foreground font-medium mb-6 whitespace-pre-line leading-relaxed">
          {confirmModal?.mensagem}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setConfirmModal(null)}
            className="flex-1 py-3 rounded-2xl font-black text-muted-foreground bg-muted hover:bg-muted transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              confirmModal?.onConfirmar();
              setConfirmModal(null);
            }}
            className="flex-1 py-3 rounded-2xl font-black text-primary-foreground bg-primary hover:opacity-90 transition-all shadow-lg shadow-primary/20"
          >
            Confirmar
          </button>
        </div>
      </Modal>

      <Modal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); navigate('/alunos'); }}
        titulo="Acesso Criado!"
      >
        <button
          onClick={copiarInstrucoes}
          className="w-full bg-foreground text-background py-4 rounded-2xl font-bold
            flex items-center justify-center gap-2 hover:bg-foreground"
        >
          {copiado ? <Check size={20} /> : <Copy size={20} />} Copiar Instruções
        </button>
      </Modal>
    </div>
  );
}