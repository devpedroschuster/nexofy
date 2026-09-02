import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Settings, Upload, Save, Globe, Phone, Instagram, MapPin, Mail, Palette, LayoutGrid } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useEstudio } from '../hooks/useEstudio';
import { useAuth } from '../hooks/useAuth';
import { useImpersonation } from '../context/ImpersonationContext';
import { atualizarEstudio, uploadLogo, uploadImagemCapa, salvarLandingTexto } from '../services/estudioService';
import { SEGMENTOS, CHAVES_TERMINOLOGIA, terminologiaPadraoDoSegmento } from '../lib/terminologia';
import { resolverLandingCopy } from '../lib/landingCopy';
import { showToast } from '../components/shared/Toast';
import Button from '../components/ui/Button';
import Input, { Label } from '../components/ui/Input';
import Surface from '../components/ui/Surface';
import { ModalConfirmacao } from '../components/ui/Modal';

// Timezones brasileiras + internacionais mais comuns
const TIMEZONES = [
  { value: 'America/Sao_Paulo',    label: 'Brasília (GMT-3)' },
  { value: 'America/Manaus',       label: 'Manaus (GMT-4)' },
  { value: 'America/Belem',        label: 'Belém (GMT-3)' },
  { value: 'America/Fortaleza',    label: 'Fortaleza (GMT-3)' },
  { value: 'America/Recife',       label: 'Recife (GMT-3)' },
  { value: 'America/Bahia',        label: 'Salvador (GMT-3)' },
  { value: 'America/Cuiaba',       label: 'Cuiabá (GMT-4)' },
  { value: 'America/Porto_Velho',  label: 'Porto Velho (GMT-4)' },
  { value: 'America/Boa_Vista',    label: 'Boa Vista (GMT-4)' },
  { value: 'America/Rio_Branco',   label: 'Rio Branco (GMT-5)' },
  { value: 'America/Noronha',      label: 'Fernando de Noronha (GMT-2)' },
  { value: 'America/New_York',     label: 'Nova York (GMT-5)' },
  { value: 'Europe/Lisbon',        label: 'Lisboa (GMT+0/+1)' },
  { value: 'UTC',                  label: 'UTC' },
];

// Rótulo de exibição de cada chave de terminologia — só pra montar o
// formulário; a lógica de fallback em si vive em lib/terminologia.js.
const LABELS_CHAVE_TERMINOLOGIA = {
  aluno: 'Aluno',
  professor: 'Professor',
  aula: 'Aula',
  turma: 'Turma',
  modalidade: 'Modalidade',
};

// Módulos do núcleo — sempre ativos, mostrados como informação (não como
// toggle real): não existe hoje nenhum módulo opcional implementado (ver
// seção 7.5 do PLANO - MULTI SEGMENTO.md — "desempenho do atleta" ainda
// não foi construído). Expor um toggle "funcional" para algo que não
// existe seria pior que não expor nada — o admin ligaria algo e nada
// mudaria na tela, gerando confusão. Quando o primeiro módulo opcional
// existir de verdade, ele entra nesta lista com toggle habilitado.
const MODULOS_NUCLEO = [
  { value: 'alunos', label: 'Alunos' },
  { value: 'agenda', label: 'Agenda' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'presenca', label: 'Presença' },
];

// Regras simples de validação client-side (defesa em profundidade;
// a validação "de verdade" continua sendo feita no backend/constraints).
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_WHATSAPP = /^\d{10,15}$/; // código do país + DDD + número, só dígitos
// 6 dígitos apenas — precisa bater com o check da migration
// (estudios_cor_primaria_check / estudios_cor_secundaria_check), que só
// aceita #RRGGBB. Um hex de 3 dígitos passaria aqui e estouraria um erro
// cru de constraint no Postgres na hora de salvar.
const REGEX_HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const PROTOCOLOS_URL_PERMITIDOS = ['http:', 'https:'];
const TAMANHO_MAX_LOGO_MB = 5;
const TIPOS_LOGO_PERMITIDOS = ['image/png', 'image/jpeg', 'image/webp'];
// PED-9: mesmo limite do bucket `landing-covers` (file_size_limit=5MB na
// migration) — validado no client primeiro pra dar erro amigável em vez
// de deixar o Storage rejeitar cru.
const TAMANHO_MAX_CAPA_MB = 5;
const TIPOS_CAPA_PERMITIDOS = ['image/png', 'image/jpeg', 'image/webp'];

function urlValidaOuVazia(valor) {
  if (!valor) return true; // campo opcional
  try {
    const url = new URL(valor);
    return PROTOCOLOS_URL_PERMITIDOS.includes(url.protocol);
  } catch {
    return false;
  }
}

function FieldGroup({ children, className = '' }) {
  return <div className={`space-y-1.5 ${className}`}>{children}</div>;
}

