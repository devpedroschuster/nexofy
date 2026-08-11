// webapp/src/pages/ConfiguracoesCamposAluno.jsx
import React, { useState } from 'react';
import { ListPlus, Plus, Edit2, RefreshCw, EyeOff, Eye, GripVertical } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import {
  useCamposDinamicosAdmin,
  useCriarCampoDinamico,
  useAtualizarCampoDinamico,
  useDesativarCampoDinamico,
  useReativarCampoDinamico,
} from '../hooks/useCamposDinamicos';
import { campoDinamicoSchema } from '../lib/campoDinamicoValidation';
import Input, { Label, FormField } from '../components/ui/Input';
import Button from '../components/ui/Button';
import Surface from '../components/ui/Surface';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
import Badge from '../components/ui/Badge';

const CAMPO_VAZIO = {
  field_name: '',
  label: '',
  field_type: 'text',
  opcoes: [],
  is_required: false,
};

const TIPOS = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'boolean', label: 'Sim/Não' },
  { value: 'select', label: 'Seleção (opções)' },
  { value: 'file', label: 'Arquivo' },
];

// Formulário compartilhado entre "criar" e "editar" — evita duplicar a
// lógica de opções/validação nos dois modais.
function FormCampo({ valor, onChange, erros }) {
  const isSelect = valor.field_type === 'select';
  const opcoesTexto = (valor.opcoes ?? []).join(', ');

  return (
    <div className="space-y-4">
      <FormField label="Identificador (field_name)" htmlFor="field_name" required error={erros.field_name}
        hint="snake_case, ex: pe_dominante">
        <Input
          id="field_name"
          value={valor.field_name}
          onChange={(e) => onChange({ ...valor, field_name: e.target.value.toLowerCase() })}
          disabled={Boolean(valor.id)} // imutável após criação — ver camposDinamicosService.atualizar
          placeholder="pe_dominante"
        />
      </FormField>
      {valor.id && (
        <p className="text-xs text-muted-foreground -mt-2">
          O identificador não pode ser alterado após a criação, pois alunos já podem ter valor gravado sob esse nome.
        </p>
      )}

      <FormField label="Rótulo exibido" htmlFor="label" required error={erros.label}>
        <Input
          id="label"
          value={valor.label}
          onChange={(e) => onChange({ ...valor, label: e.target.value })}
          placeholder="Pé dominante"
        />
      </FormField>

      <FormField label="Tipo do campo" htmlFor="field_type" required error={erros.field_type}>
        <Input
          as="select"
          id="field_type"
          value={valor.field_type}
          onChange={(e) => onChange({ ...valor, field_type: e.target.value })}
        >
          {TIPOS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </Input>
      </FormField>

      {isSelect && (
        <FormField label="Opções (separadas por vírgula)" htmlFor="opcoes" required error={erros.opcoes}>
          <Input
            id="opcoes"
            value={opcoesTexto}
            onChange={(e) => onChange({
              ...valor,
              opcoes: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
            })}
            placeholder="Esquerdo, Direito, Ambidestro"
          />
        </FormField>
      )}

      <label className="flex items-center gap-2.5 py-1 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={valor.is_required}
          onChange={(e) => onChange({ ...valor, is_required: e.target.checked })}
          className="h-4 w-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
        />
        <span className="text-sm font-medium text-foreground">Obrigatório no cadastro</span>
      </label>
    </div>
  );
}

async function validar(campo) {
  try {
    await campoDinamicoSchema.validate(campo, { abortEarly: false });
    return {};
  } catch (err) {
    const erros = {};
    (err.inner ?? []).forEach((e) => {
      if (e.path && !erros[e.path]) erros[e.path] = e.message;
    });
    return erros;
  }
}

export default function ConfiguracoesCamposAluno() {
  const { perfil } = useAuth();
  const podeEditar = perfil === 'admin' || perfil === 'super_admin';

  const { campos, loading, isError } = useCamposDinamicosAdmin('aluno');
  const criar = useCriarCampoDinamico('aluno');
  const atualizar = useAtualizarCampoDinamico('aluno');
  const desativar = useDesativarCampoDinamico('aluno');
  const reativar = useReativarCampoDinamico('aluno');

  const [modalAberto, setModalAberto] = useState(false);
  const [campoEmEdicao, setCampoEmEdicao] = useState(null); // null = criando novo
  const [erros, setErros] = useState({});
  const [alternandoId, setAlternandoId] = useState(null);

  const camposAtivos = campos.filter((c) => c.is_active);
  const camposInativos = campos.filter((c) => !c.is_active);

  function abrirCriacao() {
    setCampoEmEdicao({ ...CAMPO_VAZIO });
    setErros({});
    setModalAberto(true);
  }

  function abrirEdicao(campo) {
    setCampoEmEdicao({ ...campo });
    setErros({});
    setModalAberto(true);
  }

  async function handleSalvar() {
    const validado = await validar(campoEmEdicao);
    setErros(validado);
    if (Object.keys(validado).length > 0) return;

    const acao = campoEmEdicao.id
      ? atualizar.mutateAsync({ id: campoEmEdicao.id, dados: campoEmEdicao })
      : criar.mutateAsync(campoEmEdicao);

    try {
      await acao;
      setModalAberto(false);
      setCampoEmEdicao(null);
    } catch {
      // toast de erro já é disparado dentro dos hooks (Fase 5) — nada a fazer aqui.
    }
  }

  async function handleAlternarAtivo(campo) {
    setAlternandoId(campo.id);
    try {
      await (campo.is_active ? desativar.mutateAsync(campo.id) : reativar.mutateAsync(campo.id));
    } finally {
      setAlternandoId(null);
    }
  }

  const salvando = criar.isPending || atualizar.isPending;

  function CardCampo({ campo }) {
    const tipoLabel = TIPOS.find((t) => t.value === campo.field_type)?.label ?? campo.field_type;
    return (
      <Surface
        variant="card"
        padding="lg"
        className={`flex items-center justify-between gap-4 ${!campo.is_active ? 'opacity-60' : ''}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <GripVertical size={16} className="text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <p className="font-black text-foreground truncate">{campo.label}</p>
            <p className="text-xs text-muted-foreground font-medium flex items-center gap-2 flex-wrap">
              <code className="bg-muted px-1.5 py-0.5 rounded">{campo.field_name}</code>
              <Badge variant="soft" tone="neutral">{tipoLabel}</Badge>
              {campo.is_required && <Badge variant="soft" tone="warning">Obrigatório</Badge>}
              {!campo.is_active && <Badge variant="soft" tone="destructive">Inativo</Badge>}
            </p>
          </div>
        </div>

        {podeEditar && (
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => abrirEdicao(campo)}>
              <Edit2 size={14} />
            </Button>
            <Button
              variant={campo.is_active ? 'outline' : 'brand'}
              size="sm"
              loading={alternandoId === campo.id}
              onClick={() => handleAlternarAtivo(campo)}
              title={campo.is_active ? 'Desativar campo' : 'Reativar campo'}
            >
              {campo.is_active ? <EyeOff size={14} /> : <Eye size={14} />}
            </Button>
          </div>
        )}
      </Surface>
    );
  }

  return (
    <div className="p-8 space-y-8 animate-in fade-in">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-black text-foreground">Campos Personalizados de Aluno</h1>
          <p className="text-muted-foreground">
            Adicione campos extras ao cadastro de aluno, além dos campos padrão do sistema.
          </p>
        </div>
        {podeEditar && (
          <Button variant="brand" onClick={abrirCriacao}>
            <Plus size={18} /> Novo Campo
          </Button>
        )}
      </div>

      {loading && <p className="text-muted-foreground font-medium">Carregando campos...</p>}
      {isError && (
        <p className="text-destructive font-medium">Erro ao carregar campos. Tente recarregar a página.</p>
      )}

      {!loading && !isError && campos.length === 0 && (
        <EmptyState
          icon={<ListPlus size={32} />}
          title="Nenhum campo personalizado ainda"
          description="Crie o primeiro campo para customizar o cadastro de aluno deste estúdio."
        />
      )}

      {camposAtivos.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-black text-muted-foreground uppercase">Ativos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {camposAtivos.map((campo) => <CardCampo key={campo.id} campo={campo} />)}
          </div>
        </div>
      )}

      {camposInativos.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-black text-muted-foreground uppercase">Inativos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {camposInativos.map((campo) => <CardCampo key={campo.id} campo={campo} />)}
          </div>
        </div>
      )}

      <Modal
        aberto={modalAberto}
        fechar={() => setModalAberto(false)}
        title={campoEmEdicao?.id ? 'Editar Campo' : 'Novo Campo'}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalAberto(false)}>Cancelar</Button>
            <Button variant="brand" loading={salvando} onClick={handleSalvar}>Salvar</Button>
          </>
        }
      >
        {campoEmEdicao && (
          <FormCampo valor={campoEmEdicao} onChange={setCampoEmEdicao} erros={erros} />
        )}
      </Modal>
    </div>
  );
}