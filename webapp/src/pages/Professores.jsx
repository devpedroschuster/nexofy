import React, { useState, useEffect } from 'react';
import { Search, UserPlus, Edit2, ShieldAlert, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';

import { professoresService } from '../services/professoresService';
import { useDebounce } from '../hooks/useDebounce';
import { useAuth } from '../hooks/useAuth';
import { useImpersonation } from '../context/ImpersonationContext';

import { showToast } from '../components/shared/Toast';

import Modal, { useModal } from '../components/ui/Modal';
import Button from '../components/ui/Button';
import Input, { Label } from '../components/ui/Input';
import Badge from '../components/ui/Badge';
import Surface from '../components/ui/Surface';
import Skeleton from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';

const FORM_VAZIO = { id: null, nome: '', email: '', telefone: '', pix_comissao: '', auth_id: null };

export default function Professores() {
  // CR2 FIX: fallback de impersonation, mesmo padrão usado em
  // ConfiguracoesFeriados.jsx / ConfiguracoesEstudio.jsx. Sem isso,
  // super_admin em impersonation caía no bug de professoresService listando/
  // alterando professores de todos os estúdios (filtro condicional).
  const { estudioId, perfil } = useAuth();
  const { estudioAtivo } = useImpersonation();
  const idEfetivo = estudioAtivo?.id ?? estudioId;

  const podeGerenciar = perfil === 'admin' || perfil === 'super_admin';

  const [professores, setProfessores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');

  const [formProfessor, setFormProfessor] = useState(FORM_VAZIO);
  // Guarda o estado original ao abrir edição para detectar mudanças de acesso
  const [acessoOriginal, setAcessoOriginal] = useState({ email: '', auth_id: null });
  const [profSelecionado, setProfSelecionado] = useState(null);
  const [saving, setSaving] = useState(false);

  const buscaDebounced = useDebounce(busca, 400);
  const modalForm = useModal();
  const modalStatus = useModal();

  useEffect(() => {
    carregarProfessores();
  }, [buscaDebounced, idEfetivo]);

  async function carregarProfessores() {
    if (!idEfetivo) {
      setProfessores([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await professoresService.listar(buscaDebounced, idEfetivo);
      setProfessores(data);
    } catch (err) {
      console.error('[Professores] erro ao carregar lista:', err);
      showToast.error('Erro ao carregar lista.');
    } finally {
      setLoading(false);
    }
  }

  function abrirModalCriar() {
    setFormProfessor(FORM_VAZIO);
    setAcessoOriginal({ email: '', auth_id: null });
    modalForm.abrir();
  }

  function abrirModalEditar(prof) {
    setFormProfessor({
      id: prof.id,
      nome: prof.nome,
      email: prof.email || '',
      telefone: prof.telefone || '',
      pix_comissao: prof.pix_comissao || '',
      auth_id: prof.auth_id || null,
    });
    setAcessoOriginal({ email: prof.email || '', auth_id: prof.auth_id || null });
    modalForm.abrir();
  }

  async function handleSalvar(e) {
    e.preventDefault();
    if (saving || !idEfetivo) return;
    setSaving(true);

    try {
      const emailNovo = formProfessor.email.trim().toLowerCase();
      const emailAntigo = acessoOriginal.email.trim().toLowerCase();
      const authIdAtual = acessoOriginal.auth_id;

      const tinhaAcesso = !!authIdAtual;
      const temEmailNovo = !!emailNovo;
      const emailMudou = emailNovo !== emailAntigo;

      // CR1 FIX: salva SEMPRE os dados básicos primeiro (nome/telefone/pix),
      // preservando email/auth_id atuais. Isso garante um `id` real de
      // professor antes de chamar a Edge Function — que exige `professor_id`
      // em toda ação (`criar`, `remover`, `trocar_email`). Antes, o cadastro
      // de um professor novo com e-mail chamava a função com
      // `professor_id: null`, o que a função sempre rejeitava com
      // "email e professor_id são obrigatórios".
      const dadosBase = {
        id: formProfessor.id,
        nome: formProfessor.nome,
        telefone: formProfessor.telefone,
        pix_comissao: formProfessor.pix_comissao,
        email: formProfessor.id ? (acessoOriginal.email || null) : null,
        auth_id: formProfessor.id ? authIdAtual : null,
      };
      const professorSalvo = await professoresService.salvar(dadosBase, idEfetivo);
      const professorId = professorSalvo.id;

      let toastMsg = 'Professor salvo com sucesso!';

      if (temEmailNovo && (!tinhaAcesso || emailMudou)) {
        // Criar acesso (professor novo, ou existente sem acesso ainda)
        // OU trocar e-mail de um acesso já existente.
        const acao = tinhaAcesso && emailMudou ? 'trocar_email' : 'criar';

        const { data: funcData, error: funcError } = await supabase.functions.invoke(
          'gerenciar-acesso-professor',
          {
            body: {
              acao,
              professor_id: professorId,
              auth_id: authIdAtual,
              email: emailNovo,
              nome: formProfessor.nome,
              estudio_id: idEfetivo,
            },
          },
        );
        if (funcError) throw new Error('Falha na comunicação com o servidor seguro.');
        if (funcData?.error) throw new Error(funcData.error);

        toastMsg = acao === 'criar'
          ? (funcData.reutilizado
              ? 'Professor vinculado ao acesso existente!'
              : 'Professor cadastrado e acesso criado!')
          : (funcData.reutilizado
              ? 'E-mail atualizado e vinculado a um acesso existente!'
              : funcData.auth_antigo_deletado
                ? 'E-mail atualizado e novo acesso criado!'
                : 'E-mail atualizado e novo acesso criado. O acesso antigo continua ativo (pertence a outro vínculo) e pode ser removido depois, se necessário.');

      } else if (!temEmailNovo && tinhaAcesso) {
        // Removeu o e-mail: exclui o acesso.
        const { data: funcData, error: funcError } = await supabase.functions.invoke(
          'gerenciar-acesso-professor',
          { body: { acao: 'remover', professor_id: professorId, auth_id: authIdAtual, estudio_id: idEfetivo } },
        );
        if (funcError) throw new Error('Falha na comunicação com o servidor seguro.');
        if (funcData?.error) throw new Error(funcData.error);

        toastMsg = funcData.user_deletado
          ? 'E-mail removido e acesso excluído.'
          : 'E-mail removido. Acesso mantido pois pertence a um aluno.';
      }
      // else: sem mudança de acesso — os dados básicos já foram salvos acima.

      showToast.success(toastMsg);
      modalForm.fechar();
      carregarProfessores();
    } catch (error) {
      console.error('[Professores] erro ao salvar:', error);
      showToast.error(error.message || 'Erro ao salvar dados.');
    } finally {
      setSaving(false);
    }
  }

  async function alternarStatus() {
    if (!profSelecionado || !idEfetivo) return;
    try {
      await professoresService.alternarStatus(profSelecionado.id, !profSelecionado.ativo, idEfetivo);
      showToast.success(profSelecionado.ativo ? 'Professor desativado.' : 'Professor reativado!');
      modalStatus.fechar();
      carregarProfessores();
    } catch (err) {
      console.error('[Professores] erro ao alterar status:', err);
      showToast.error('Erro ao alterar status.');
    }
  }

  function TabelaSkeleton() {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton.Row key={i} className="px-8 py-5" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-foreground">Equipe de Professores</h1>
          <p className="text-muted-foreground">Gerencie os profissionais e seus acessos ao sistema.</p>
        </div>
        {podeGerenciar && (
          <Button variant="brand" size="lg" leftIcon={<UserPlus size={20} />} onClick={abrirModalCriar}>
            Novo Professor
          </Button>
        )}
      </div>

      {/* Barra de busca */}
      <Surface variant="card" padding="md">
        <Input
          leftIcon={<Search size={18} />}
          placeholder="Pesquisar por nome do professor..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </Surface>

      {/* Tabela */}
      <Surface variant="card" padding="none" className="overflow-hidden">
        {loading ? (
          <TabelaSkeleton />
        ) : professores.length > 0 ? (
          <table className="w-full text-left">
            <thead className="border-b border-border">
              <tr className="bg-muted">
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Professor</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Contato</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Chave PIX</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</th>
                {podeGerenciar && (
                  <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Ações</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {professores.map((prof) => (
                <tr key={prof.id} className="group hover:bg-muted/40 transition-colors">

                  {/* Professor */}
                  <td className="px-8 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-primary-soft rounded-full flex items-center justify-center font-black text-primary">
                        {prof.nome?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="font-bold text-foreground">{prof.nome}</p>
                        {prof.auth_id && (
                          <Badge tone="info" variant="soft" className="mt-1">
                            Com Acesso
                          </Badge>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Contato */}
                  <td className="px-8 py-5">
                    <span className="text-xs font-bold text-foreground block">
                      {prof.telefone || 'Sem telefone'}
                    </span>
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {prof.email || 'Sem e-mail'}
                    </span>
                  </td>

                  {/* PIX */}
                  <td className="px-8 py-5">
                    <span className="text-xs font-black text-foreground bg-muted px-3 py-1.5 rounded-lg border border-border">
                      {prof.pix_comissao || 'Não cadastrada'}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-8 py-5">
                    <Badge tone={prof.ativo ? 'success' : 'destructive'} variant="soft">
                      <span className={`w-1.5 h-1.5 rounded-full ${prof.ativo ? 'bg-success' : 'bg-destructive'}`} />
                      {prof.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </td>

                  {/* Ações */}
                  {podeGerenciar && (
                    <td className="px-8 py-5">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Editar"
                          onClick={() => abrirModalEditar(prof)}
                        >
                          <Edit2 size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Alterar status"
                          className="hover:text-primary hover:bg-primary-soft"
                          onClick={() => { setProfSelecionado(prof); modalStatus.abrir(); }}
                        >
                          <ShieldAlert size={16} />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-20">
            <EmptyState
              icon={<Users size={28} />}
              title="Nenhum professor encontrado"
              description={podeGerenciar
                ? 'Comece cadastrando seu primeiro professor.'
                : 'Ainda não há professores cadastrados neste estúdio.'}
            />
          </div>
        )}
      </Surface>

      {/* Modal Formulário */}
      <Modal
        aberto={modalForm.aberto}
        fechar={modalForm.fechar}
        title={formProfessor.id ? 'Editar Professor' : 'Cadastrar Professor'}
        size="md"
      >
        <form onSubmit={handleSalvar} className="space-y-5">

          <div>
            <Label required>Nome Completo</Label>
            <Input
              required
              placeholder="Nome do Professor"
              value={formProfessor.nome}
              onChange={(e) => setFormProfessor({ ...formProfessor, nome: e.target.value })}
            />
          </div>

          <div>
            <Label>E-mail (Gera acesso automático)</Label>
            <Input
              type="email"
              placeholder="email@exemplo.com"
              value={formProfessor.email}
              onChange={(e) => setFormProfessor({ ...formProfessor, email: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Telefone</Label>
              <Input
                placeholder="(00) 00000-0000"
                value={formProfessor.telefone}
                onChange={(e) => setFormProfessor({ ...formProfessor, telefone: e.target.value })}
              />
            </div>
            <div>
              <Label>Chave PIX</Label>
              <Input
                placeholder="Para repasses"
                value={formProfessor.pix_comissao}
                onChange={(e) => setFormProfessor({ ...formProfessor, pix_comissao: e.target.value })}
              />
            </div>
          </div>

          <Modal.Footer>
            <Button variant="outline" onClick={modalForm.fechar} type="button">
              Cancelar
            </Button>
            <Button variant="brand" size="lg" loading={saving} fullWidth type="submit" disabled={!idEfetivo}>
              {formProfessor.id ? 'Atualizar Cadastro' : 'Concluir e Criar Acesso'}
            </Button>
          </Modal.Footer>
        </form>
      </Modal>

      {/* Modal Confirmação de Status */}
      <Modal
        aberto={modalStatus.aberto}
        fechar={modalStatus.fechar}
        title={profSelecionado?.ativo ? 'Desativar Professor?' : 'Reativar Professor?'}
        size="sm"
      >
        <p className="text-sm text-muted-foreground">
          Tem certeza que deseja{' '}
          <strong>{profSelecionado?.ativo ? 'desativar' : 'reativar'}</strong> o acesso de{' '}
          <strong>{profSelecionado?.nome}</strong>?
        </p>
        <Modal.Footer>
          <Button variant="outline" onClick={modalStatus.fechar}>
            Cancelar
          </Button>
          <Button
            variant={profSelecionado?.ativo ? 'destructive' : 'success'}
            onClick={alternarStatus}
          >
            {profSelecionado?.ativo ? 'Desativar' : 'Reativar'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}