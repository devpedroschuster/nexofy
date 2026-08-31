import React, { useEffect, useState, useCallback } from 'react';
import { planosService } from '../services/planosService';
import { useAuth } from '../hooks/useAuth';
import { useImpersonation } from '../context/ImpersonationContext';
import { Plus, Trash2, Package, RefreshCw, Calendar, Edit2, Clock } from 'lucide-react';
import { showToast } from '../components/shared/Toast';
import Modal, { useModal, ModalConfirmacao } from '../components/ui/Modal';
import Input, { Label } from '../components/ui/Input';
import Button from '../components/ui/Button';
import Surface from '../components/ui/Surface';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import { AREAS_MODALIDADE, LIMITE_ILIMITADO_SEMANA } from '../lib/constants';

const PLANO_VAZIO = {
  nome: '', preco: '', frequencia_semanal: '', duracao_meses: 1, regras_acesso: [],
  comissao_professor: '', comissao_espaco: '', comissao_diretor: '',
  is_plano_livre: false,
};

export default function Planos() {
  // CR1 FIX: em modo impersonation, useAuth().estudioId é null — o estúdio
  // "ativo" para o super_admin vem do ImpersonationContext (mesmo padrão
  // usado em ConfiguracoesEstudio.jsx / ConfiguracoesFeriados.jsx).
  const { estudioId, perfil } = useAuth();
  const { estudioAtivo } = useImpersonation();
  const idEfetivo = estudioAtivo?.id ?? estudioId;

  // CR3 FIX: esconde ações de escrita para roles sem permissão (ex: professor).
  const podeGerenciar = perfil === 'admin' || perfil === 'super_admin';

  const [planos, setPlanos] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [novoPlano, setNovoPlano] = useState(PLANO_VAZIO);

  const modalEdicao = useModal();
  const [savingEdit, setSavingEdit] = useState(false);
  const [planoEmEdicao, setPlanoEmEdicao] = useState(null);

  const modalExcluir = useModal();
  const [planoParaExcluir, setPlanoParaExcluir] = useState(null);

  // CR1/PERF FIX: refetch é disparado sempre que o estúdio efetivo muda
  // (inclui troca de estúdio impersonado por um super_admin).
  const fetchPlanos = useCallback(async () => {
    if (!idEfetivo) {
      setPlanos([]);
      setLoadingList(false);
      return;
    }
    setLoadingList(true);
    try {
      const data = await planosService.listar(idEfetivo);
      setPlanos(data || []);
    } catch (err) {
      console.error('[Planos] erro ao listar planos:', err);
      showToast.error('Erro ao carregar planos.');
    } finally {
      setLoadingList(false);
    }
  }, [idEfetivo]);

  useEffect(() => { fetchPlanos(); }, [fetchPlanos]);

  function validarPlano(plano) {
    const nome = plano.nome?.trim();
    if (!nome) {
      showToast.error('Informe um nome válido para o plano.');
      return false;
    }
    const preco = Number(plano.preco);
    if (!Number.isFinite(preco) || preco <= 0) {
      showToast.error('O preço deve ser um valor maior que zero.');
      return false;
    }
    const duracao = Number(plano.duracao_meses);
    if (!Number.isInteger(duracao) || duracao < 1 || duracao > 24) {
      showToast.error('A duração deve ser um número inteiro entre 1 e 24 meses.');
      return false;
    }

    // Espelha a constraint check_soma_comissoes do banco — dá feedback
    // imediato no form em vez de deixar o erro estourar só no save.
    const comProf = Number(plano.comissao_professor) || 0;
    const comEsp = Number(plano.comissao_espaco) || 0;
    const comDir = Number(plano.comissao_diretor) || 0;
    const somaComissoes = comProf + comEsp + comDir;
    if (somaComissoes !== 100 && somaComissoes !== 0) {
      showToast.error('A soma das comissões (professor + espaço + direção) deve ser 100% ou ficar zerada.');
      return false;
    }

    return true;
  }

  async function handleCriarPlano(e) {
    e.preventDefault();
    if (creating || !idEfetivo) return;
    if (!validarPlano(novoPlano)) return;

    setCreating(true);
    try {
      const [planoCriado] = await planosService.salvar(
        { ...novoPlano, nome: novoPlano.nome.trim() },
        idEfetivo
      );
      showToast.success('Plano criado com sucesso!');
      setNovoPlano(PLANO_VAZIO);
      // PERF FIX: evita um round-trip extra — a resposta do INSERT já traz a linha.
      if (planoCriado) {
        setPlanos(prev => [...prev, planoCriado]);
      } else {
        fetchPlanos();
      }
    } catch (err) {
      console.error('[Planos] erro ao criar plano:', err);
      if (err?.code === '23505') {
        showToast.error('Já existe um plano com esse nome.');
      } else {
        showToast.error(err?.message || 'Erro ao criar plano.');
      }
    } finally {
      setCreating(false);
    }
  }

  async function excluirPlano() {
    if (!planoParaExcluir || !idEfetivo) return;
    const id = planoParaExcluir.id;
    setDeletingId(id);
    modalExcluir.fechar();
    try {
      await planosService.excluir(id, idEfetivo);
      showToast.success('Plano removido.');
      setPlanos(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error('[Planos] erro ao excluir plano:', err);
      if (err?.code === '23503') {
        showToast.error('Não é possível excluir: há alunos vinculados a este plano.');
      } else {
        showToast.error('Erro ao excluir plano.');
      }
    } finally {
      setDeletingId(null);
      setPlanoParaExcluir(null);
    }
  }

  function abrirEdicao(plano) {
    setPlanoEmEdicao({
      ...plano,
      duracao_meses: plano.duracao_meses || 1,
      regras_acesso: plano.regras_acesso || [],
      // Fallback pros planos criados antes desta mudança (campos NULL no banco).
      comissao_professor: plano.comissao_professor ?? '',
      comissao_espaco: plano.comissao_espaco ?? '',
      comissao_diretor: plano.comissao_diretor ?? '',
      is_plano_livre: !!plano.is_plano_livre,
    });
    modalEdicao.abrir();
  }

  async function handleSalvarEdicao(e) {
    e.preventDefault();
    if (savingEdit || !idEfetivo || !planoEmEdicao) return;
    if (!validarPlano(planoEmEdicao)) return;

    setSavingEdit(true);
    try {
      const [planoAtualizado] = await planosService.salvar(
        { ...planoEmEdicao, nome: planoEmEdicao.nome.trim() },
        idEfetivo
      );
      showToast.success('Plano atualizado com sucesso!');
      modalEdicao.fechar();
      if (planoAtualizado) {
        setPlanos(prev => prev.map(p => (p.id === planoAtualizado.id ? planoAtualizado : p)));
      } else {
        fetchPlanos();
      }
    } catch (err) {
      console.error('[Planos] erro ao atualizar plano:', err);
      if (err?.code === '23505') {
        showToast.error('Já existe um plano com esse nome.');
      } else {
        showToast.error(err?.message || 'Erro ao atualizar plano.');
      }
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="p-4 md:p-8 space-y-8 animate-in fade-in max-w-full">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-3xl font-black text-foreground tracking-tight">Planos e Mensalidades</h1>
        <p className="text-muted-foreground">Cadastre e edite os pacotes comerciais vendidos no estúdio.</p>
      </div>

      {/* Formulário de criação — apenas para quem pode gerenciar */}
      {podeGerenciar && (
        <Surface variant="card" padding="lg" className="w-full">
          <h3 className="font-bold text-foreground mb-6 flex items-center gap-2">
            <Package size={20} className="text-primary" /> Criar Novo Plano
          </h3>

          <form onSubmit={handleCriarPlano} className="space-y-4 w-full">
            <div className="flex flex-col md:flex-row gap-4 items-end w-full">
              {/* Nome */}
              <div className="flex-1 w-full space-y-1.5">
                <Label>Nome do Plano</Label>
                <Input
                  required
                  placeholder="Ex: Livre Dança"
                  value={novoPlano.nome}
                  onChange={e => setNovoPlano({ ...novoPlano, nome: e.target.value })}
                />
              </div>

              {/* Preço */}
              <div className="w-full md:w-32 space-y-1.5">
                <Label>Preço (R$)</Label>
                <Input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={novoPlano.preco}
                  onChange={e => setNovoPlano({ ...novoPlano, preco: e.target.value })}
                />
              </div>

              {/* Frequência */}
              <div className="w-full md:w-36 space-y-1.5">
                <Label>Freq. Visível</Label>
                <Input
                  required
                  placeholder="Ex: Livre"
                  value={novoPlano.frequencia_semanal}
                  onChange={e => setNovoPlano({ ...novoPlano, frequencia_semanal: e.target.value })}
                />
              </div>

              {/* Duração */}
              <div className="w-full md:w-32 space-y-1.5">
                <Label>Duração (Meses)</Label>
                <Input
                  required
                  type="number"
                  min="1"
                  max="24"
                  className="font-black text-info"
                  value={novoPlano.duracao_meses}
                  onChange={e => setNovoPlano({ ...novoPlano, duracao_meses: e.target.value })}
                />
              </div>

              <Button
                type="submit"
                variant="brand"
                size="lg"
                loading={creating}
                disabled={!idEfetivo}
                leftIcon={!creating ? <Plus size={20} /> : undefined}
                className="w-full md:w-auto mt-4 md:mt-0"
              >
                {creating ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>

            {/* Rateio de Comissão + Plano Livre — campos existentes no banco
                (validados pela constraint check_soma_comissoes), agora editáveis
                aqui na criação do plano. */}
            <div className="border-t border-border pt-6 mt-2 space-y-4 w-full">
              <Label hint="Soma deve ser 100% ou ficar zerada (0%)">Rateio de Comissão (%)</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Professor</label>
                  <Input
                    type="number" min="0" max="100"
                    value={novoPlano.comissao_professor}
                    onChange={e => setNovoPlano({ ...novoPlano, comissao_professor: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Espaço</label>
                  <Input
                    type="number" min="0" max="100"
                    value={novoPlano.comissao_espaco}
                    onChange={e => setNovoPlano({ ...novoPlano, comissao_espaco: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Direção</label>
                  <Input
                    type="number" min="0" max="100"
                    value={novoPlano.comissao_diretor}
                    onChange={e => setNovoPlano({ ...novoPlano, comissao_diretor: e.target.value })}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={novoPlano.is_plano_livre}
                  onChange={e => setNovoPlano({ ...novoPlano, is_plano_livre: e.target.checked })}
                  className="rounded border-border"
                />
                Plano Livre (acesso ilimitado, sem vínculo de regras por área)
              </label>
            </div>

            <SeletorRegras
              regras={novoPlano.regras_acesso}
              setRegras={(novasRegras) => setNovoPlano({ ...novoPlano, regras_acesso: novasRegras })}
            />
          </form>
        </Surface>
      )}

      {/* Grade de planos */}
      {loadingList ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton.Card key={i} className="h-24" />)}
        </div>
      ) : planos.length === 0 ? (
        <EmptyState
          icon={<Package size={24} />}
          title="Nenhum plano cadastrado"
          description={podeGerenciar
            ? 'Crie o primeiro pacote comercial do estúdio usando o formulário acima.'
            : 'Ainda não há planos cadastrados para este estúdio.'}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {planos.map(plano => (
            <Surface
              key={plano.id}
              variant="card"
              padding="md"
              className="flex justify-between items-center hover:shadow-md hover:-translate-y-0.5 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="bg-primary-soft p-4 rounded-2xl text-primary shrink-0">
                  <Package size={24} />
                </div>
                <div>
                  <h3 className="font-black text-lg text-foreground leading-tight">{plano.nome}</h3>
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted-foreground mt-1">
                    <span className="text-success font-black">R$ {plano.preco}</span>
                    <span className="w-1 h-1 bg-border rounded-full" />
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      {plano.frequencia_semanal === LIMITE_ILIMITADO_SEMANA ? 'Ilimitado' : plano.frequencia_semanal}
                    </span>
                    <span className="w-1 h-1 bg-border rounded-full" />
                    <span className="flex items-center gap-1 text-info font-bold">
                      <Clock size={12} /> {plano.duracao_meses} {plano.duracao_meses > 1 ? 'Meses' : 'Mês'}
                    </span>
                    {plano.is_plano_livre && (
                      <>
                        <span className="w-1 h-1 bg-border rounded-full" />
                        <Badge tone="primary" variant="soft">Plano Livre</Badge>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {podeGerenciar && (
                <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => abrirEdicao(plano)}
                    className="p-3 text-muted-foreground hover:text-info hover:bg-info-soft rounded-xl transition-all"
                    title="Editar Plano"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => { setPlanoParaExcluir(plano); modalExcluir.abrir(); }}
                    disabled={deletingId === plano.id}
                    className="p-3 text-muted-foreground hover:text-destructive hover:bg-destructive-soft rounded-xl transition-all"
                    title="Excluir Plano"
                  >
                    {deletingId === plano.id
                      ? <RefreshCw className="animate-spin text-destructive" size={18} />
                      : <Trash2 size={18} />}
                  </button>
                </div>
              )}
            </Surface>
          ))}
        </div>
      )}

      <Modal
        aberto={modalEdicao.aberto}
        fechar={modalEdicao.fechar}
        title="Editar Pacote / Plano"
        size="md"
      >
        {planoEmEdicao && (
          <form onSubmit={handleSalvarEdicao} className="space-y-6 pt-2">
            <div className="space-y-1.5">
              <Label>Nome Comercial do Plano</Label>
              <Input
                required
                value={planoEmEdicao.nome}
                onChange={e => setPlanoEmEdicao({ ...planoEmEdicao, nome: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Preço de Venda</Label>
                <Input
                  required
                  type="number"
                  step="0.01"
                  min="0.01"
                  className="font-bold text-success"
                  value={planoEmEdicao.preco}
                  onChange={e => setPlanoEmEdicao({ ...planoEmEdicao, preco: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Frequência</Label>
                <Input
                  required
                  value={planoEmEdicao.frequencia_semanal}
                  onChange={e => setPlanoEmEdicao({ ...planoEmEdicao, frequencia_semanal: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Duração (Meses)</Label>
                <Input
                  required
                  type="number"
                  min="1"
                  max="24"
                  className="font-black text-info"
                  value={planoEmEdicao.duracao_meses}
                  onChange={e => setPlanoEmEdicao({ ...planoEmEdicao, duracao_meses: e.target.value })}
                />
              </div>
            </div>

            {/* Rateio de Comissão + Plano Livre — vinculado a planoEmEdicao,
                não a novoPlano (bug de integração corrigido nesta versão). */}
            <div className="border-t border-border pt-6 space-y-4 w-full">
              <Label hint="Soma deve ser 100% ou ficar zerada (0%)">Rateio de Comissão (%)</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Professor</label>
                  <Input
                    type="number" min="0" max="100"
                    value={planoEmEdicao.comissao_professor}
                    onChange={e => setPlanoEmEdicao({ ...planoEmEdicao, comissao_professor: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Espaço</label>
                  <Input
                    type="number" min="0" max="100"
                    value={planoEmEdicao.comissao_espaco}
                    onChange={e => setPlanoEmEdicao({ ...planoEmEdicao, comissao_espaco: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Direção</label>
                  <Input
                    type="number" min="0" max="100"
                    value={planoEmEdicao.comissao_diretor}
                    onChange={e => setPlanoEmEdicao({ ...planoEmEdicao, comissao_diretor: e.target.value })}
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={planoEmEdicao.is_plano_livre}
                  onChange={e => setPlanoEmEdicao({ ...planoEmEdicao, is_plano_livre: e.target.checked })}
                  className="rounded border-border"
                />
                Plano Livre (acesso ilimitado, sem vínculo de regras por área)
              </label>
            </div>

            <SeletorRegras
              regras={planoEmEdicao.regras_acesso}
              setRegras={(novasRegras) => setPlanoEmEdicao({ ...planoEmEdicao, regras_acesso: novasRegras })}
            />

            <Modal.Footer>
              <Button variant="ghost" type="button" onClick={modalEdicao.fechar}>
                Cancelar
              </Button>
              <Button variant="brand" type="submit" loading={savingEdit}>
                {savingEdit ? 'Salvando...' : 'Atualizar Plano'}
              </Button>
            </Modal.Footer>
          </form>
        )}
      </Modal>

      <ModalConfirmacao
        isOpen={modalExcluir.aberto}
        onClose={modalExcluir.fechar}
        onConfirm={excluirPlano}
        titulo="Remover Pacote / Plano?"
        mensagem={`Tem certeza que deseja excluir o plano "${planoParaExcluir?.nome}" permanentemente?`}
        tipo="danger"
      />
    </div>
  );
}

function SeletorRegras({ regras, setRegras }) {
  const [mod, setMod] = useState(AREAS_MODALIDADE[0].valor);
  const [qty, setQty] = useState('1');

  const adicionarRegra = () => {
    if (regras.some(r => r.modalidade === mod)) {
      showToast.error(`A regra para ${mod} já existe neste plano.`);
      return;
    }
    const limite = Number(qty);
    if (!Number.isFinite(limite) || limite <= 0) {
      showToast.error('Selecione um limite válido para a regra.');
      return;
    }
    setRegras([...regras, { modalidade: mod, limite }]);
  };

  const removerRegra = (index) => {
    const novas = [...regras];
    novas.splice(index, 1);
    setRegras(novas);
  };

  // Áreas que já têm regra cadastrada — evita oferecer opção redundante no select.
  const areasDisponiveis = AREAS_MODALIDADE.filter(
    a => !regras.some(r => r.modalidade === a.valor)
  );

  return (
    <div className="space-y-4 border-t border-border pt-6 mt-6 w-full">
      <Label>Regras de Acesso do Pacote</Label>

      {regras.map((regra, index) => (
        <div
          key={index}
          className="flex gap-2 items-center bg-muted p-3 rounded-2xl animate-in slide-in-from-left-2 border border-border"
        >
          <div className="flex-1 font-bold text-foreground text-sm">Área: {regra.modalidade}</div>
          <div className="font-black text-info bg-card px-3 py-1 rounded-lg border border-border">
            {regra.limite === LIMITE_ILIMITADO_SEMANA ? 'Ilimitado (Livre)' : `${regra.limite}x na semana`}
          </div>
          <button
            type="button"
            onClick={() => removerRegra(index)}
            className="p-2 text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}

      {areasDisponiveis.length > 0 && (
        <div className="grid grid-cols-5 gap-2 items-end bg-info-soft p-4 rounded-3xl border border-dashed border-info/20">
          <div className="col-span-2 space-y-1.5">
            <label className="text-[9px] font-black text-info uppercase ml-2 block">Categoria</label>
            <Input
              as="select"
              value={mod}
              onChange={e => setMod(e.target.value)}
            >
              {areasDisponiveis.map(a => (
                <option key={a.valor} value={a.valor}>{a.label}</option>
              ))}
            </Input>
          </div>
          <div className="col-span-2 space-y-1.5">
            <label className="text-[9px] font-black text-info uppercase ml-2 block">Limite na Semana</label>
            <Input
              as="select"
              className="font-black text-info"
              value={qty}
              onChange={e => setQty(e.target.value)}
            >
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="3">3x</option>
              <option value="4">4x</option>
              <option value="5">5x</option>
              <option value="6">6x</option>
              <option value={String(LIMITE_ILIMITADO_SEMANA)}>Ilimitado (Livre)</option>
            </Input>
          </div>
          <Button
            type="button"
            variant="info"
            size="icon"
            onClick={adicionarRegra}
          >
            <Plus size={20} />
          </Button>
        </div>
      )}
    </div>
  );
}