export default function ConfiguracoesEstudio() {
  const queryClient = useQueryClient();
  const { estudioId, perfil } = useAuth();
  const { estudioAtivo } = useImpersonation();
  const idEfetivo = estudioAtivo?.id ?? estudioId;

  const { data: estudio, isLoading, isError, error } = useEstudio(idEfetivo);

  const fileInputRef = useRef(null);
  const objectUrlRef = useRef(null);
  const fileInputCapaRef = useRef(null);
  const objectUrlCapaRef = useRef(null);
  const montadoRef = useRef(true);

useEffect(() => {
    montadoRef.current = true;
    return () => { montadoRef.current = false; };
  }, []);

  const [salvando, setSalvando] = useState(false);
  const [uploadandoLogo, setUploadandoLogo] = useState(false);
  const [previewLogo, setPreviewLogo] = useState(null);
  const [uploadandoCapa, setUploadandoCapa] = useState(false);
  const [previewCapa, setPreviewCapa] = useState(null);
  const [erros, setErros] = useState({});

  // PED-10: aba ativa desta página. Client-side apenas (sem mudança de
  // rota) — "Landing Page" agrupa capa (PED-9) + headline/subheadline/
  // sobre_texto (aqui), com salvamento próprio via landing_config,
  // separado do "Salvar Configurações" da aba Geral (atualizarEstudio).
  const [abaAtiva, setAbaAtiva] = useState('geral');
  const [landingForm, setLandingForm] = useState({ headline: '', subheadline: '', sobre_texto: '' });
  const [salvandoLanding, setSalvandoLanding] = useState(false);

  const [form, setForm] = useState({
    nome:           '',
    whatsapp:       '',
    instagram:      '',
    maps_url:       '',
    email_suporte:  '',
    cor_primaria:   '#7c3aed',
    cor_secundaria: '',
    timezone:       'America/Sao_Paulo',
  });

  // Item 2 do plano multi-segmento (seção 4 do PLANO_ITEM_2.md): estado
  // separado do `form` acima de propósito — segmento/terminologia têm
  // fluxo de salvamento e validação próprios (troca de segmento pede
  // confirmação explícita antes de reescrever a terminologia).
  const [segmento, setSegmento] = useState('danca_fitness');
  const [terminologia, setTerminologia] = useState({});

  // Confirmação de troca de segmento: nunca sobrescreve a terminologia
  // customizada silenciosamente (seção 3.1 do PLANO - MULTI SEGMENTO.md).
  // `pendente` guarda o novo segmento até o admin confirmar ou cancelar.
  const [trocaSegmentoPendente, setTrocaSegmentoPendente] = useState(null);

  // Somente admin do estúdio pode editar (defesa em profundidade além do RLS).
  const podeEditar = perfil === 'admin' || perfil === 'super_admin';

  // Preenche o form quando os dados do estúdio chegam
  useEffect(() => {
    if (!estudio) return;
    setForm({
      nome:          estudio.nome          ?? '',
      whatsapp:      estudio.whatsapp      ?? '',
      instagram:     estudio.instagram     ?? '',
      maps_url:      estudio.maps_url      ?? '',
      email_suporte: estudio.email_suporte ?? '',
      cor_primaria:  estudio.cor_primaria  ?? '',
      cor_secundaria: estudio.cor_secundaria ?? '',
      timezone:      estudio.timezone      ?? 'America/Sao_Paulo',
    });
    setPreviewLogo(estudio.logo_url ?? null);
    setPreviewCapa(estudio.landing_config?.imagem_capa_url ?? null);
    setLandingForm({
      headline:    estudio.landing_config?.headline    ?? '',
      subheadline: estudio.landing_config?.subheadline ?? '',
      sobre_texto: estudio.landing_config?.sobre_texto ?? '',
    });
    setSegmento(estudio.segmento ?? 'danca_fitness');
    setTerminologia(estudio.terminologia ?? {});
  }, [estudio]);

  // CR3 FIX: revoga a última blob URL criada ao desmontar o componente.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
      if (objectUrlCapaRef.current) {
        URL.revokeObjectURL(objectUrlCapaRef.current);
      }
    };
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
    if (erros[name]) setErros(prev => ({ ...prev, [name]: undefined }));
  }

  // Limpa as cores customizadas no form (fica em branco até o Salvar).
  // Ao salvar, string vazia vira NULL (ver handleSalvar), e a landing
  // volta a usar a paleta padrão do Nexofy — nada é persistido aqui
  // até o admin confirmar clicando em "Salvar Configurações".
  function handleRestaurarCores() {
    setForm(prev => ({ ...prev, cor_primaria: '', cor_secundaria: '' }));
    setErros(prev => ({ ...prev, cor_primaria: undefined, cor_secundaria: undefined }));
  }

  // Troca de segmento: não aplica na hora — abre confirmação. O <select>
  // fica "controlado" pelo `segmento` atual (não pelo valor escolhido),
  // então visualmente ele só muda depois que o admin confirma.
  function handleSegmentoChange(e) {
    const novoSegmento = e.target.value;
    if (novoSegmento === segmento) return;
    setTrocaSegmentoPendente(novoSegmento);
  }

  // Confirmado: aplica o segmento novo e PRÉ-PREENCHE a terminologia com
  // o padrão daquele segmento — mas só nos campos que o admin ainda não
  // customizou. Campo já customizado (ex.: trocou "Aluno" por "Membro")
  // não é sobrescrito só porque o segmento mudou; o objetivo da troca de
  // segmento é ajustar os PADRÕES, não apagar customização manual.
  function confirmarTrocaSegmento() {
    const novoSegmento = trocaSegmentoPendente;
    const padraoAntigo = terminologiaPadraoDoSegmento(segmento);
    const padraoNovo = terminologiaPadraoDoSegmento(novoSegmento);

    setTerminologia((prev) => {
      const proximo = { ...prev };
      for (const chave of CHAVES_TERMINOLOGIA) {
        const eraPadraoAntigo = !prev[chave] || prev[chave] === padraoAntigo[chave];
        if (eraPadraoAntigo) {
          proximo[chave] = padraoNovo[chave];
        }
      }
      return proximo;
    });

    setSegmento(novoSegmento);
    setTrocaSegmentoPendente(null);
  }

  function handleTerminologiaChange(chave, valor) {
    setTerminologia((prev) => ({ ...prev, [chave]: valor }));
  }

  const validarForm = useCallback(() => {
    const novosErros = {};

    if (!form.nome.trim()) {
      novosErros.nome = 'O nome do estúdio é obrigatório.';
    }
    if (form.email_suporte && !REGEX_EMAIL.test(form.email_suporte)) {
      novosErros.email_suporte = 'E-mail inválido.';
    }
    if (form.whatsapp && !REGEX_WHATSAPP.test(form.whatsapp)) {
      novosErros.whatsapp = 'Use apenas números: código do país + DDD + número.';
    }
    if (!urlValidaOuVazia(form.instagram)) {
      novosErros.instagram = 'URL inválida (use http:// ou https://).';
    }
    if (!urlValidaOuVazia(form.maps_url)) {
      novosErros.maps_url = 'URL inválida (use http:// ou https://).';
    }
    if (form.cor_primaria && !REGEX_HEX_COLOR.test(form.cor_primaria)) {
      novosErros.cor_primaria = 'Cor inválida. Use o formato #RRGGBB.';
    }
    if (form.cor_secundaria && !REGEX_HEX_COLOR.test(form.cor_secundaria)) {
      novosErros.cor_secundaria = 'Cor inválida. Use o formato #RRGGBB.';
    }

    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }, [form]);

  async function handleSalvar() {
    if (!idEfetivo) {
      showToast.error('Não foi possível identificar o estúdio. Recarregue a página.');
      return;
    }
    if (!podeEditar) {
      showToast.error('Você não tem permissão para editar essas configurações.');
      return;
    }
    if (!validarForm()) {
      showToast.error('Corrija os campos destacados antes de salvar.');
      return;
    }

    setSalvando(true);
    try {
      // Terminologia: só grava chaves com valor preenchido — string vazia
      // vira "ausente" (cai no fallback de resolverRotulo) em vez de
      // gravar '' e o fallback nunca mais entrar em ação pra aquele campo.
      const terminologiaLimpa = Object.fromEntries(
        Object.entries(terminologia).filter(([, v]) => v && v.trim())
      );

      await atualizarEstudio(idEfetivo, {
        ...form,
        cor_primaria: form.cor_primaria.trim() || null,
        cor_secundaria: form.cor_secundaria.trim() || null,
        segmento,
        terminologia: terminologiaLimpa,
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['estudio-atual'] }),
        queryClient.invalidateQueries({ queryKey: ['estudio', idEfetivo] }),
      ]);
      if (montadoRef.current) showToast.success('Configurações salvas com sucesso!');
    } catch (err) {
      console.error('[ConfiguracoesEstudio] Erro ao salvar:', err);
      if (!montadoRef.current) return;
      if (err?.code === '42501' || err?.status === 403) {
        showToast.error('Sem permissão para salvar estas configurações.');
      } else if (err?.message?.toLowerCase().includes('network') || err?.message?.toLowerCase().includes('fetch')) {
        showToast.error('Falha de conexão. Verifique sua internet e tente novamente.');
      } else {
        showToast.error(err?.message || 'Erro ao salvar. Tente novamente.');
      }
    } finally {
      if (montadoRef.current) setSalvando(false);
    }
  }

  async function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!idEfetivo) {
      showToast.error('Não foi possível identificar o estúdio. Recarregue a página.');
      e.target.value = '';
      return;
    }
    if (!TIPOS_LOGO_PERMITIDOS.includes(file.type)) {
      showToast.error('Formato inválido. Use PNG, JPG ou WEBP.'); // SVG removido — ver nota de segurança
      e.target.value = '';
      return;
    }
    if (file.size > TAMANHO_MAX_LOGO_MB * 1024 * 1024) {
      showToast.error(`A imagem deve ter até ${TAMANHO_MAX_LOGO_MB}MB.`);
      e.target.value = '';
      return;
    }

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    const novaPreviewUrl = URL.createObjectURL(file);
    objectUrlRef.current = novaPreviewUrl;
    setPreviewLogo(novaPreviewUrl);

    setUploadandoLogo(true);
    try {
      const url = await uploadLogo(idEfetivo, file);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current); // revoga assim que a URL remota está disponível
        objectUrlRef.current = null;
      }
      if (montadoRef.current) setPreviewLogo(url);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['estudio-atual'] }),
        queryClient.invalidateQueries({ queryKey: ['estudio', idEfetivo] }),
      ]);
      if (montadoRef.current) showToast.success('Logo atualizado com sucesso!');
    } catch (err) {
      console.error('[ConfiguracoesEstudio] Erro ao enviar logo:', err);
      if (!montadoRef.current) return;
      showToast.error('Erro ao enviar o logo. Tente novamente.');
      setPreviewLogo(estudio?.logo_url ?? null);
    } finally {
      if (montadoRef.current) setUploadandoLogo(false);
      e.target.value = '';
    }
  }

  // PED-9: mesmo padrão de handleLogoChange acima — preview otimista via
  // blob URL, upload real em background, rollback do preview em caso de
  // erro. `landing_config` é lido via invalidação de `estudio`/`estudio-atual`
  // (mesmas queries do logo), já que uploadImagemCapa mescla a URL nova
  // nesse jsonb no backend.
  async function handleCapaChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!idEfetivo) {
      showToast.error('Não foi possível identificar o estúdio. Recarregue a página.');
      e.target.value = '';
      return;
    }
    if (!TIPOS_CAPA_PERMITIDOS.includes(file.type)) {
      showToast.error('Formato inválido. Use PNG, JPG ou WEBP.');
      e.target.value = '';
      return;
    }
    if (file.size > TAMANHO_MAX_CAPA_MB * 1024 * 1024) {
      showToast.error(`A imagem deve ter até ${TAMANHO_MAX_CAPA_MB}MB.`);
      e.target.value = '';
      return;
    }

    if (objectUrlCapaRef.current) {
      URL.revokeObjectURL(objectUrlCapaRef.current);
    }
    const novaPreviewUrl = URL.createObjectURL(file);
    objectUrlCapaRef.current = novaPreviewUrl;
    setPreviewCapa(novaPreviewUrl);

    setUploadandoCapa(true);
    try {
      const url = await uploadImagemCapa(idEfetivo, file);
      if (objectUrlCapaRef.current) {
        URL.revokeObjectURL(objectUrlCapaRef.current); // revoga assim que a URL remota está disponível
        objectUrlCapaRef.current = null;
      }
      if (montadoRef.current) setPreviewCapa(url);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['estudio-atual'] }),
        queryClient.invalidateQueries({ queryKey: ['estudio', idEfetivo] }),
      ]);
      if (montadoRef.current) showToast.success('Foto de capa atualizada com sucesso!');
    } catch (err) {
      console.error('[ConfiguracoesEstudio] Erro ao enviar foto de capa:', err);
      if (!montadoRef.current) return;
      showToast.error('Erro ao enviar a foto de capa. Tente novamente.');
      setPreviewCapa(estudio?.landing_config?.imagem_capa_url ?? null);
    } finally {
      if (montadoRef.current) setUploadandoCapa(false);
      e.target.value = '';
    }
  }

  function handleLandingChange(e) {
    const { name, value } = e.target;
    setLandingForm((prev) => ({ ...prev, [name]: value }));
  }

  // "Restaurar padrão" por campo: limpa só o campo clicado, não os outros
  // dois — cada chave do landing_config é independente (ver AC do PED-10).
  function handleRestaurarCampoLanding(campo) {
    setLandingForm((prev) => ({ ...prev, [campo]: '' }));
  }

  async function handleSalvarLanding() {
    if (!idEfetivo) {
      showToast.error('Não foi possível identificar o estúdio. Recarregue a página.');
      return;
    }
    if (!podeEditar) {
      showToast.error('Você não tem permissão para editar essas configurações.');
      return;
    }

    setSalvandoLanding(true);
    try {
      await salvarLandingTexto(idEfetivo, landingForm);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['estudio-atual'] }),
        queryClient.invalidateQueries({ queryKey: ['estudio', idEfetivo] }),
      ]);
      if (montadoRef.current) showToast.success('Landing page atualizada com sucesso!');
    } catch (err) {
      console.error('[ConfiguracoesEstudio] Erro ao salvar landing:', err);
      if (!montadoRef.current) return;
      showToast.error(err?.message || 'Erro ao salvar. Tente novamente.');
    } finally {
      if (montadoRef.current) setSalvandoLanding(false);
    }
  }

  const nomeSegmentoPendente = useMemo(
    () => SEGMENTOS.find((s) => s.value === trocaSegmentoPendente)?.label ?? '',
    [trocaSegmentoPendente]
  );

  // PED-10: default de copy do segmento ATUAL selecionado no form (não o
  // já salvo em `estudio.segmento`) — se o admin troca o segmento e ainda
  // não salvou, os placeholders/preview já refletem o segmento novo.
  const copyPadraoLanding = useMemo(() => resolverLandingCopy(segmento), [segmento]);

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded-2xl w-64" />
          <div className="h-4 bg-muted rounded-xl w-96" />
          <div className="h-64 bg-muted rounded-3xl mt-8" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-4xl mx-auto p-8">
        <Surface variant="card" padding="xl">
          <p className="text-destructive font-bold">
            Não foi possível carregar as configurações do estúdio.
          </p>
          <p className="text-muted-foreground text-sm mt-1">
            {error?.message ?? 'Tente recarregar a página.'}
          </p>
        </Surface>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-8 animate-in fade-in space-y-8">

      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
          <Settings className="text-primary" />
          Configurações do Estúdio
        </h1>
        <p className="text-muted-foreground font-medium mt-1">
          Personalize as informações, identidade visual e contato do seu estúdio.
        </p>
      </div>

      {/* PED-10: abas client-side (sem rota nova) — "Geral" mantém o fluxo
          existente (nome, logo, cor, segmento, contato); "Landing Page"
          agrupa o mini page-builder (capa, headline, subheadline, sobre),
          com salvamento próprio e independente. */}
      <div className="flex gap-2 border-b border-border">
        <button
          type="button"
          onClick={() => setAbaAtiva('geral')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
            abaAtiva === 'geral'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Geral
        </button>
        <button
          type="button"
          onClick={() => setAbaAtiva('landing')}
          className={`px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
            abaAtiva === 'landing'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Landing Page
        </button>
      </div>

      {abaAtiva === 'geral' && (
      <>
      {/* Logo */}
      <Surface variant="card" padding="xl">
        <h2 className="text-base font-black text-foreground mb-6 flex items-center gap-2">
          <Upload size={18} className="text-primary" />
          Logo do Estúdio
        </h2>

        <div className="flex items-center gap-6">
          {/* Preview */}
          <div className="relative shrink-0">
            <div className="w-24 h-24 rounded-3xl border-2 border-dashed border-border bg-muted flex items-center justify-center overflow-hidden">
              {previewLogo ? (
                <img
                  src={previewLogo}
                  alt="Logo do estúdio"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-3xl font-black text-primary">
                  {form.nome?.charAt(0)?.toUpperCase() ?? 'E'}
                </span>
              )}
            </div>
            {uploadandoLogo && (
              <div className="absolute inset-0 rounded-3xl bg-black/40 flex items-center justify-center">
                <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="space-y-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleLogoChange}
              disabled={!podeEditar}
            />
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Upload size={16} />}
              onClick={() => fileInputRef.current?.click()}
              loading={uploadandoLogo}
              disabled={!podeEditar}
            >
              {uploadandoLogo ? 'Enviando...' : 'Escolher imagem'}
            </Button>
            <p className="text-xs text-muted-foreground font-medium">
              PNG, JPG, WEBP ou SVG. Até {TAMANHO_MAX_LOGO_MB}MB. Recomendado: 512×512 px.
            </p>
          </div>
        </div>
      </Surface>

      {/* Informações básicas */}
      <Surface variant="card" padding="xl">
        <h2 className="text-base font-black text-foreground mb-6 flex items-center gap-2">
          <Globe size={18} className="text-primary" />
          Informações Básicas
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FieldGroup className="md:col-span-2">
            <Label htmlFor="nome" required>Nome do Estúdio</Label>
            <Input
              id="nome"
              name="nome"
              value={form.nome}
              onChange={handleChange}
              placeholder="Ex: Espaço Nexofy"
              error={erros.nome}
              disabled={!podeEditar}
            />
            {erros.nome && <p className="text-xs text-destructive font-medium">{erros.nome}</p>}
          </FieldGroup>

          <FieldGroup>
            <Label htmlFor="timezone">Fuso Horário</Label>
            <Input
              as="select"
              id="timezone"
              name="timezone"
              value={form.timezone}
              onChange={handleChange}
              className="font-medium"
              disabled={!podeEditar}
            >
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </Input>
          </FieldGroup>

        </div>

        {/* Nível 2: cor de marca customizável — sem valor definido (campo em
            branco) significa "sem customização"; a landing usa a paleta
            padrão do Nexofy automaticamente (fallback tratado no front-end,
            nunca no banco — ver PED-5). */}
        <div className="flex items-center justify-between mt-6 mb-2">
          <h3 className="text-sm font-black text-foreground flex items-center gap-1.5">
            <Palette size={14} className="text-primary" />
            Cor de Marca
          </h3>
          {(form.cor_primaria || form.cor_secundaria) && podeEditar && (
            <button
              type="button"
              onClick={handleRestaurarCores}
              className="text-xs font-bold text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Restaurar padrão
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground font-medium mb-4">
          Deixe em branco para usar a paleta padrão do Nexofy na landing page do estúdio.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FieldGroup>
            <Label htmlFor="cor_primaria" className="flex items-center gap-1.5">
              <Palette size={12} />
              Cor Primária
            </Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="cor_primaria"
                name="cor_primaria"
                value={REGEX_HEX_COLOR.test(form.cor_primaria) ? form.cor_primaria : '#7c3aed'}
                onChange={handleChange}
                className="h-11 w-14 cursor-pointer rounded-xl border border-border bg-input p-1"
                disabled={!podeEditar}
                aria-label="Selecionar cor primária"
              />
              <Input
                name="cor_primaria"
                value={form.cor_primaria}
                onChange={handleChange}
                placeholder="Padrão do Nexofy"
                className="font-mono"
                error={erros.cor_primaria}
                disabled={!podeEditar}
              />
            </div>
            {erros.cor_primaria && (
              <p className="text-xs text-destructive font-medium">{erros.cor_primaria}</p>
            )}
          </FieldGroup>

          <FieldGroup>
            <Label htmlFor="cor_secundaria" className="flex items-center gap-1.5">
              <Palette size={12} />
              Cor Secundária <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="cor_secundaria"
                name="cor_secundaria"
                value={REGEX_HEX_COLOR.test(form.cor_secundaria) ? form.cor_secundaria : '#a78bfa'}
                onChange={handleChange}
                className="h-11 w-14 cursor-pointer rounded-xl border border-border bg-input p-1"
                disabled={!podeEditar}
                aria-label="Selecionar cor secundária"
              />
              <Input
                name="cor_secundaria"
                value={form.cor_secundaria}
                onChange={handleChange}
                placeholder="Padrão do Nexofy"
                className="font-mono"
                error={erros.cor_secundaria}
                disabled={!podeEditar}
              />
            </div>
            {erros.cor_secundaria && (
              <p className="text-xs text-destructive font-medium">{erros.cor_secundaria}</p>
            )}
          </FieldGroup>
        </div>
      </Surface>

      {/* Segmento, terminologia e módulos — item 2 do plano multi-segmento */}
      <Surface variant="card" padding="xl">
        <h2 className="text-base font-black text-foreground mb-2 flex items-center gap-2">
          <LayoutGrid size={18} className="text-primary" />
          Segmento e Nomenclatura
        </h2>
        <p className="text-xs text-muted-foreground font-medium mb-6">
          O segmento não altera nenhuma regra de negócio — só sugere rótulos padrão e decide
          quais módulos aparecem no menu. Os nomes abaixo podem ser customizados livremente.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FieldGroup>
            <Label htmlFor="segmento">Segmento do Estúdio</Label>
            <Input
              as="select"
              id="segmento"
              name="segmento"
              value={segmento}
              onChange={handleSegmentoChange}
              className="font-medium"
              disabled={!podeEditar}
            >
              {SEGMENTOS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </Input>
          </FieldGroup>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
          {CHAVES_TERMINOLOGIA.map((chave) => (
            <FieldGroup key={chave}>
              <Label htmlFor={`terminologia_${chave}`}>
                Como chamar &quot;{LABELS_CHAVE_TERMINOLOGIA[chave] ?? chave}&quot;
              </Label>
              <Input
                id={`terminologia_${chave}`}
                name={`terminologia_${chave}`}
                value={terminologia[chave] ?? ''}
                onChange={(e) => handleTerminologiaChange(chave, e.target.value)}
                placeholder={terminologiaPadraoDoSegmento(segmento)[chave]}
                disabled={!podeEditar}
              />
            </FieldGroup>
          ))}
        </div>

        <div className="mt-6 pt-5 border-t border-border">
          <Label className="mb-3 block">Módulos Ativos</Label>
          <div className="flex flex-wrap gap-2">
            {MODULOS_NUCLEO.map((m) => (
              <span
                key={m.value}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-muted text-xs font-bold text-muted-foreground"
              >
                {m.label}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground font-medium mt-2">
            Módulos do núcleo, sempre disponíveis. Módulos opcionais por segmento aparecerão
            aqui conforme forem lançados.
          </p>
        </div>
      </Surface>

      {/* Contato */}
      <Surface variant="card" padding="xl">
        <h2 className="text-base font-black text-foreground mb-6 flex items-center gap-2">
          <Phone size={18} className="text-primary" />
          Contato e Redes Sociais
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FieldGroup>
            <Label htmlFor="whatsapp">WhatsApp de Suporte</Label>
            <Input
              id="whatsapp"
              name="whatsapp"
              value={form.whatsapp}
              onChange={handleChange}
              placeholder="5551999999999"
              leftIcon={<Phone size={16} />}
              error={erros.whatsapp}
              disabled={!podeEditar}
            />
            <p className="text-[11px] text-muted-foreground font-medium">
              Formato: código do país + DDD + número (sem espaços).
            </p>
            {erros.whatsapp && (
              <p className="text-xs text-destructive font-medium">{erros.whatsapp}</p>
            )}
          </FieldGroup>

          <FieldGroup>
            <Label htmlFor="email_suporte">E-mail de Suporte</Label>
            <Input
              id="email_suporte"
              name="email_suporte"
              type="email"
              value={form.email_suporte}
              onChange={handleChange}
              placeholder="contato@meuestudio.com"
              leftIcon={<Mail size={16} />}
              error={erros.email_suporte}
              disabled={!podeEditar}
            />
            {erros.email_suporte && (
              <p className="text-xs text-destructive font-medium">{erros.email_suporte}</p>
            )}
          </FieldGroup>

          <FieldGroup>
            <Label htmlFor="instagram">Instagram</Label>
            <Input
              id="instagram"
              name="instagram"
              value={form.instagram}
              onChange={handleChange}
              placeholder="https://instagram.com/meuestudio"
              leftIcon={<Instagram size={16} />}
              error={erros.instagram}
              disabled={!podeEditar}
            />
            {erros.instagram && (
              <p className="text-xs text-destructive font-medium">{erros.instagram}</p>
            )}
          </FieldGroup>

          <FieldGroup>
            <Label htmlFor="maps_url">Google Maps URL</Label>
            <Input
              id="maps_url"
              name="maps_url"
              value={form.maps_url}
              onChange={handleChange}
              placeholder="https://maps.google.com/..."
              leftIcon={<MapPin size={16} />}
              error={erros.maps_url}
              disabled={!podeEditar}
            />
            {erros.maps_url && (
              <p className="text-xs text-destructive font-medium">{erros.maps_url}</p>
            )}
          </FieldGroup>
        </div>
      </Surface>

      {/* Botão salvar */}
      <div className="flex justify-end pb-4">
        <Button
          variant="brand"
          size="lg"
          leftIcon={<Save size={20} />}
          onClick={handleSalvar}
          loading={salvando}
          disabled={!podeEditar || salvando}
        >
          {salvando ? 'Salvando...' : 'Salvar Configurações'}
        </Button>
      </div>
      </>
      )}

      {abaAtiva === 'landing' && (
      <>
      {/* Foto de capa — movido do bloco antigo em Geral (PED-9) pra cá */}
      <Surface variant="card" padding="xl">
        <h2 className="text-base font-black text-foreground mb-6 flex items-center gap-2">
          <Upload size={18} className="text-primary" />
          Foto de Capa da Landing Page
        </h2>

        <div className="flex items-center gap-6">
          {/* Preview — proporção larga (16:9-ish) por ser a imagem de hero da landing, ao contrário do logo quadrado */}
          <div className="relative shrink-0">
            <div className="w-48 h-28 rounded-2xl border-2 border-dashed border-border bg-muted flex items-center justify-center overflow-hidden">
              {previewCapa ? (
                <img
                  src={previewCapa}
                  alt="Foto de capa da landing page"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs text-muted-foreground font-medium px-3 text-center">
                  Sem foto de capa — usa a padrão do segmento
                </span>
              )}
            </div>
            {uploadandoCapa && (
              <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center">
                <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
              </div>
            )}
          </div>

          {/* Ações */}
          <div className="space-y-2">
            <input
              ref={fileInputCapaRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleCapaChange}
              disabled={!podeEditar}
            />
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Upload size={16} />}
              onClick={() => fileInputCapaRef.current?.click()}
              loading={uploadandoCapa}
              disabled={!podeEditar}
            >
              {uploadandoCapa ? 'Enviando...' : 'Escolher imagem'}
            </Button>
            <p className="text-xs text-muted-foreground font-medium">
              PNG, JPG ou WEBP. Até {TAMANHO_MAX_CAPA_MB}MB. Recomendado: 1600×900 px (16:9).
            </p>
          </div>
        </div>
      </Surface>

      {/* Textos customizados — headline/subheadline/sobre_texto, cada um
          com placeholder = default do segmento e "Restaurar padrão"
          individual. Campo vazio = usa o default (nunca obrigatório). */}
      <Surface variant="card" padding="xl">
        <h2 className="text-base font-black text-foreground mb-2 flex items-center gap-2">
          <Globe size={18} className="text-primary" />
          Textos da Landing Page
        </h2>
        <p className="text-xs text-muted-foreground font-medium mb-6">
          Deixe em branco para usar o texto padrão do segmento (mostrado como exemplo abaixo de cada campo).
        </p>

        <div className="space-y-5">
          <FieldGroup>
            <div className="flex items-center justify-between">
              <Label htmlFor="landing_headline">Headline</Label>
              {landingForm.headline && podeEditar && (
                <button
                  type="button"
                  onClick={() => handleRestaurarCampoLanding('headline')}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Restaurar padrão
                </button>
              )}
            </div>
            <Input
              id="landing_headline"
              name="headline"
              value={landingForm.headline}
              onChange={handleLandingChange}
              placeholder={`${copyPadraoLanding.heroTitlePre} ${copyPadraoLanding.heroTitleEm}`}
              disabled={!podeEditar}
            />
          </FieldGroup>

          <FieldGroup>
            <div className="flex items-center justify-between">
              <Label htmlFor="landing_subheadline">Subheadline</Label>
              {landingForm.subheadline && podeEditar && (
                <button
                  type="button"
                  onClick={() => handleRestaurarCampoLanding('subheadline')}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Restaurar padrão
                </button>
              )}
            </div>
            <Input
              as="textarea"
              rows={2}
              id="landing_subheadline"
              name="subheadline"
              value={landingForm.subheadline}
              onChange={handleLandingChange}
              placeholder={copyPadraoLanding.heroSub}
              disabled={!podeEditar}
            />
          </FieldGroup>

          <FieldGroup>
            <div className="flex items-center justify-between">
              <Label htmlFor="landing_sobre_texto">Sobre o estúdio</Label>
              {landingForm.sobre_texto && podeEditar && (
                <button
                  type="button"
                  onClick={() => handleRestaurarCampoLanding('sobre_texto')}
                  className="text-xs font-bold text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Restaurar padrão
                </button>
              )}
            </div>
            <Input
              as="textarea"
              rows={4}
              id="landing_sobre_texto"
              name="sobre_texto"
              value={landingForm.sobre_texto}
              onChange={handleLandingChange}
              placeholder={copyPadraoLanding.sobreTexto}
              disabled={!podeEditar}
            />
          </FieldGroup>
        </div>
      </Surface>

      {/* Preview em tempo real — card leve, não é um iframe da landing de
          verdade (custo/complexidade desproporcional pro valor aqui);
          atualiza a cada tecla, sem debounce (render de texto puro, sem
          custo perceptível). */}
      <Surface variant="card" padding="none" className="overflow-hidden">
        <div className="px-6 pt-5 pb-3 border-b border-border">
          <h2 className="text-base font-black text-foreground flex items-center gap-2">
            <Globe size={18} className="text-primary" />
            Preview
          </h2>
          <p className="text-xs text-muted-foreground font-medium mt-1">
            Como o hero da landing pública vai ficar (aproximado).
          </p>
        </div>
        <div
          className="relative flex flex-col items-start justify-center gap-3 p-8 min-h-[220px] bg-cover bg-center"
          style={{
            backgroundImage: previewCapa
              ? `linear-gradient(to bottom, rgba(0,0,0,.45), rgba(0,0,0,.65)), url(${previewCapa})`
              : 'linear-gradient(135deg, hsl(var(--muted)) 0%, hsl(var(--border)) 100%)',
          }}
        >
          <span className="inline-block px-3 py-1 rounded-full bg-white/15 backdrop-blur text-white text-[11px] font-bold tracking-wide">
            {copyPadraoLanding.heroTag}
          </span>
          <h3 className={`text-2xl font-black leading-tight ${previewCapa ? 'text-white' : 'text-foreground'}`}>
            {landingForm.headline || `${copyPadraoLanding.heroTitlePre} ${copyPadraoLanding.heroTitleEm}`}
          </h3>
          <p className={`text-sm font-medium max-w-lg ${previewCapa ? 'text-white/90' : 'text-muted-foreground'}`}>
            {landingForm.subheadline || copyPadraoLanding.heroSub}
          </p>
        </div>
        <div className="p-6">
          <p className="text-xs font-black text-muted-foreground uppercase tracking-wide mb-1.5">Sobre o estúdio</p>
          <p className="text-sm text-foreground font-medium">
            {landingForm.sobre_texto || copyPadraoLanding.sobreTexto}
          </p>
        </div>
      </Surface>

      {/* Botão salvar (independente do "Salvar Configurações" da aba Geral —
          persiste via salvarLandingTexto/RPC de merge, não atualizarEstudio) */}
      <div className="flex justify-end pb-4">
        <Button
          variant="brand"
          size="lg"
          leftIcon={<Save size={20} />}
          onClick={handleSalvarLanding}
          loading={salvandoLanding}
          disabled={!podeEditar || salvandoLanding}
        >
          {salvandoLanding ? 'Salvando...' : 'Salvar Landing Page'}
        </Button>
      </div>
      </>
      )}

      {/* Confirmação de troca de segmento */}
      <ModalConfirmacao
        aberto={!!trocaSegmentoPendente}
        fechar={() => setTrocaSegmentoPendente(null)}
        titulo="Trocar segmento do estúdio?"
        mensagem={`Isso vai atualizar os rótulos padrão para "${nomeSegmentoPendente}" nos campos que você ainda não personalizou. Nomes já customizados não serão alterados. A troca só é salva ao clicar em "Salvar Configurações".`}
        textoConfirmar="Trocar segmento"
        textoCancelar="Cancelar"
        tipo="warning"
        onConfirm={confirmarTrocaSegmento}
      />
    </div>
  );
}