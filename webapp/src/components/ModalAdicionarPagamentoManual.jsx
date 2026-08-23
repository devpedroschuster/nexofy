import React, { useState, useEffect } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import Input, { Label } from './ui/Input';
import { supabase } from '../lib/supabase';
import { financeiroService } from '../services/financeiroService';
import { showToast } from './shared/Toast';
import { useAuth } from '../hooks/useAuth';
import { User, DollarSign, Calendar, BookOpen, GraduationCap, Package, CreditCard, LayoutList, Loader2 } from 'lucide-react';

function traduzirErroRegistro(error) {
  const msg = error?.message || '';
  const code = error?.code || '';

  if (code === '23505' || msg.includes('duplicate key') || msg.includes('unique constraint')) {
    return 'Esse aluno já tem um pagamento registrado para este mês.';
  }
  if (code === '23503' || msg.includes('foreign key')) {
    return 'O aluno ou plano selecionado não foi encontrado. Atualize a página e tente de novo.';
  }
  if (code === '42501' || msg.includes('permission denied')) {
    return 'Você não tem permissão para registrar este pagamento.';
  }
  if (msg.includes('invalid input') || msg.includes('numeric')) {
    return 'O valor informado é inválido. Verifique e tente de novo.';
  }
  return 'Não foi possível registrar o pagamento. Verifique os dados e tente de novo.';
}

