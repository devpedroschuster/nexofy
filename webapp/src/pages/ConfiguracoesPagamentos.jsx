import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CreditCard, AlertTriangle, CheckCircle2, Building2, Zap } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { useImpersonation } from '../context/ImpersonationContext';
import { useEstudio } from '../hooks/useEstudio';
import { useEstudioAsaas } from '../hooks/useEstudioAsaas';
import { salvarDadosAsaas } from '../services/estudioAsaasService';
import { showToast } from '../components/shared/Toast';
import { supabase } from '../lib/supabase';
import Button from '../components/ui/Button';
import Input, { FormField } from '../components/ui/Input';
import Surface from '../components/ui/Surface';

const ASAAS_STATUS_LABELS = {
  nao_configurado:    { texto: 'Pagamentos automáticos não ativados', tom: 'muted' },
  pendente_aprovacao: { texto: 'Subconta enviada — aguardando aprovação da Asaas', tom: 'info' },
  ativa:               { texto: 'Pagamentos automáticos ativos', tom: 'success' },
  rejeitada:           { texto: 'Subconta rejeitada pela Asaas — revise os dados e tente novamente', tom: 'destructive' },
};

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_TELEFONE = /^\d{10,15}$/;
const REGEX_CEP = /^\d{8}$/;

const COMPANY_TYPES = [
  { value: '',             label: 'Selecione…' },
  { value: 'MEI',          label: 'MEI' },
  { value: 'LIMITED',      label: 'Limitada (LTDA)' },
  { value: 'INDIVIDUAL',   label: 'Empresário Individual' },
  { value: 'ASSOCIATION',  label: 'Associação' },
];

const FORM_VAZIO = {
  nome_responsavel: '',
  email_responsavel: '',
  telefone_celular: '',
  telefone_fixo: '',
  cnpj: '',
  company_type: '',
  faturamento_mensal: '',
  site: '',
  cep: '',
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
};

function apenasDigitos(valor) {
  return (valor || '').replace(/\D/g, '');
}

// CNPJ tem 14 dígitos, CPF tem 11. Não validamos dígito verificador aqui —
// isso é responsabilidade da Asaas na criação da subconta; o objetivo deste
// helper é só decidir se mostramos o aviso de bloqueio de pagamento automático.
function classificarDocumento(valor) {
  const digitos = apenasDigitos(valor);
  if (digitos.length === 14) return 'cnpj';
  if (digitos.length === 11) return 'cpf';
  return null;
}

const STATUS_LABELS = {
  incompleto: { texto: 'Cadastro incompleto', tom: 'muted' },
  enviado:    { texto: 'Enviado para análise', tom: 'info' },
  aprovado:   { texto: 'Aprovado — pagamentos automáticos ativos', tom: 'success' },
  rejeitado:  { texto: 'Cadastro rejeitado pela Asaas — revise os dados', tom: 'destructive' },
};

