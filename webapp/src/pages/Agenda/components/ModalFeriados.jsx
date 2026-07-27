import React from 'react';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import { ModalConfirmacao } from '../../../components/ui/Modal';
import Input from '../../../components/ui/Input';
import Button from '../../../components/ui/Button';

function FeriadoItem({ feriado, onExcluir }) {
  return (
    <li className="flex justify-between items-center p-3 bg-destructive-soft text-destructive rounded-xl border border-destructive/20">
      <div>
        <span className="font-black text-sm block">
          {new Date(feriado.data + 'T12:00:00').toLocaleDateString('pt-BR')}
        </span>
        <span className="text-xs opacity-90">{feriado.descricao}</span>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="text-destructive hover:bg-destructive/10"
        onClick={() => onExcluir(feriado.id)}
        aria-label={`Remover bloqueio de ${feriado.descricao}`}
      >
        <Trash2 size={18} />
      </Button>
    </li>
  );
}

export default function ModalFeriados({
  feriados, novoFeriado, setNovoFeriado, savingFeriado, salvarFeriado,
  feriadoParaExcluir, solicitarExclusao, confirmarExclusao, cancelarExclusao
}) {
  // Defensive: nunca confia cegamente que o pai sempre entrega um array.
  const listaFeriados = feriados ?? [];
  const hoje = new Date().toISOString().split('T')[0];

  const handleDescricaoBlur = (e) => {
    const valorLimpo = e.target.value.trim();
    if (valorLimpo !== e.target.value) {
      setNovoFeriado({ ...novoFeriado, descricao: valorLimpo });
    }
  };

  return (
    <div className="space-y-6 pt-2">
      <form onSubmit={salvarFeriado} className="flex gap-2">
        <Input
          type="date"
          required
          min={hoje}
          value={novoFeriado.data}
          onChange={e => setNovoFeriado({ ...novoFeriado, data: e.target.value })}
          wrapperClassName="w-40"
        />
        <Input
          type="text"
          required
          placeholder="Motivo (ex: Feriado Nacional)"
          value={novoFeriado.descricao}
          onChange={e => setNovoFeriado({ ...novoFeriado, descricao: e.target.value })}
          onBlur={handleDescricaoBlur}
        />
        <Button
          type="submit"
          variant="primary"
          size="icon"
          loading={savingFeriado}
        >
          {savingFeriado ? <RefreshCw className="animate-spin" size={18} /> : <Plus size={18} />}
        </Button>
      </form>

      <div>
        <h4 className="font-bold text-sm text-foreground mb-3">Bloqueios Futuros</h4>
        {listaFeriados.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum bloqueio cadastrado.</p>
        ) : (
          <ul className="space-y-2">
            {listaFeriados.map(f => (
              <FeriadoItem key={f.id} feriado={f} onExcluir={solicitarExclusao} />
            ))}
          </ul>
        )}
      </div>

      <ModalConfirmacao
        aberto={!!feriadoParaExcluir}
        onClose={cancelarExclusao}
        onConfirm={confirmarExclusao}
        titulo="Remover Bloqueio"
        mensagem="Tem certeza que deseja remover este bloqueio da agenda?"
        tipo="danger"
      />
    </div>
  );
}