export default function ModalAdicionarPagamentoManual({ isOpen, onClose, onSucesso }) {
  const { estudioId } = useAuth();
  const [alunos, setAlunos] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [professores, setProfessores] = useState([]);
  const [loading, setLoading] = useState(false);
  const [carregandoDados, setCarregandoDados] = useState(false);
  const [isVisitante, setIsVisitante] = useState(false);

  const initialForm = {
    aluno_id: '',
    nome_visitante: '',
    tipo_aula: 'regular',
    plano_id: '',
    valor_pago: '',
    forma_pagamento: 'pix',
    data_pagamento: new Date().toISOString().split('T')[0],
    data_vencimento: new Date().toISOString().split('T')[0],
    professor_id: '',
    modalidade_nome: '',
    pago_a_vista: false,
  };
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (isOpen) {
      carregarDados();
    } else {
      setForm(initialForm);
      setIsVisitante(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, estudioId]);

  async function carregarDados() {
    if (!estudioId) return;
    setCarregandoDados(true);
    try {
      const [{ data: a, error: ea }, { data: p, error: ep }, { data: profs, error: eprofs }] = await Promise.all([
        supabase.from('alunos').select('id, nome_completo, plano_id').eq('estudio_id', estudioId).order('nome_completo'),
        // duracao_meses: necessário para calcular o período de cobertura
        // de pagamentos à vista (ver checkbox "Pagamento à vista" abaixo).
        supabase.from('planos').select('id, nome, preco, duracao_meses').eq('estudio_id', estudioId),
        supabase.from('professores').select('id, nome').eq('estudio_id', estudioId),
      ]);
      if (ea || ep || eprofs) throw ea || ep || eprofs;
      setAlunos(a ?? []);
      setPlanos(p ?? []);
      setProfessores(profs ?? []);
    } catch (error) {
      console.error('[ModalAdicionarPagamentoManual] Falha ao carregar dados:', error);
      showToast.error('Não foi possível carregar alunos/planos/professores. Tente novamente.');
    } finally {
      setCarregandoDados(false);
    }
  }

  const planoSelecionado = planos.find(p => p.id === form.plano_id);
  const planoMultiMes = form.tipo_aula === 'regular' && Number(planoSelecionado?.duracao_meses) > 1;

  async function handleSubmit(e) {
    e.preventDefault();

    if (!estudioId) {
      showToast.error('Estúdio não identificado. Recarregue a página e tente novamente.');
      return;
    }

    const valorPago = Number(form.valor_pago);
    if (!valorPago || valorPago <= 0) {
      showToast.error('Informe um valor válido maior que zero.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        aluno_id: isVisitante ? null : form.aluno_id,
        nome_visitante: isVisitante ? form.nome_visitante : null,
        tipo_aula: form.tipo_aula,
        valor_pago: valorPago,
        forma_pagamento: form.forma_pagamento,
        data_vencimento: form.data_vencimento,
        status: 'pago',
        data_pagamento: form.data_pagamento,
        // Só tem efeito quando planoMultiMes — ver calcularPeriodoFim em
        // financeiroService.js. Para plano mensal ou aula avulsa, o
        // período de cobertura é sempre igual à data de vencimento.
        pago_a_vista: planoMultiMes ? form.pago_a_vista : false,
        duracao_meses: planoSelecionado?.duracao_meses ?? null,
      };

      if (form.tipo_aula === 'regular' && form.plano_id) {
        payload.plano_id = form.plano_id;
      }
      if (form.tipo_aula === 'avulsa') {
        payload.professor_id = form.professor_id;
        payload.modalidade_nome = form.modalidade_nome;
      }

      const resultado = await financeiroService.adicionarPagamentoManual(payload, estudioId);

      const nomeExibicao = isVisitante
        ? form.nome_visitante
        : alunos.find(a => a.id === form.aluno_id)?.nome_completo?.split(' ')[0] || 'Aluno';

      showToast.success(`✅ Pagamento de ${nomeExibicao} registrado com sucesso!`);

      if (resultado._avisoRepasse) {
        setTimeout(() => showToast.warning(`⚠️ ${resultado._avisoRepasse}`), 600);
      }

      onSucesso();
      onClose();
    } catch (error) {
      showToast.error(traduzirErroRegistro(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal aberto={isOpen} fechar={onClose} title="Registrar Pagamento" size="md">
      <form onSubmit={handleSubmit} className="space-y-5 pt-2">
        {/* Bloco Aluno / Visitante */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <Label>{isVisitante ? 'Nome do Visitante' : 'Selecionar Aluno'}</Label>
            <button
              type="button"
              onClick={() => setIsVisitante(!isVisitante)}
              className="text-primary font-bold text-xs uppercase tracking-wider hover:underline flex items-center gap-1 transition-colors"
            >
              {isVisitante ? 'Buscar Cadastrado' : 'Registrar Visitante'}
            </button>
          </div>
          {isVisitante ? (
            <Input
              leftIcon={<User size={18} />}
              placeholder="Ex: João Silva"
              value={form.nome_visitante}
              onChange={e => setForm({ ...form, nome_visitante: e.target.value })}
              required
            />
          ) : (
            <Input
              as="select"
              leftIcon={<User size={18} />}
              value={form.aluno_id}
              onChange={e => {
                const selectedAluno = alunos.find(a => a.id === e.target.value);
                const defaultPlano = selectedAluno?.plano_id || '';
                const planoObj = planos.find(p => p.id === defaultPlano);
                setForm({
                  ...form,
                  aluno_id: e.target.value,
                  plano_id: defaultPlano,
                  valor_pago: planoObj ? planoObj.preco : form.valor_pago,
                });
              }}
              required
            >
              <option value="">Selecione um aluno...</option>
              {alunos.map(a => (
                <option key={a.id} value={a.id}>{a.nome_completo}</option>
              ))}
            </Input>
          )}
        </div>

        {/* Tipo de Recebimento */}
        <div>
          <Label className="block mb-1.5">Tipo de Recebimento</Label>
          <Input
            as="select"
            leftIcon={<LayoutList size={18} />}
            value={form.tipo_aula}
            onChange={e => setForm({ ...form, tipo_aula: e.target.value, pago_a_vista: false })}
          >
            <option value="regular">Mensalidade (Plano Regular)</option>
            <option value="avulsa">Aula Avulsa / Coreografia</option>
            <option value="evento">Evento / Festival</option>
            <option value="produto">Venda de Produto (Água, Camiseta, etc)</option>
          </Input>
        </div>

        {/* Campos Plano Regular */}
        {form.tipo_aula === 'regular' && (
          <div>
            <Label className="block mb-1.5">Plano Referente</Label>
            <Input
              as="select"
              leftIcon={<Package size={18} />}
              value={form.plano_id}
              onChange={e => {
                const p = planos.find(pl => pl.id === e.target.value);
                setForm({ ...form, plano_id: e.target.value, valor_pago: p ? p.preco : '', pago_a_vista: false });
              }}
              required
            >
              <option value="">Selecione o plano...</option>
              {planos.map(p => (
                <option key={p.id} value={p.id}>{p.nome} - R$ {p.preco}</option>
              ))}
            </Input>
          </div>
        )}

        {/* Pagamento à vista — só aparece para planos com duração > 1 mês.
            Sem isso marcado, uma mensalidade de plano trimestral/semestral/
            anual paga de uma vez some do Financeiro nos meses seguintes ao
            do lançamento, mesmo o aluno estando em dia (ver migration
            cobertura_pagamento_periodo, 2026-08-22). */}
        {planoMultiMes && (
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={form.pago_a_vista}
                onChange={e => setForm({ ...form, pago_a_vista: e.target.checked })}
              />
              <span className="text-sm">
                <span className="font-bold block">Pagamento à vista</span>
                <span className="text-muted-foreground text-xs">
                  Este valor cobre os {planoSelecionado.duracao_meses} meses do plano de uma vez.
                  O aluno ficará marcado como em dia até{' '}
                  {new Date(
                    financeiroService.calcularPeriodoFim(form.data_vencimento, true, planoSelecionado.duracao_meses) + 'T12:00:00'
                  ).toLocaleDateString('pt-BR')}
                  {' '}sem gerar cobrança nova nesse período.
                </span>
              </span>
            </label>
          </div>
        )}

        {/* Campos Aula Avulsa */}
        {form.tipo_aula === 'avulsa' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="block mb-1.5">Professor(a)</Label>
              <Input
                as="select"
                leftIcon={<GraduationCap size={18} />}
                value={form.professor_id}
                onChange={e => setForm({ ...form, professor_id: e.target.value })}
                required
              >
                <option value="">Selecione...</option>
                {professores.map(p => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </Input>
            </div>
            <div>
              <Label className="block mb-1.5">Modalidade</Label>
              <Input
                leftIcon={<BookOpen size={18} />}
                placeholder="Ex: Dança de Salão"
                value={form.modalidade_nome}
                onChange={e => setForm({ ...form, modalidade_nome: e.target.value })}
                required
              />
            </div>
          </div>
        )}

        {/* Valores e Datas */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label className="block mb-1.5">Valor Pago (R$)</Label>
            <Input
              type="number" step="0.01" min="0"
              leftIcon={<DollarSign size={18} />}
              placeholder="0.00"
              value={form.valor_pago}
              onChange={e => setForm({ ...form, valor_pago: e.target.value })}
              required
            />
          </div>

          <div>
  <Label className="block mb-1.5">Data do Pagamento</Label>
  <Input
    type="date"
    leftIcon={<Calendar size={18} />}
    value={form.data_pagamento}
    onChange={e => setForm({ ...form, data_pagamento: e.target.value })}
    required
  />
</div>
          <div>
            <Label className="block mb-1.5">Data do Vencimento</Label>
            <Input
              type="date"
              leftIcon={<Calendar size={18} />}
              value={form.data_vencimento}
              onChange={e => setForm({ ...form, data_vencimento: e.target.value })}
              required
            />
          </div>
        </div>

        <div>
          <Label className="block mb-1.5">Forma de Pagamento</Label>
          <Input
            as="select"
            leftIcon={<CreditCard size={18} />}
            value={form.forma_pagamento}
            onChange={e => setForm({ ...form, forma_pagamento: e.target.value })}
          >
            <option value="pix">Pix</option>
            <option value="credito">Cartão de Crédito</option>
            <option value="debito">Cartão de Débito</option>
            <option value="dinheiro">Dinheiro</option>
          </Input>
        </div>

        <div className="pt-4">
          <Button
            type="submit"
            variant="brand"
            size="lg"
            fullWidth
            loading={loading}
          >
            {loading ? (
              <><Loader2 className="animate-spin" size={20} /> Registrando...</>
            ) : (
              'Registrar Recebimento'
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}