export default function ConfiguracoesPagamentos() {
  const queryClient = useQueryClient();
  const { estudioId, perfil } = useAuth();
  const { estudioAtivo } = useImpersonation();
  const idEfetivo = estudioAtivo?.id ?? estudioId;

  const { data: estudio } = useEstudio(idEfetivo);
  const { data: dadosAsaas, isLoading, isError, error } = useEstudioAsaas(idEfetivo);

  const [ativando, setAtivando] = useState(false);

  const montadoRef = useRef(true);
  useEffect(() => {
    montadoRef.current = true;
    return () => { montadoRef.current = false; };
  }, []);

  const [form, setForm] = useState(FORM_VAZIO);
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);

  const podeEditar = perfil === 'admin' || perfil === 'super_admin';

  useEffect(() => {
    if (!dadosAsaas) return;
    setForm({
      nome_responsavel:    dadosAsaas.nome_responsavel    ?? '',
      email_responsavel:   dadosAsaas.email_responsavel   ?? '',
      telefone_celular:    dadosAsaas.telefone_celular    ?? '',
      telefone_fixo:       dadosAsaas.telefone_fixo       ?? '',
      cnpj:                dadosAsaas.cnpj                ?? '',
      company_type:        dadosAsaas.company_type        ?? '',
      faturamento_mensal:  dadosAsaas.faturamento_mensal  ?? '',
      site:                dadosAsaas.site                ?? '',
      cep:                 dadosAsaas.cep                 ?? '',
      endereco:            dadosAsaas.endereco            ?? '',
      numero:              dadosAsaas.numero              ?? '',
      complemento:         dadosAsaas.complemento         ?? '',
      bairro:              dadosAsaas.bairro              ?? '',
    });
  }, [dadosAsaas]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (erros[name]) setErros((prev) => ({ ...prev, [name]: undefined }));
  }

  const tipoDocumento = classificarDocumento(form.cnpj);

  const validarForm = useCallback(() => {
    const novosErros = {};

    if (!form.nome_responsavel.trim()) {
      novosErros.nome_responsavel = 'Informe o nome do responsável legal.';
    }
    if (!form.email_responsavel.trim() || !REGEX_EMAIL.test(form.email_responsavel)) {
      novosErros.email_responsavel = 'E-mail inválido.';
    }
    if (!REGEX_TELEFONE.test(apenasDigitos(form.telefone_celular))) {
      novosErros.telefone_celular = 'Use apenas números: DDD + celular.';
    }
    const digitosDoc = apenasDigitos(form.cnpj);
    if (digitosDoc.length !== 11 && digitosDoc.length !== 14) {
      novosErros.cnpj = 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.';
    }
    if (!form.faturamento_mensal || Number(form.faturamento_mensal) <= 0) {
      novosErros.faturamento_mensal = 'Informe o faturamento/renda mensal.';
    }
    if (!REGEX_CEP.test(apenasDigitos(form.cep))) {
      novosErros.cep = 'CEP inválido. Use 8 dígitos.';
    }
    if (!form.endereco.trim()) novosErros.endereco = 'Informe o endereço.';
    if (!form.numero.trim()) novosErros.numero = 'Informe o número.';
    if (!form.bairro.trim()) novosErros.bairro = 'Informe o bairro.';

    setErros(novosErros);
    return Object.keys(novosErros).length === 0;
  }, [form]);

  async function handleSalvar() {
    if (!idEfetivo) {
      showToast.error('Não foi possível identificar o estúdio. Recarregue a página.');
      return;
    }
    if (!podeEditar) {
      showToast.error('Você não tem permissão para editar essas informações.');
      return;
    }
    if (!validarForm()) {
      showToast.error('Corrija os campos destacados antes de salvar.');
      return;
    }

    setSalvando(true);
    try {
      await salvarDadosAsaas(idEfetivo, {
        ...form,
        cnpj: apenasDigitos(form.cnpj),
        telefone_celular: apenasDigitos(form.telefone_celular),
        telefone_fixo: form.telefone_fixo ? apenasDigitos(form.telefone_fixo) : null,
        cep: apenasDigitos(form.cep),
        company_type: form.company_type || null,
        faturamento_mensal: Number(form.faturamento_mensal),
      });
      await queryClient.invalidateQueries({ queryKey: ['estudio-dados-asaas', idEfetivo] });
      if (montadoRef.current) showToast.success('Dados salvos com sucesso!');
    } catch (err) {
      console.error('[ConfiguracoesPagamentos] Erro ao salvar:', err);
      if (!montadoRef.current) return;
      if (err?.code === '42501' || err?.status === 403) {
        showToast.error('Sem permissão para salvar estas informações.');
      } else {
        showToast.error(err?.message || 'Erro ao salvar. Tente novamente.');
      }
    } finally {
      if (montadoRef.current) setSalvando(false);
    }
  }

  // Baseado em dadosAsaas (o que está salvo no servidor), não em `form`
  // (o rascunho em edição) — evita ativar a subconta com dados diferentes
  // do que o admin vê salvos na tela, caso ele tenha editado sem salvar.
  const documentoSalvo = classificarDocumento(dadosAsaas?.cnpj);
  const camposObrigatoriosSalvos = [
    dadosAsaas?.nome_responsavel,
    dadosAsaas?.email_responsavel,
    dadosAsaas?.telefone_celular,
    dadosAsaas?.faturamento_mensal,
    dadosAsaas?.cep,
    dadosAsaas?.endereco,
    dadosAsaas?.numero,
    dadosAsaas?.bairro,
  ];
  const cadastroCompletoSalvo = camposObrigatoriosSalvos.every(Boolean);
  const asaasStatus = estudio?.asaas_status ?? 'nao_configurado';
  const jaAtivadoOuPendente = ['ativa', 'pendente_aprovacao'].includes(asaasStatus);

  let motivoBloqueio = null;
  if (!dadosAsaas) motivoBloqueio = 'Preencha e salve os dados abaixo primeiro.';
  else if (!cadastroCompletoSalvo) motivoBloqueio = 'Complete e salve todos os campos obrigatórios primeiro.';
  else if (documentoSalvo !== 'cnpj') motivoBloqueio = 'É necessário CNPJ salvo para ativar pagamentos automáticos.';
  else if (jaAtivadoOuPendente) motivoBloqueio = null; // botão vira "já ativado", não bloqueio de erro

  async function handleAtivarPagamentos() {
    if (!idEfetivo || !podeEditar) return;

    setAtivando(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('criar-subconta-asaas', {
        body: { estudioId: idEfetivo },
      });

      // supabase-js não rejeita a Promise em erros HTTP 4xx/5xx da function;
      // o corpo de erro vem em `data` mesmo assim quando fnError existe.
      if (fnError) {
        const mensagem = data?.erro || fnError.message || 'Erro ao ativar pagamentos automáticos.';
        throw new Error(mensagem);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['estudio', idEfetivo] }),
        queryClient.invalidateQueries({ queryKey: ['estudio-dados-asaas', idEfetivo] }),
      ]);
      if (montadoRef.current) {
        showToast.success('Subconta criada! Aguardando aprovação da Asaas.');
      }
    } catch (err) {
      console.error('[ConfiguracoesPagamentos] Erro ao ativar pagamentos:', err);
      if (montadoRef.current) {
        showToast.error(err?.message || 'Erro ao ativar pagamentos automáticos.');
      }
    } finally {
      if (montadoRef.current) setAtivando(false);
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded-2xl w-64" />
          <div className="h-4 bg-muted rounded-xl w-96" />
          <div className="h-96 bg-muted rounded-3xl mt-8" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-3xl mx-auto p-8">
        <Surface variant="card" padding="xl">
          <p className="text-destructive font-bold">
            Não foi possível carregar os dados de pagamento.
          </p>
          <p className="text-muted-foreground text-sm mt-1">
            {error?.message ?? 'Tente recarregar a página.'}
          </p>
        </Surface>
      </div>
    );
  }

  const statusAtual = STATUS_LABELS[dadosAsaas?.status_cadastro ?? 'incompleto'];

  return (
    <div className="max-w-3xl mx-auto p-8 animate-in fade-in space-y-8">

      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
          <CreditCard className="text-primary" />
          Pagamentos Automáticos
        </h1>
        <p className="text-muted-foreground font-medium mt-1">
          Preencha os dados do responsável legal e do negócio para ativar cobrança
          automática de mensalidades via Pix, boleto ou cartão.
        </p>
      </div>

      {/* Status atual, se já existir cadastro */}
      {dadosAsaas && (
        <div
          className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold
            ${statusAtual.tom === 'success' ? 'bg-emerald-500/10 text-emerald-600' : ''}
            ${statusAtual.tom === 'info' ? 'bg-blue-500/10 text-blue-600' : ''}
            ${statusAtual.tom === 'destructive' ? 'bg-destructive/10 text-destructive' : ''}
            ${statusAtual.tom === 'muted' ? 'bg-muted text-muted-foreground' : ''}
          `}
        >
          {statusAtual.tom === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {statusAtual.texto}
        </div>
      )}

      {/* Ativação da subconta */}
      <Surface variant="card" padding="xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-base font-black text-foreground mb-1.5 flex items-center gap-2">
              <Zap size={18} className="text-primary" />
              Ativação
            </h2>
            <p
              className={`text-sm font-semibold
                ${ASAAS_STATUS_LABELS[asaasStatus].tom === 'success' ? 'text-emerald-600' : ''}
                ${ASAAS_STATUS_LABELS[asaasStatus].tom === 'info' ? 'text-blue-600' : ''}
                ${ASAAS_STATUS_LABELS[asaasStatus].tom === 'destructive' ? 'text-destructive' : ''}
                ${ASAAS_STATUS_LABELS[asaasStatus].tom === 'muted' ? 'text-muted-foreground' : ''}
              `}
            >
              {ASAAS_STATUS_LABELS[asaasStatus].texto}
            </p>
            {motivoBloqueio && !jaAtivadoOuPendente && (
              <p className="text-xs text-muted-foreground mt-1">{motivoBloqueio}</p>
            )}
          </div>

          <Button
            onClick={handleAtivarPagamentos}
            disabled={!podeEditar || ativando || Boolean(motivoBloqueio) || jaAtivadoOuPendente}
          >
            {ativando
              ? 'Ativando…'
              : jaAtivadoOuPendente
                ? (asaasStatus === 'ativa' ? 'Já ativo' : 'Aguardando aprovação')
                : 'Ativar Pagamentos Automáticos'}
          </Button>
        </div>
      </Surface>

      {/* Aviso condicional CPF vs CNPJ */}
      {tipoDocumento === 'cpf' && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3.5">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700 font-medium leading-relaxed">
            Você informou um CPF. Pagamentos automáticos (Pix, boleto e cartão via Nexofy)
            só podem ser ativados para negócios com <strong>CNPJ</strong> (MEI já é suficiente).
            Você pode salvar seus dados normalmente e continuar usando o Nexofy com
            pagamentos manuais — mas a ativação da cobrança automática vai exigir CNPJ.
          </p>
        </div>
      )}

      {/* Responsável legal */}
      <Surface variant="card" padding="xl">
        <h2 className="text-base font-black text-foreground mb-6 flex items-center gap-2">
          <Building2 size={18} className="text-primary" />
          Responsável e Negócio
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <FormField label="Nome do responsável legal" required error={erros.nome_responsavel} className="sm:col-span-2">
            <Input
              name="nome_responsavel"
              value={form.nome_responsavel}
              onChange={handleChange}
              disabled={!podeEditar}
              placeholder="Nome completo"
            />
          </FormField>

          <FormField label="E-mail do responsável" required error={erros.email_responsavel}>
            <Input
              name="email_responsavel"
              type="email"
              value={form.email_responsavel}
              onChange={handleChange}
              disabled={!podeEditar}
              placeholder="contato@estudio.com"
            />
          </FormField>

          <FormField label="Celular" required error={erros.telefone_celular} hint="DDD + número">
            <Input
              name="telefone_celular"
              value={form.telefone_celular}
              onChange={handleChange}
              disabled={!podeEditar}
              placeholder="51999998888"
            />
          </FormField>

          <FormField label="Telefone fixo" error={erros.telefone_fixo} hint="Opcional">
            <Input
              name="telefone_fixo"
              value={form.telefone_fixo}
              onChange={handleChange}
              disabled={!podeEditar}
              placeholder="5133334444"
            />
          </FormField>

          <FormField
            label="CNPJ ou CPF"
            required
            error={erros.cnpj}
            hint={tipoDocumento === 'cnpj' ? 'CNPJ detectado' : tipoDocumento === 'cpf' ? 'CPF detectado' : undefined}
          >
            <Input
              name="cnpj"
              value={form.cnpj}
              onChange={handleChange}
              disabled={!podeEditar}
              placeholder="Somente números"
            />
          </FormField>

          <FormField label="Tipo de empresa" error={erros.company_type} hint={tipoDocumento === 'cpf' ? 'Não aplicável para CPF' : 'Opcional'}>
            <Input
              as="select"
              name="company_type"
              value={form.company_type}
              onChange={handleChange}
              disabled={!podeEditar || tipoDocumento === 'cpf'}
            >
              {COMPANY_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </Input>
          </FormField>

          <FormField label="Faturamento/renda mensal (R$)" required error={erros.faturamento_mensal}>
            <Input
              name="faturamento_mensal"
              type="number"
              min="0"
              step="0.01"
              value={form.faturamento_mensal}
              onChange={handleChange}
              disabled={!podeEditar}
              placeholder="5000.00"
            />
          </FormField>

          <FormField label="Site" error={erros.site} hint="Opcional">
            <Input
              name="site"
              value={form.site}
              onChange={handleChange}
              disabled={!podeEditar}
              placeholder="https://seuestudio.com"
            />
          </FormField>
        </div>
      </Surface>

      {/* Endereço */}
      <Surface variant="card" padding="xl">
        <h2 className="text-base font-black text-foreground mb-6">Endereço</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <FormField label="CEP" required error={erros.cep}>
            <Input
              name="cep"
              value={form.cep}
              onChange={handleChange}
              disabled={!podeEditar}
              placeholder="Somente números"
            />
          </FormField>

          <FormField label="Bairro" required error={erros.bairro}>
            <Input
              name="bairro"
              value={form.bairro}
              onChange={handleChange}
              disabled={!podeEditar}
            />
          </FormField>

          <FormField label="Endereço" required error={erros.endereco} className="sm:col-span-2">
            <Input
              name="endereco"
              value={form.endereco}
              onChange={handleChange}
              disabled={!podeEditar}
              placeholder="Rua, avenida…"
            />
          </FormField>

          <FormField label="Número" required error={erros.numero}>
            <Input
              name="numero"
              value={form.numero}
              onChange={handleChange}
              disabled={!podeEditar}
            />
          </FormField>

          <FormField label="Complemento" error={erros.complemento} hint="Opcional">
            <Input
              name="complemento"
              value={form.complemento}
              onChange={handleChange}
              disabled={!podeEditar}
            />
          </FormField>
        </div>
      </Surface>

      <div className="flex justify-end gap-3">
        <Button onClick={handleSalvar} disabled={!podeEditar || salvando}>
          {salvando ? 'Salvando…' : 'Salvar dados'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        A ativação da cobrança automática (criação da subconta Asaas) acontece em uma
        etapa separada, após a revisão destes dados.
      </p>
    </div>
  );
}