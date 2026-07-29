// webapp/src/pages/ConfiguracoesEspacos.jsx
import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, Edit2, Trash2, RefreshCw, Users } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useImpersonation } from '../context/ImpersonationContext';
import { useEspacos } from '../pages/Agenda/hooks/useEspacos';
import { espacosService } from '../services/espacosService';
import { showToast } from '../components/shared/Toast';
import { ICONES_ESPACO, IconeEspaco } from '../lib/iconesEspaco.jsx';
import { PALETA_CORES } from '../lib/constants';
import Input, { Label } from '../components/ui/Input';
import Button from '../components/ui/Button';
import Surface from '../components/ui/Surface';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';

const ESPACO_VAZIO = { nome: '', capacidade: '', cor: 'primary', icone: 'MapPin' };
const NOMES_ICONES = Object.keys(ICONES_ESPACO);

export default function ConfiguracoesEspacos() {
  const queryClient = useQueryClient();
  const { estudioId, perfil } = useAuth();
  // Mesmo padrão de ConfiguracoesEstudio.jsx: em impersonation, o estúdio
  // "ativo" vem do ImpersonationContext, não de useAuth().
  const { estudioAtivo } = useImpersonation();
  const idEfetivo = estudioAtivo?.id ?? estudioId;
  const podeEditar = perfil === 'admin' || perfil === 'super_admin';

  const {
    data: espacos = [],
    isLoading,
    isError,
  } = useEspacos(idEfetivo, { incluirInativos: true });

  const [novoEspaco, setNovoEspaco] = useState(ESPACO_VAZIO);
  const [criando, setCriando] = useState(false);

  const [modalAberto, setModalAberto] = useState(false);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [espacoEmEdicao, setEspacoEmEdicao] = useState(null);

  const [alternandoId, setAlternandoId] = useState(null);

  const espacosAtivos = espacos.filter(e => e.ativo);
  const espacosInativos = espacos.filter(e => !e.ativo);

  function invalidarEspacos() {
    return queryClient.invalidateQueries({ queryKey: ['espacos', idEfetivo] });
  }

  async function handleCriar(e) {
    e.preventDefault();
    if (!idEfetivo) {
      showToast.error('Não foi possível identificar o estúdio. Recarregue a página.');
      return;
    }
    if (!novoEspaco.nome.trim()) return;

    setCriando(true);
    try {
      await espacosService.criar(idEfetivo, novoEspaco);
      showToast.success('Espaço criado com sucesso!');
      setNovoEspaco(ESPACO_VAZIO);
      await invalidarEspacos();
    } catch (err) {
      console.error('[ConfiguracoesEspacos] Erro ao criar:', err);
      showToast.error(
        err?.code === '23505'
          ? 'Já existe um espaço com esse nome.'
          : 'Erro ao criar espaço. Tente novamente.'
      );
    } finally {
      setCriando(false);
    }
  }

  function abrirEdicao(espaco) {
    setEspacoEmEdicao({
      id: espaco.id,
      nome: espaco.nome,
      capacidade: espaco.capacidade ?? '',
      cor: espaco.cor ?? 'primary',
      icone: espaco.icone ?? 'MapPin',
    });
    setModalAberto(true);
  }

  async function handleSalvarEdicao(e) {
    e.preventDefault();
    if (!espacoEmEdicao?.nome.trim()) return;

    setSalvandoEdicao(true);
    try {
      await espacosService.atualizar(espacoEmEdicao.id, idEfetivo, espacoEmEdicao);
      showToast.success('Espaço atualizado com sucesso!');
      setModalAberto(false);
      await invalidarEspacos();
    } catch (err) {
      console.error('[ConfiguracoesEspacos] Erro ao atualizar:', err);
      showToast.error('Erro ao atualizar espaço.');
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function handleAlternarAtivo(espaco) {
    setAlternandoId(espaco.id);
    try {
      if (espaco.ativo) {
        await espacosService.desativar(espaco.id, idEfetivo);
        showToast.success('Espaço desativado. Ele não aparecerá mais na Agenda.');
      } else {
        await espacosService.reativar(espaco.id, idEfetivo);
        showToast.success('Espaço reativado.');
      }
      await invalidarEspacos();
    } catch (err) {
      console.error('[ConfiguracoesEspacos] Erro ao alternar status:', err);
      showToast.error('Erro ao atualizar o espaço.');
    } finally {
      setAlternandoId(null);
    }
  }

  function CardEspaco({ espaco }) {
    const cor = PALETA_CORES.find(c => c.id === espaco.cor) || PALETA_CORES[0];
    return (
      <Surface
        variant="card"
        padding="lg"
        className={`flex items-center justify-between gap-4 ${!espaco.ativo ? 'opacity-60' : ''}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${cor.bg} ${cor.text}`}>
            <IconeEspaco nome={espaco.icone} size={20} />
          </div>
          <div className="min-w-0">
            <p className="font-black text-foreground truncate">{espaco.nome}</p>
            <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              {espaco.capacidade ? (
                <>
                  <Users size={12} /> Capacidade: {espaco.capacidade}
                </>
              ) : (
                'Sem limite de capacidade definido'
              )}
              {!espaco.ativo && ' · Inativo'}
            </p>
          </div>
        </div>

        {podeEditar && (
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => abrirEdicao(espaco)}>
              <Edit2 size={14} />
            </Button>
            <Button
              variant={espaco.ativo ? 'outline' : 'brand'}
              size="sm"
              loading={alternandoId === espaco.id}
              onClick={() => handleAlternarAtivo(espaco)}
            >
              {espaco.ativo ? <Trash2 size={14} /> : <RefreshCw size={14} />}
            </Button>
          </div>
        )}
      </Surface>
    );
  }

  return (
    <div className="p-8 space-y-8 animate-in fade-in">
      <div>
        <h1 className="text-3xl font-black text-foreground">Espaços</h1>
        <p className="text-muted-foreground">
          Cadastre as salas/áreas do estúdio para poder selecioná-las ao criar uma aula na Agenda.
        </p>
      </div>

      {podeEditar && (
        <Surface variant="card" padding="lg" className="space-y-6">
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Plus size={20} /> Novo Espaço
          </h3>

          <form onSubmit={handleCriar} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-2">
              <Label htmlFor="nome-espaco" required>Nome do Espaço</Label>
              <Input
                id="nome-espaco"
                required
                placeholder="Ex: Espaço Movimento"
                value={novoEspaco.nome}
                onChange={e => setNovoEspaco({ ...novoEspaco, nome: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="capacidade-espaco">Capacidade (opcional)</Label>
              <Input
                id="capacidade-espaco"
                type="number"
                min="1"
                placeholder="Ex: 20"
                value={novoEspaco.capacidade}
                onChange={e => setNovoEspaco({ ...novoEspaco, capacidade: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="icone-espaco">Ícone</Label>
              <Input
                as="select"
                id="icone-espaco"
                value={novoEspaco.icone}
                onChange={e => setNovoEspaco({ ...novoEspaco, icone: e.target.value })}
              >
                {NOMES_ICONES.map(nome => (
                  <option key={nome} value={nome}>{nome}</option>
                ))}
              </Input>
            </div>

            <div className="md:col-span-3">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {PALETA_CORES.map(cor => (
                  <button
                    key={cor.id}
                    type="button"
                    onClick={() => setNovoEspaco({ ...novoEspaco, cor: cor.id })}
                    className={`h-9 w-9 rounded-full border-2 ${cor.bg} ${
                      novoEspaco.cor === cor.id ? 'border-foreground' : 'border-transparent'
                    }`}
                    title={cor.id}
                  />
                ))}
              </div>
            </div>

            <div>
              <Button type="submit" variant="brand" className="w-full font-black" disabled={criando || !novoEspaco.nome.trim()}>
                {criando ? <RefreshCw className="animate-spin" size={18} /> : <Plus size={18} />}
                Adicionar
              </Button>
            </div>
          </form>
        </Surface>
      )}

      {isLoading && (
        <p className="text-muted-foreground font-medium">Carregando espaços...</p>
      )}

      {isError && (
        <p className="text-destructive font-medium">Erro ao carregar espaços. Tente recarregar a página.</p>
      )}

      {!isLoading && !isError && espacos.length === 0 && (
        <EmptyState
          icon={<MapPin size={32} />}
          title="Nenhum espaço cadastrado"
          description="Cadastre o primeiro espaço acima para poder usá-lo ao criar aulas na Agenda."
        />
      )}

      {espacosAtivos.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-black text-muted-foreground uppercase">Ativos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {espacosAtivos.map(espaco => <CardEspaco key={espaco.id} espaco={espaco} />)}
          </div>
        </div>
      )}

      {espacosInativos.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-black text-muted-foreground uppercase">Inativos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {espacosInativos.map(espaco => <CardEspaco key={espaco.id} espaco={espaco} />)}
          </div>
        </div>
      )}

      <Modal aberto={modalAberto} fechar={() => setModalAberto(false)} title="Editar Espaço" size="md">
        {espacoEmEdicao && (
          <form onSubmit={handleSalvarEdicao} className="p-6 space-y-4">
            <div>
              <Label htmlFor="nome-edicao" required>Nome</Label>
              <Input
                id="nome-edicao"
                required
                value={espacoEmEdicao.nome}
                onChange={e => setEspacoEmEdicao({ ...espacoEmEdicao, nome: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="capacidade-edicao">Capacidade</Label>
              <Input
                id="capacidade-edicao"
                type="number"
                min="1"
                value={espacoEmEdicao.capacidade}
                onChange={e => setEspacoEmEdicao({ ...espacoEmEdicao, capacidade: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="icone-edicao">Ícone</Label>
              <Input
                as="select"
                id="icone-edicao"
                value={espacoEmEdicao.icone}
                onChange={e => setEspacoEmEdicao({ ...espacoEmEdicao, icone: e.target.value })}
              >
                {NOMES_ICONES.map(nome => (
                  <option key={nome} value={nome}>{nome}</option>
                ))}
              </Input>
            </div>

            <div>
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {PALETA_CORES.map(cor => (
                  <button
                    key={cor.id}
                    type="button"
                    onClick={() => setEspacoEmEdicao({ ...espacoEmEdicao, cor: cor.id })}
                    className={`h-9 w-9 rounded-full border-2 ${cor.bg} ${
                      espacoEmEdicao.cor === cor.id ? 'border-foreground' : 'border-transparent'
                    }`}
                    title={cor.id}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
              <Button type="submit" variant="brand" loading={salvandoEdicao} disabled={!espacoEmEdicao.nome.trim()}>
                Salvar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}